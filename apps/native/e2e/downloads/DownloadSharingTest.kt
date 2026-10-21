@file:Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")

package com.codexswitch.downloads

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.test.InstrumentationTestCase
import org.json.JSONObject
import java.io.File

class DownloadSharingTest : InstrumentationTestCase() {
  private lateinit var storage: DownloadStorage
  private lateinit var task: DownloadTask
  private val content = "Downloaded file for sharing".toByteArray()

  override fun setUp() {
    super.setUp()
    storage = DownloadStorage(instrumentation.targetContext)
    task = DownloadTask.create(JSONObject().put("owner", "sharing-test").put("deviceId", "offline-pc")
      .put("scope", "computer").put("path", "RemoteAI-2.0.12-android.apk"))
    task.data.put("size", content.size).put("mimeType", "application/vnd.android.package-archive")
    storage.prepare(task)
    storage.append(task, content)
    storage.publish(task, {})
    task.status = "completed"
  }

  override fun tearDown() {
    try { storage.delete(task) }
    finally { super.tearDown() }
  }

  fun testSharesReadableApkWithTemporaryReadPermission() {
    val intent = storage.shareIntent(task)
    val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)!!
    assertEquals(Intent.ACTION_SEND, intent.action)
    assertEquals("application/vnd.android.package-archive", intent.type)
    assertEquals("content", uri.scheme)
    assertEquals(uri, intent.clipData!!.getItemAt(0).uri)
    assertTrue(intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
    assertEquals(0, intent.flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
    val bytes = instrumentation.targetContext.contentResolver.openInputStream(uri)!!.use { it.readBytes() }
    assertTrue(content.contentEquals(bytes))
    val columns = arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE, "flags")
    instrumentation.targetContext.contentResolver.query(uri, columns, null, null, null)!!.use { cursor ->
      assertTrue(cursor.moveToFirst())
      assertEquals(task.data.getString("name"), cursor.getString(cursor.getColumnIndexOrThrow(OpenableColumns.DISPLAY_NAME)))
      assertEquals(content.size.toLong(), cursor.getLong(cursor.getColumnIndexOrThrow(OpenableColumns.SIZE)))
    }
    assertEquals("completed", task.status)
  }

  fun testShareProviderDoesNotAllowWrites() {
    val uri = storage.shareIntent(task).getParcelableExtra<Uri>(Intent.EXTRA_STREAM)!!
    val result = runCatching { instrumentation.targetContext.contentResolver.openFileDescriptor(uri, "w") }
    result.getOrNull()?.close()
    assertTrue(result.isFailure)
  }

  fun testRejectsUnfinishedAndMissingDownloads() {
    task.status = "saving"
    assertRejected()
    task.status = "completed"
    instrumentation.targetContext.contentResolver.delete(Uri.parse(task.data.getString("uri")), null, null)
    assertRejected()
  }

  fun testRejectsChangedFileSize() {
    task.data.put("size", content.size + 1)
    assertRejected()
  }

  fun testRejectsUnrelatedFilePathsAndProviders() {
    val original = task.data.getString("uri")
    try {
      task.data.put("uri", Uri.fromFile(File(instrumentation.targetContext.filesDir, "secret")).toString())
      assertRejected()
      task.data.put("uri", "content://other.provider/downloads/1")
      assertRejected()
    } finally { task.data.put("uri", original) }
  }

  private fun assertRejected() {
    val result = runCatching { storage.shareIntent(task) }
    assertTrue("Unavailable downloads must not be shared", result.isFailure)
  }
}
