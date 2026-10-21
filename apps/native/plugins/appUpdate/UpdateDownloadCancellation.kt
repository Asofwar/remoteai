package com.codexswitch.update

import android.app.DownloadManager
import android.content.Context
import android.database.Cursor
import android.net.Uri
import java.io.File
import java.util.concurrent.CancellationException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.atomic.AtomicBoolean

/** Cancellation stays attached to one destination until its workers have released their files. */
internal class UpdateDownloadControl(val path: String) {
  private val cancelled = AtomicBoolean(false)
  private val finished = CountDownLatch(1)
  val isCancelled: Boolean get() = cancelled.get()
  fun cancel() { cancelled.set(true) }
  fun checkActive() { if (isCancelled) throw CancellationException("Update cancelled") }
  fun finish() { finished.countDown() }
  fun awaitFinished() { finished.await() }
}

internal fun cancelSystemUpdateDownload(context: Context, path: String) {
  val target = File(path)
  require(target.isAbsolute && target.name.startsWith("CodexSwitch-update-") && target.extension == "apk")
  val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
  val ids = checkNotNull(manager.query(DownloadManager.Query())).use { updateDownloadIds(it, path) }
  if (ids.isNotEmpty()) manager.remove(*ids)
}

internal fun updateDownloadIds(cursor: Cursor, path: String): LongArray {
  val uriColumn = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI)
  val idColumn = cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_ID)
  val ids = mutableListOf<Long>()
  while (cursor.moveToNext()) {
    val uri = cursor.getString(uriColumn) ?: continue
    if (Uri.parse(uri).path == path) ids.add(cursor.getLong(idColumn))
  }
  return ids.toLongArray()
}
