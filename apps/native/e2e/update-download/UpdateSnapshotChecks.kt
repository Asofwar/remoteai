package com.codexswitch.update

import android.app.DownloadManager
import android.database.MatrixCursor
import android.net.Uri
import java.io.File

internal object UpdateSnapshotChecks {
  private const val PATH = "/storage/emulated/0/Download/CodexSwitch-update-2.0.12-123.apk"
  private val columns = arrayOf(
    DownloadManager.COLUMN_LOCAL_URI, DownloadManager.COLUMN_STATUS,
    DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR, DownloadManager.COLUMN_TOTAL_SIZE_BYTES,
  )

  fun run() {
    val statuses = mapOf(
      DownloadManager.STATUS_PENDING to "pending", DownloadManager.STATUS_RUNNING to "running",
      DownloadManager.STATUS_PAUSED to "paused", DownloadManager.STATUS_SUCCESSFUL to "successful",
      DownloadManager.STATUS_FAILED to "failed",
    )
    statuses.forEach { (code, name) ->
      MatrixCursor(columns).use { cursor ->
        cursor.addRow(arrayOf(null, DownloadManager.STATUS_PENDING, 0L, -1L))
        cursor.addRow(arrayOf("file:///unrelated.apk", DownloadManager.STATUS_SUCCESSFUL, 900L, 900L))
        cursor.addRow(arrayOf(Uri.fromFile(File(PATH)).toString(), code, 40L, 100L))
        check(readUpdateDownloadSnapshot(cursor, PATH) == UpdateDownloadSnapshot(name, 40L, 100L))
      }
    }
    MatrixCursor(columns).use { cursor ->
      cursor.addRow(arrayOf(Uri.fromFile(File(PATH)).toString(), DownloadManager.STATUS_RUNNING, -1L, -1L))
      check(readUpdateDownloadSnapshot(cursor, PATH) == UpdateDownloadSnapshot("running"))
    }
    MatrixCursor(columns).use { cursor ->
      cursor.addRow(arrayOf("file:///unrelated.apk", DownloadManager.STATUS_RUNNING, 40L, 100L))
      check(readUpdateDownloadSnapshot(cursor, PATH) == UpdateDownloadSnapshot("missing"))
    }
    println("PASS: recovered system download status and byte counters, unknown totals, and destination matching")
  }
}
