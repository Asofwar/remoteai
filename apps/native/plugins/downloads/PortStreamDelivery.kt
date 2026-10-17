package com.codexswitch.downloads

import java.nio.ByteBuffer

/** Drop already delivered stream bytes before Base64/JS conversion, including freshly encrypted retries. */
internal class PortStreamDelivery {
  companion object {
    private const val DATA = 1
    private const val CLOSE = 5
    private const val FRAME_HEADER_BYTES = 9
    private const val MAX_SAFE_POSITION = 9007199254740991L
    // The link allows 24 live sockets. Bound history too when close frames are lost or sockets are idle.
    private const val MAX_TRACKED_STREAMS = 128
  }
  private val delivered = object : LinkedHashMap<String, Long>(MAX_TRACKED_STREAMS, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?) = size > MAX_TRACKED_STREAMS
  }

  @Synchronized fun keep(frame: PortStreamCipher.Frame): Boolean {
    val bytes = frame.bytes
    if (bytes.size == 1 && bytes[0].toInt() == CLOSE) delivered.remove(frame.id)
    if (bytes[0].toInt() != DATA) return true
    require(bytes.size > FRAME_HEADER_BYTES)
    val start = ByteBuffer.wrap(bytes).getLong(1)
    val end = start + bytes.size - FRAME_HEADER_BYTES
    require(start in 0..MAX_SAFE_POSITION && end in 0..MAX_SAFE_POSITION)
    val contiguous = delivered[frame.id] ?: 0L
    if (end <= contiguous) return false
    // Leave gaps, overlaps and window validation to the shared stream receiver. Only suppress bytes
    // known to have crossed this bridge; never advance over missing data on another live path.
    if (start <= contiguous) delivered[frame.id] = end
    return true
  }

  @Synchronized fun clear() { delivered.clear() }
}
