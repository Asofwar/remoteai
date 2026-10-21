package com.codexswitch.update

import android.app.DownloadManager
import android.database.MatrixCursor
import java.util.concurrent.CancellationException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

internal object UpdateCancellationChecks {
  fun run() {
    destinationMatching()
    workerCompletion()
    println("PASS: cancellation selects only its system jobs and waits for worker cleanup")
  }

  private fun destinationMatching() {
    val path = "/storage/emulated/0/Download/CodexSwitch-update-2.0.12-123.apk"
    MatrixCursor(arrayOf(DownloadManager.COLUMN_ID, DownloadManager.COLUMN_LOCAL_URI)).use { cursor ->
      cursor.addRow(arrayOf(1L, null))
      cursor.addRow(arrayOf(2L, "file:///unrelated.apk"))
      cursor.addRow(arrayOf(3L, "file://$path"))
      cursor.addRow(arrayOf(4L, "file://$path"))
      check(updateDownloadIds(cursor, path).contentEquals(longArrayOf(3L, 4L)))
    }
  }

  private fun workerCompletion() {
    val control = UpdateDownloadControl("/update.apk")
    control.checkActive()
    control.cancel()
    check(control.isCancelled)
    check(runCatching { control.checkActive() }.exceptionOrNull() is CancellationException)
    val entered = CountDownLatch(1)
    val returned = AtomicBoolean(false)
    val thread = Thread { entered.countDown(); control.awaitFinished(); returned.set(true) }
    thread.start()
    try {
      check(entered.await(1, TimeUnit.SECONDS))
      check(!returned.get())
      control.finish()
      thread.join(1_000)
      check(returned.get() && !thread.isAlive)
    } finally { control.finish(); thread.join(1_000) }
    // A later download has its own cancellation state.
    UpdateDownloadControl("/new-update.apk").checkActive()
  }
}
