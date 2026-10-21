package com.codexswitch.update

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.SystemClock
import org.json.JSONObject

internal fun downloadOfficial(
  context: Context, files: UpdateFiles, input: JSONObject, progress: UpdateDownloadProgress,
): String = OfficialUpdateDownload(context, files, input, progress).download()

private class OfficialUpdateDownload(
  context: Context, private val files: UpdateFiles, private val input: JSONObject,
  private val progress: UpdateDownloadProgress,
) {
  private val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
  private val target = files.target(input.getString("path"))

  fun download(): String {
    val url = input.getString("url")
    require(officialUrl(url))
    if (target.exists()) check(target.delete())
    val request = DownloadManager.Request(Uri.parse(url))
      .setDestinationUri(Uri.fromFile(target))
      .setTitle("Remote AI ${input.getString("version")}")
      .setMimeType("application/vnd.android.package-archive")
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_HIDDEN)
    if (input.optBoolean("wifiOnly")) {
      request.setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI)
        .setAllowedOverMetered(false).setAllowedOverRoaming(false)
    }
    val id = manager.enqueue(request)
    var complete = false
    try {
      awaitDownload(id)
      complete = true
      return target.path
    } finally { if (!complete) manager.remove(id) }
  }

  private fun awaitDownload(id: Long) {
    val deadline = SystemClock.elapsedRealtime() + DOWNLOAD_TIMEOUT_MS
    while (SystemClock.elapsedRealtime() < deadline) {
      when (poll(id)) {
        DownloadManager.STATUS_SUCCESSFUL -> {
          progress.publish(verifying = true)
          check(files.verify(input))
          return
        }
        DownloadManager.STATUS_FAILED -> error("Update download failed")
      }
      Thread.sleep(POLL_INTERVAL_MS)
    }
    error("Update download timed out")
  }

  private fun poll(id: Long): Int = manager.query(DownloadManager.Query().setFilterById(id)).use { cursor ->
    check(cursor.moveToFirst())
    progress.report(cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)),
      cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)))
    cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
  }

  private companion object {
    const val DOWNLOAD_TIMEOUT_MS = 30 * 60_000L
    const val POLL_INTERVAL_MS = 1_000L
  }
}
