package com.codexswitch.downloads

import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Bounded encrypted records for JS port streams; native file downloads retain their own writer. */
internal object PortStreamRecords {
  private const val MAX_ROUTES = 8
  private const val MAX_QUEUED_BYTES = 64 * 1024 * 1024
  private const val MAX_RECORDS = MAX_QUEUED_BYTES / 16384
  data class Record(val bytes: ByteArray, val path: String)
  private class Route(val owner: String, val epoch: UUID) {
    val queue = LinkedBlockingQueue<Record>(MAX_RECORDS)
    @Volatile var closed = false
  }
  private val routes = ConcurrentHashMap<UUID, Route>()
  private val queued = AtomicInteger(0)

  fun register(owner: String, id: String, epoch: String) {
    synchronized(routes) {
      require(routes.size < MAX_ROUTES)
      check(routes.putIfAbsent(UUID.fromString(id), Route(owner, UUID.fromString(epoch))) == null)
    }
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

  fun poll(owner: String, id: String): List<Record> {
    val route = requireNotNull(routes[UUID.fromString(id)])
    check(route.owner == owner && !route.closed)
    val first = route.queue.poll(250, TimeUnit.MILLISECONDS) ?: return emptyList()
    val records = mutableListOf(first)
    route.queue.drainTo(records, 15)
    queued.addAndGet(-records.sumOf { it.bytes.size })
    check(!route.closed)
    return records
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
    val discarded = mutableListOf<Record>(); route.queue.drainTo(discarded)
    queued.addAndGet(-discarded.sumOf { it.bytes.size })
  }
}
