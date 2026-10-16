package com.codexswitch.update

import android.os.SystemClock
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Each source owns a bounded request window; only the coordinator commits completed blocks. */
internal class UpdateBlockDownload(
  private val context: ReactApplicationContext, private val files: UpdateFiles, private val input: JSONObject,
  private val progress: UpdateDownloadProgress,
) {
  private data class Result(val source: Int, val block: Int = -1, val bytes: ByteArray? = null,
    val error: Exception? = null)
  private val size = input.getLong("size").also { require(it in 1..MAX_UPDATE_BYTES) }
  private val count = ((size + UPDATE_BLOCK_BYTES - 1) / UPDATE_BLOCK_BYTES).toInt()
  private val plan = UpdateBlockPlan(count, SOURCE_COUNT)
  private val sessions = arrayOfNulls<UpdateBlockSession>(MAX_PEERS)
  private val configs = arrayOfNulls<JSONObject>(MAX_PEERS)
  private val waiting = ConcurrentLinkedQueue<JSONObject>()
  private val knownSessions = mutableSetOf<String>()
  private val ready = BooleanArray(SOURCE_COUNT)
  private val origin = UpdateOriginBlocks(files, input)
  private val mirror = input.optString("mirrorUrl").takeIf { it.isNotEmpty() }
    ?.let { UpdateOriginBlocks(files, input, it) }
  private val executor = Executors.newFixedThreadPool(SOURCE_COUNT)
  private val results = ArrayBlockingQueue<Result>(MAX_UPDATE_REQUESTS * MAX_PEERS + SOURCE_COUNT)
  private var originAttempts = 0
  @Volatile private var closed = false

  @Synchronized fun addPeers(artifact: String, offered: JSONArray): Boolean {
    if (closed || artifact != input.getString("artifact") || offered.length() > MAX_PEERS) return false
    val candidates = (0 until offered.length()).map { offered.getJSONObject(it) }
    if (waiting.size + candidates.size > MAX_PEERS) return false
    candidates.forEach { config ->
      val id = config.getString("sessionId")
      require(id.startsWith("update-") && config.optInt("packageProtocol") >= 2 && !config.getBoolean("desktop"))
      if (knownSessions.add(id)) waiting.add(config)
    }
    return true
  }

  fun download(): String {
    require(files.artifact(input) == input.getString("artifact"))
    check(addPeers(input.getString("artifact"), input.getJSONArray("configs")))
    try {
      UpdateCheckpoint(files, input).use { checkpoint ->
        plan.restore(checkpoint.restored)
        progress.restore(checkpoint.receivedBytes)
        fillPeers()
        startOrigin()
        if (mirror != null) submit(MIRROR) {}
        return transfer(checkpoint)
      }
    } finally { close() }
  }

  private fun transfer(checkpoint: UpdateCheckpoint): String {
    val deadline = SystemClock.elapsedRealtime() + 20 * 60_000
    var lastProgress = SystemClock.elapsedRealtime()
    while (!plan.complete() && SystemClock.elapsedRealtime() < deadline) {
      val result = results.poll(100, TimeUnit.MILLISECONDS)
      if (result != null && accept(result, checkpoint)) lastProgress = SystemClock.elapsedRealtime()
      check(SystemClock.elapsedRealtime() - lastProgress < STALL_TIMEOUT_MS)
      checkpoint.flushIfDue()
      progress.publish()
      fillPeers()
      schedule()
    }
    check(plan.complete())
    progress.publish(verifying = true)
    return try { checkpoint.finish() } catch (error: Exception) {
      progress.report.failure("download", "verify", "invalid")
      throw error
    }
  }

  private fun submit(source: Int, action: () -> Unit) {
    ready[source] = false
    executor.execute {
      try { action(); results.put(Result(source)) }
      catch (_: InterruptedException) { Thread.currentThread().interrupt() }
      catch (error: Exception) { if (!closed) results.put(Result(source, error = error)) }
    }
  }

  private fun fillPeers() {
    sessions.indices.forEach { slot ->
      if (sessions[slot] != null) return@forEach
      val config = waiting.poll() ?: return
      configs[slot] = config
      val session = UpdateBlockSession(files, input, config)
      sessions[slot] = session
      plan.revive(slot)
      submit(slot) { session.open() }
    }
  }

  private fun startOrigin() {
    originAttempts++
    plan.revive(ORIGIN)
    val delay = originAttempts > 1 || sessions.any { it != null }
    submit(ORIGIN) {
      if (delay) Thread.sleep(2_000)
    }
  }

  private fun accept(result: Result, checkpoint: UpdateCheckpoint): Boolean {
    if (result.block >= 0) {
      if (!plan.finish(result.source, result.block)) return false
      val bytes = checkNotNull(result.bytes)
      checkpoint.write(result.block, bytes)
      progress.report.accepted(sourceName(result.source), bytes.size.toLong())
      progress.advance(bytes.size.toLong())
      return true
    }
    if (result.error == null) { ready[result.source] = true; return false }
    val code = when (result.error) {
      is java.net.SocketTimeoutException -> "timeout"
      is java.io.IOException -> "network"
      is IllegalArgumentException -> "invalid"
      else -> "unavailable"
    }
    progress.report.failure(sourceName(result.source), "transfer", code)
    plan.fail(result.source)
    if (result.source == MIRROR) return false
    if (result.source == ORIGIN) {
      if (originAttempts < MAX_ORIGIN_ATTEMPTS) startOrigin()
      return false
    }
    val config = configs[result.source]
    sessions[result.source]?.close()
    sessions[result.source] = null
    configs[result.source] = null
    if (config != null) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("updateSharingFailure", config.getString("sessionId"))
    return false
  }

  private fun schedule() {
    ready.indices.forEach { source ->
      if (!ready[source]) return@forEach
      val session = sessions.getOrNull(source)
      val window = session?.requestWindow ?: MAX_UPDATE_REQUESTS
      plan.window(source, window)
      val indices = (0 until window).mapNotNull {
        plan.claim(source, SystemClock.elapsedRealtime(), fromEnd = source < MAX_PEERS)
      }
      if (indices.isEmpty()) return@forEach
      submit(source) {
        if (source >= MAX_PEERS) {
          val http = if (source == ORIGIN) origin else checkNotNull(mirror)
          indices.forEach { index -> results.put(Result(source, index, http.block(index))) }
        } else checkNotNull(session).blocks(indices) { index, bytes -> results.put(Result(source, index, bytes)) }
      }
    }
  }

  private fun close() {
    synchronized(this) { closed = true }
    executor.shutdownNow()
    while (!executor.awaitTermination(1, TimeUnit.SECONDS)) { /* Payload workers must stop before storage closes. */ }
    try { origin.close(); mirror?.close() } finally { sessions.filterNotNull().forEach { it.close() } }
  }

  private fun sourceName(source: Int) = when (source) {
    ORIGIN -> "origin"
    MIRROR -> "server"
    else -> "peer"
  }

  private companion object {
    const val MAX_PEERS = 3
    const val ORIGIN = MAX_PEERS
    const val MIRROR = ORIGIN + 1
    const val SOURCE_COUNT = MAX_PEERS + 2
    const val MAX_ORIGIN_ATTEMPTS = 3
    const val STALL_TIMEOUT_MS = 75_000
  }
}
