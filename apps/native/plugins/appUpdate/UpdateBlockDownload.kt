package com.codexswitch.update

import android.os.SystemClock
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Small jobs let fast sources take more work; failed jobs leave completed file ranges intact. */
internal class UpdateBlockDownload(
  private val context: ReactApplicationContext, private val files: UpdateFiles, private val input: JSONObject,
  private val progress: UpdateDownloadProgress,
) {
  private data class Result(val source: Int, val block: Int, val bytes: ByteArray?, val ready: Boolean = false)
  private val configs = input.getJSONArray("configs").also { require(it.length() in 0..3) }
  private val size = input.getLong("size").also { require(it in 1..MAX_UPDATE_BYTES) }
  private val count = ((size + UPDATE_BLOCK_BYTES - 1) / UPDATE_BLOCK_BYTES).toInt()
  private val plan = UpdateBlockPlan(count, configs.length() + 1)
  private val sessions = (0 until configs.length()).map { index ->
    UpdateBlockSession("update-${UUID.randomUUID()}", files, input, configs.getJSONObject(index))
  }
  private val ready = BooleanArray(configs.length() + 1)
  private val origin = UpdateOriginBlocks(files, input)
  private val executor = Executors.newFixedThreadPool(configs.length() + 1)
  private val tasks = ExecutorCompletionService<Result>(executor)
  private var pending = 0

  fun download(): String {
    require(configs.length() in 0..3 && size in 1..MAX_UPDATE_BYTES)
    require(files.artifact(input) == input.getString("artifact"))
    try {
      UpdateCheckpoint(files, input).use { checkpoint ->
        plan.restore(checkpoint.restored)
        progress.restore(checkpoint.receivedBytes)
        sessions.indices.forEach { source -> submit(source, -1) { sessions[source].open(); null } }
        submit(sessions.size, -1) { if (sessions.isNotEmpty()) Thread.sleep(2_000); null }
        val deadline = SystemClock.elapsedRealtime() + 20 * 60_000
        while (!plan.complete() && pending > 0 && SystemClock.elapsedRealtime() < deadline) {
          val result = tasks.poll(250, TimeUnit.MILLISECONDS)?.get()
          if (result != null) { pending--; accept(result, checkpoint) }
          checkpoint.flushIfDue()
          progress.publish()
          schedule()
        }
        check(plan.complete())
        progress.publish(verifying = true)
        return checkpoint.finish()
      }
    } finally {
      executor.shutdownNow()
      while (!executor.awaitTermination(1, TimeUnit.SECONDS)) { /* Wait before deleting a destination still in use. */ }
      try { origin.close() } finally { sessions.forEach { it.close() } }
    }
  }

  private fun submit(source: Int, index: Int, action: () -> ByteArray?) {
    pending++
    tasks.submit(Callable {
      try { Result(source, index, action(), index == -1) }
      catch (_: Exception) { Result(source, index, null) }
    })
  }

  private fun accept(result: Result, checkpoint: UpdateCheckpoint) {
    if (result.ready) { ready[result.source] = true; return }
    val bytes = result.bytes
    if (bytes == null) {
      plan.fail(result.source)
      if (result.source < sessions.size) {
        sessions[result.source].close()
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("updateSharingFailure", configs.getJSONObject(result.source).getString("sessionId"))
      }
      return
    }
    if (!plan.finish(result.source, result.block)) return
    checkpoint.write(result.block, bytes)
    progress.advance(bytes.size.toLong())
  }

  private fun schedule() {
    ready.indices.forEach { source ->
      if (!ready[source]) return@forEach
      // Peers fill from the end, leaving the official stream a continuous range from the start.
      val index = plan.claim(source, SystemClock.elapsedRealtime(), fromEnd = source < sessions.size) ?: return@forEach
      submit(source, index) {
        if (source == sessions.size) origin.block(index) else sessions[source].block(index)
      }
    }
  }
}
