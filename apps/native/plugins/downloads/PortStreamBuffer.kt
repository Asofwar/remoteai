package com.codexswitch.downloads

import java.nio.ByteBuffer
import java.util.TreeMap

/** A receive window includes both queued bytes and a batch currently blocked in the socket writer. */
internal class PortStreamBuffer {
  companion object {
    const val WINDOW_BYTES = 2 * 1024 * 1024
    private const val MAX_FRAGMENTS = 4096
    private const val MAX_FRAME_BYTES = 16384 - 72 - 16
    private const val MAX_BATCH_BYTES = 384 * 1024
    private const val HEADER_BYTES = 9
    private const val MAX_POSITION = 9007199254740991L
    const val DATA = 1
    const val END = 4
  }
  private val pending = TreeMap<Long, ByteArray>()
  private var scheduled = 0L
  private var end: Long? = null
  var consumed = 0L
    private set
  val eof get() = end == consumed

  fun receive(frame: ByteArray) {
    require(frame.size in HEADER_BYTES..MAX_FRAME_BYTES)
    val offset = ByteBuffer.wrap(frame).getLong(1)
    require(offset in 0..MAX_POSITION)
    when (frame[0].toInt()) {
      DATA -> insert(offset, frame.copyOfRange(HEADER_BYTES, frame.size))
      END -> { require(frame.size == HEADER_BYTES); finish(offset) }
      else -> error("Unexpected stream frame")
    }
  }

  private fun insert(offset: Long, data: ByteArray) {
    val limit = offset + data.size
    require(data.isNotEmpty() && limit <= MAX_POSITION && limit <= consumed + WINDOW_BYTES)
    require(end == null || limit <= checkNotNull(end))
    var cursor = maxOf(offset, scheduled)
    val gaps = mutableListOf<Pair<Long, ByteArray>>()
    var entry = pending.floorEntry(cursor) ?: pending.ceilingEntry(cursor)
    while (cursor < limit && entry != null && entry.key < limit) {
      if (entry.key > cursor) gaps.add(cursor to data.copyOfRange((cursor - offset).toInt(),
        (minOf(entry.key, limit) - offset).toInt()))
      cursor = maxOf(cursor, entry.key + entry.value.size)
      entry = pending.higherEntry(entry.key)
    }
    if (cursor < limit) gaps.add(cursor to data.copyOfRange((cursor - offset).toInt(), data.size))
    require(pending.size + gaps.size <= MAX_FRAGMENTS)
    for ((start, bytes) in gaps) pending[start] = bytes
  }

  private fun finish(offset: Long) {
    require(offset >= scheduled && offset <= consumed + WINDOW_BYTES && (end == null || end == offset))
    pending.lastEntry()?.let { require(it.key + it.value.size <= offset) }
    end = offset
  }

  fun take(): ByteArray? {
    check(scheduled == consumed) // Exactly one socket write may be in flight.
    var limit = scheduled
    while (true) {
      val next = pending[limit] ?: break
      if (limit - scheduled + next.size > MAX_BATCH_BYTES) break
      limit += next.size
    }
    if (limit == scheduled) return null
    val batch = ByteArray((limit - scheduled).toInt())
    var position = 0
    while (scheduled < limit) {
      val bytes = checkNotNull(pending.remove(scheduled))
      bytes.copyInto(batch, position)
      position += bytes.size; scheduled += bytes.size
    }
    return batch
  }

  fun written(count: Int) { check(consumed + count == scheduled); consumed = scheduled }
  fun clear() { pending.clear() }
}
