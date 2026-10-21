package com.codexswitch.update

import android.app.DownloadManager
import android.content.Context
import android.database.Cursor
import android.net.Uri
import java.io.File

internal data class UpdateDownloadSnapshot(
  val status: String, val receivedBytes: Long = 0, val totalBytes: Long = 0,
)

/** System downloads outlive the React instance, so recovery must query their counters as well as status. */
internal fun queryUpdateDownloadSnapshot(context: Context, path: String): UpdateDownloadSnapshot {
  val target = File(path)
  require(target.isAbsolute && target.name.startsWith("CodexSwitch-update-") && target.extension == "apk")
  val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
  // Older versions only saved a destination. This query is scoped to downloads owned by this app.
  return checkNotNull(manager.query(DownloadManager.Query())).use { readUpdateDownloadSnapshot(it, path) }
}

internal fun readUpdateDownloadSnapshot(cursor: Cursor, path: String): UpdateDownloadSnapshot {
  val uriColumn = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI)
  val statusColumn = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)
  val receivedColumn = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
  val totalColumn = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
  while (cursor.moveToNext()) {
    val localUri = cursor.getString(uriColumn) ?: continue
    if (Uri.parse(localUri).path != path) continue
    return UpdateDownloadSnapshot(
      statusName(cursor.getInt(statusColumn)),
      cursor.getLong(receivedColumn).coerceAtLeast(0), cursor.getLong(totalColumn).coerceAtLeast(0),
    )
  }
  return UpdateDownloadSnapshot("missing")
}

private fun statusName(status: Int): String = when (status) {
  DownloadManager.STATUS_PENDING -> "pending"
  DownloadManager.STATUS_RUNNING -> "running"
  DownloadManager.STATUS_PAUSED -> "paused"
  DownloadManager.STATUS_SUCCESSFUL -> "successful"
  DownloadManager.STATUS_FAILED -> "failed"
  else -> "missing"
}
