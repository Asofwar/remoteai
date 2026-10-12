package com.codexswitch.update

internal const val UPDATE_BLOCK_BYTES = 512 * 1024

/** Origin and peer workers share checkpoints while claiming opposite ends of the remaining file. */
internal class UpdateBlockPlan(blocks: Int, sources: Int) {
  private val done = BooleanArray(blocks)
  private val busy = Array(sources) { mutableListOf<Pair<Int, Long>>() }
  private val windows = IntArray(sources) { 1 }
  private val failed = BooleanArray(sources)
  fun complete() = done.all { it }
  fun restore(previous: BooleanArray) { require(previous.size == done.size); previous.copyInto(done) }
  fun fail(source: Int) { busy[source].clear(); failed[source] = true }
  fun revive(source: Int) { failed[source] = false }
  fun window(source: Int, size: Int) { windows[source] = size.coerceIn(1, MAX_UPDATE_REQUESTS) }
  fun finish(source: Int, index: Int): Boolean {
    busy[source].removeAll { it.first == index }
    if (done[index]) return false
    done[index] = true
    return true
  }
  fun claim(source: Int, now: Long, fromEnd: Boolean = false): Int? {
    if (failed[source] || busy[source].size >= windows[source]) return null
    val candidates = if (fromEnd) done.indices.reversed() else done.indices
    val assigned = busy.flatMap { it }
    val pending = candidates.firstOrNull { index -> !done[index] && assigned.none { it.first == index } }
    val steal = assigned.firstOrNull { (index, started) ->
      !done[index] && busy[source].none { it.first == index } && now - started >= REASSIGN_AFTER_MS &&
        assigned.count { it.first == index } == 1
    }?.first
    val index = pending ?: steal ?: return null
    busy[source].add(index to now)
    return index
  }

  private companion object { const val REASSIGN_AFTER_MS = 2_000 }
}
