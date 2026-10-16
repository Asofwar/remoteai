package com.codexswitch.update

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject

class AppUpdateModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newFixedThreadPool(2)
  private val downloading = AtomicBoolean(false)
  private val activeSharedDownload = AtomicReference<UpdateBlockDownload?>()
  private val files = UpdateFiles(context)
  override fun getName() = "AppUpdate"
  override fun getConstants(): MutableMap<String, Any> = hashMapOf("sharingProtocol" to 2)

  @ReactMethod
  fun canAutoDownload(promise: Promise) = task(promise) { files.wifiAvailable() }

  @ReactMethod
  fun updatePath(version: String, promise: Promise) = task(promise) { files.createPath(version) }

  @ReactMethod
  fun artifactId(metadata: String, promise: Promise) = task(promise) { files.artifact(JSONObject(metadata)) }

  @ReactMethod
  fun verifyPackage(options: String, promise: Promise) = task(promise) { files.verify(JSONObject(options)) }

  @ReactMethod
  fun downloadPeers(options: String, promise: Promise) = sharedDownload(options, promise, false)

  @ReactMethod
  fun downloadPeersReported(options: String, promise: Promise) = sharedDownload(options, promise, true)

  private fun sharedDownload(options: String, promise: Promise, reported: Boolean) =
    download(options, promise, reported) { input, progress ->
    val configs = input.getJSONArray("configs")
    if ((0 until configs.length()).all { configs.getJSONObject(it).optInt("packageProtocol") >= 2 }) {
      val transfer = UpdateBlockDownload(context, files, input, progress)
      activeSharedDownload.set(transfer)
      try { transfer.download() } finally { activeSharedDownload.compareAndSet(transfer, null) }
    } else { UpdatePeerDownload(files, input, progress).download() }
  }

  @ReactMethod
  fun addUpdatePeers(options: String, promise: Promise) = task(promise) {
    val input = JSONObject(options)
    activeSharedDownload.get()?.addPeers(input.getString("artifact"), input.getJSONArray("configs")) ?: false
  }

  @ReactMethod
  fun downloadOfficial(options: String, promise: Promise) = download(options, promise) { input, progress ->
    downloadOfficial(context, files, input, progress)
  }

  private fun download(options: String, promise: Promise, reported: Boolean = false,
    action: (JSONObject, UpdateDownloadProgress) -> String) = task(promise) {
    check(downloading.compareAndSet(false, true))
    var progress: UpdateDownloadProgress? = null
    var complete = false
    try {
      val input = JSONObject(options)
      files.target(input.getString("path"))
      val reporter = UpdateDownloadProgress(context, input)
      progress = reporter
      reporter.restore(0)
      val path = try { action(input, reporter) } catch (error: Exception) {
        if (!reported) throw error
        reporter.report.interrupted(error)
        return@task reporter.report.finish(null)
      }
      complete = true
      if (reported) reporter.report.finish(path) else path
    } finally {
      progress?.finish(complete)
      downloading.set(false)
    }
  }

  private fun task(promise: Promise, action: () -> Any) {
    try {
      worker.execute {
        try { promise.resolve(action()) }
        catch (_: Exception) { promise.reject("UPDATE_UNAVAILABLE", "更新下载未完成，请稍后重试。") }
      }
    } catch (_: java.util.concurrent.RejectedExecutionException) {
      promise.reject("UPDATE_UNAVAILABLE", "更新下载未完成，请稍后重试。")
    }
  }

  @ReactMethod
  fun getDownloadStatus(path: String, promise: Promise) {
    worker.execute {
      try {
        promise.resolve(downloadStatus(path))
      } catch (error: Exception) {
        promise.reject("UPDATE_STATUS_UNAVAILABLE", "Unable to check update download.", error)
      }
    }
  }

  private fun downloadStatus(path: String): String {
    val target = File(path)
    require(target.isAbsolute && target.name.startsWith("CodexSwitch-update-") && target.extension == "apk")
    val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    // Older versions saved the destination but not the system download ID. The query
    // is scoped to this app, so matching its unique destination also recovers those jobs.
    val cursor = checkNotNull(manager.query(DownloadManager.Query()))
    cursor.use {
      val uriColumn = it.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI)
      val statusColumn = it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)
      while (it.moveToNext()) {
        val localUri = it.getString(uriColumn) ?: continue
        if (Uri.parse(localUri).path == path) return statusName(it.getInt(statusColumn))
      }
    }
    return "missing"
  }

  private fun statusName(status: Int): String = when (status) {
    DownloadManager.STATUS_PENDING -> "pending"
    DownloadManager.STATUS_RUNNING -> "running"
    DownloadManager.STATUS_PAUSED -> "paused"
    DownloadManager.STATUS_SUCCESSFUL -> "successful"
    DownloadManager.STATUS_FAILED -> "failed"
    else -> "missing"
  }

  override fun invalidate() {
    worker.shutdown()
    super.invalidate()
  }
}
