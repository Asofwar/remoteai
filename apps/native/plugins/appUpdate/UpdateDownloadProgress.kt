package com.codexswitch.update

import android.os.SystemClock
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

/** Counts accepted bytes, excluding restored blocks and duplicate requests. */
internal class UpdateDownloadProgress(
  private val context: ReactApplicationContext, input: JSONObject, private val control: UpdateDownloadControl,
) {
  val report = UpdateDownloadReport(input)
  private val path = input.getString("path")
  private val notification = UpdateDownloadNotification(context, input)
  private var received = 0L
  private var total = input.optLong("size").coerceAtLeast(0)
  private var sampleBytes = 0L
  private var sampleAt = SystemClock.elapsedRealtime()
  private var emittedAt = 0L
  private var speed = 0L

  @Synchronized
  fun restore(bytes: Long) {
    received = bytes
    sampleBytes = bytes
    sampleAt = SystemClock.elapsedRealtime()
    publish(force = true)
  }

  @Synchronized
  fun advance(bytes: Long) { received += bytes; publish() }

  @Synchronized
  fun report(bytes: Long, size: Long) {
    received = bytes.coerceAtLeast(0)
    total = size.coerceAtLeast(0)
    publish()
  }

  @Synchronized
  fun publish(verifying: Boolean = false, force: Boolean = false) {
    control.checkActive()
    val now = SystemClock.elapsedRealtime()
    if (!force && !verifying && now - emittedAt < REFRESH_MS) return
    val elapsed = now - sampleAt
    if (elapsed >= REFRESH_MS) {
      speed = ((received - sampleBytes).coerceAtLeast(0) * 1000 / elapsed)
      sampleBytes = received
      sampleAt = now
    }
    if (verifying) speed = 0
    emittedAt = now
    val event = Arguments.createMap().apply {
      putString("path", path)
      putDouble("receivedBytes", received.toDouble())
      putDouble("totalBytes", total.toDouble())
      putDouble("bytesPerSecond", speed.toDouble())
      putString("phase", if (verifying) "verifying" else "downloading")
    }
    if (context.hasActiveReactInstance()) {
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("appUpdateDownloadProgress", event)
    }
    notification.progress(received, total, speed, verifying)
  }

  fun finish(success: Boolean) {
    if (control.isCancelled) UpdateDownloadNotification.dismiss(context) else notification.finish(success)
  }

  companion object { private const val REFRESH_MS = 1_000L }
}
