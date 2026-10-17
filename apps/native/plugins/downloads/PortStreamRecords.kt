package com.codexswitch.downloads

import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Bounded records; decryption happens on the poll worker, never the transport callback or JS thread. */
internal object PortStreamRecords {
  private const val MAX_ROUTES = 8
  private const val MAX_QUEUED_BYTES = 64 * 1024 * 1024
  private const val MAX_RECORDS = MAX_QUEUED_BYTES / 16384
  private data class Record(val bytes: ByteArray, val path: String)
  data class DecodedRecord(val bytes: ByteArray, val path: String, val requestId: String)
  private class Route(val owner: String, val epoch: UUID, val cipher: PortStreamCipher) {
    val queue = LinkedBlockingQueue<Record>(MAX_RECORDS)
    @Volatile var closed = false
  }
  private val routes = ConcurrentHashMap<UUID, Route>()
  private val queued = AtomicInteger(0)

  fun register(owner: String, id: String, epoch: String, key: String) {
    val transfer = UUID.fromString(id); val generation = UUID.fromString(epoch)
    val cipher = PortStreamCipher(key, transfer, generation)
    try {
      synchronized(routes) {
        require(routes.size < MAX_ROUTES)
        check(routes.putIfAbsent(transfer, Route(owner, generation, cipher)) == null)
      }
    } catch (error: Exception) { cipher.close(); throw error }
  }

  fun receive(input: ByteBuffer, path: String): Boolean {
    val buffer = input.duplicate()
    if (buffer.remaining() !in 89..16384 || buffer.int != 0x52414231) return false
    buffer.position(input.position() + 8)
    val route = routes[UUID(buffer.long, buffer.long)] ?: return false
    if (UUID(buffer.long, buffer.long) != route.epoch) return true
    synchronized(route) {
      if (route.closed) return true
      val length = input.remaining()
      if (queued.addAndGet(length) > MAX_QUEUED_BYTES) {
        queued.addAndGet(-length); clear(route); return true
      }
      val bytes = ByteArray(length); input.duplicate().get(bytes)
      if (!route.queue.offer(Record(bytes, path))) { queued.addAndGet(-length); clear(route) }
    }
    return true
  }

  fun poll(owner: String, id: String): List<DecodedRecord> {
    val route = requireNotNull(routes[UUID.fromString(id)])
    check(route.owner == owner && !route.closed)
    val first = route.queue.poll(250, TimeUnit.MILLISECONDS) ?: return emptyList()
    val records = mutableListOf(first)
    route.queue.drainTo(records, 15)
    queued.addAndGet(-records.sumOf { it.bytes.size })
    check(!route.closed)
    try {
      return records.mapNotNull { record ->
        route.cipher.decrypt(record.bytes)?.let { DecodedRecord(it.bytes, record.path, it.id) }
      }.also { check(!route.closed) }
    } catch (error: Exception) { synchronized(route) { clear(route) }; throw error }
  }

  fun remove(owner: String, id: String) {
    val key = UUID.fromString(id)
    val route = routes[key] ?: return
    check(route.owner == owner)
    if (routes.remove(key, route)) synchronized(route) { clear(route) }
  }
  fun close(owner: String) { routes.entries.filter { it.value.owner == owner }.forEach { remove(owner, it.key.toString()) } }
  private fun clear(route: Route) {
    route.closed = true
    route.cipher.close()
    val discarded = mutableListOf<Record>(); route.queue.drainTo(discarded)
    queued.addAndGet(-discarded.sumOf { it.bytes.size })
  }
}
