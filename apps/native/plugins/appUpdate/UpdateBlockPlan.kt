package com.codexswitch.update

internal const val UPDATE_BLOCK_BYTES = 512 * 1024

/** Origin and peer workers share checkpoints while claiming opposite ends of the remaining file. */
internal class UpdateBlockPlan(blocks: Int, sources: Int) {
  private val done = BooleanArray(blocks)
  private val busy = arrayOfNulls<Pair<Int, Long>>(sources)
  private val failed = BooleanArray(sources)
  fun complete() = done.all { it }
  fun restore(previous: BooleanArray) { require(previous.size == done.size); previous.copyInto(done) }
  fun fail(source: Int) { busy[source] = null; failed[source] = true }
  fun finish(source: Int, index: Int): Boolean {
    busy[source] = null
    if (done[index]) return false
    done[index] = true
    return true
  }
  fun claim(source: Int, now: Long, fromEnd: Boolean = false): Int? {
    if (failed[source] || busy[source] != null) return null
    val candidates = if (fromEnd) done.indices.reversed() else done.indices
    val pending = candidates.firstOrNull { index -> !done[index] && busy.none { it?.first == index } }
    val steal = busy.filterNotNull().firstOrNull { (index, started) ->
      !done[index] && now - started >= REASSIGN_AFTER_MS && busy.count { it?.first == index } == 1
    }?.first
    val index = pending ?: steal ?: return null
    busy[source] = index to now
    return index
  }

  private companion object { const val REASSIGN_AFTER_MS = 2_000 }
}
