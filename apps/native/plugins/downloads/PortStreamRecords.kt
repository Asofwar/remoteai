package com.codexswitch.downloads

import java.nio.ByteBuffer
import java.net.Socket
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicBoolean

/** Bounded records; decryption happens on the poll worker, never the transport callback or JS thread. */
internal object PortStreamRecords {
  private const val MAX_ROUTES = 8
  private const val MAX_QUEUED_BYTES = 64 * 1024 * 1024
  private const val MAX_RECORDS = MAX_QUEUED_BYTES / 16384
  private data class Record(val bytes: ByteArray, val path: String)
  data class DecodedRecord(val bytes: ByteArray, val path: String, val requestId: String)
  data class PollResult(val records: List<DecodedRecord>, val progress: List<PortStreamSinks.Progress>)
  data class SinkTarget(val requestId: String, val socket: Socket)
  private class Route(val owner: String, val epoch: UUID, val cipher: PortStreamCipher) {
    val queue = LinkedBlockingQueue<Record>(MAX_RECORDS)
    val delivery = PortStreamDelivery()
    val notified = AtomicBoolean(false)
    val sinks = PortStreamSinks {
      // Coalesce writer notifications, waking a pending poll without charging the byte budget.
      if (notified.compareAndSet(false, true)) queue.offer(Record(byteArrayOf(), ""))
    }
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

  fun poll(owner: String, id: String): PollResult {
    val route = route(owner, id)
    val records = mutableListOf<Record>()
    route.queue.poll(250, TimeUnit.MILLISECONDS)?.let { records.add(it) }
    route.queue.drainTo(records, 63)
    queued.addAndGet(-records.sumOf { it.bytes.size })
    route.notified.set(false)
    check(!route.closed)
    try {
      val decoded = records.mapNotNull { record ->
        if (record.bytes.isEmpty()) return@mapNotNull null
        val frame = route.cipher.decrypt(record.bytes) ?: return@mapNotNull null
        if (route.sinks.receive(frame) || !route.delivery.keep(frame)) return@mapNotNull null
        DecodedRecord(frame.bytes, record.path, frame.id)
      }
      return PollResult(decoded, route.sinks.drain()).also { check(!route.closed) }
    } catch (error: Exception) { synchronized(route) { clear(route) }; throw error }
  }

  fun bind(owner: String, id: String, target: SinkTarget) {
    UUID.fromString(target.requestId)
    val route = route(owner, id)
    synchronized(route) { check(!route.closed); route.sinks.bind(target.requestId, target.socket) }
  }

  fun unbind(owner: String, id: String, request: String) {
    val route = routes[UUID.fromString(id)] ?: return
    check(route.owner == owner)
    route.sinks.unbind(request)
  }

  private fun route(owner: String, id: String): Route = requireNotNull(routes[UUID.fromString(id)]).also {
    check(it.owner == owner && !it.closed)
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
    route.sinks.close()
    route.delivery.clear()
    val discarded = mutableListOf<Record>(); route.queue.drainTo(discarded)
    queued.addAndGet(-discarded.sumOf { it.bytes.size })
  }
}
