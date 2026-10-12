package com.codexswitch.update

internal const val MAX_UPDATE_REQUESTS = 8

/** Keep about a second of work queued, with a strict per-peer memory/request bound. */
internal class UpdateRequestWindow(private val maximum: Int) {
  var size = minOf(2, maximum.coerceIn(1, MAX_UPDATE_REQUESTS))
    private set

  fun observe(bytes: Long, elapsed: Long) {
    val blocks = (bytes * 1_000 / elapsed.coerceAtLeast(1) + UPDATE_BLOCK_BYTES - 1) / UPDATE_BLOCK_BYTES
    size = blocks.coerceIn(minOf(2, maximum).toLong(), maximum.toLong()).toInt()
  }
}
