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

class AppUpdateModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  override fun getName() = "AppUpdate"

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
