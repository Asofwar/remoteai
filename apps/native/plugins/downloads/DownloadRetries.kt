package com.codexswitch.downloads

private val RETRY_DELAYS_MS = listOf(1000L, 2000L, 4000L, 8000L, 16000L)

/** Volatile intent: app restarts and explicit pauses never restart transfers automatically. */
internal class DownloadRetries {
  private val attempts = mutableMapOf<String, Int>()
  private val waiting = mutableMapOf<String, Long>()

  fun defer(task: DownloadTask, now: Long): Boolean {
    val count = attempts[task.id] ?: 0
    val delay = RETRY_DELAYS_MS.getOrNull(count) ?: return false
    attempts[task.id] = count + 1
    waiting[task.id] = now + delay
    return true
  }

  fun waiting(id: String) = waiting.containsKey(id)
  fun releaseReady(now: Long): Boolean = waiting.entries.removeAll { it.value <= now }
  fun clear(id: String) { attempts.remove(id); waiting.remove(id) }
}
