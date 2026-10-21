package com.codexswitch.downloads

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.util.UUID

/** Shares only published downloads, with temporary read access and no file copy. */
internal class DownloadSharing(private val context: Context) {
  fun intent(task: DownloadTask): Intent {
    require(task.status == "completed")
    UUID.fromString(task.id)
    val saved = Uri.parse(task.data.getString("uri"))
    val readable = when (saved.scheme) {
      "content" -> mediaUri(saved)
      "file" -> legacyUri(saved, task.id)
      else -> throw IllegalArgumentException("Unsupported download location")
    }
    context.contentResolver.openAssetFileDescriptor(readable, "r").use { file ->
      requireNotNull(file)
      require(file.length < 0 || file.length == task.size)
    }
    val name = task.data.getString("name")
    val uri = if (saved.scheme == "content") shareUri(saved, name) else readable
    return Intent(Intent.ACTION_SEND).apply {
      type = task.data.optString("mimeType").ifBlank { "application/octet-stream" }
      putExtra(Intent.EXTRA_STREAM, uri)
      clipData = ClipData.newRawUri(name, uri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
  }

  private fun shareUri(uri: Uri, name: String): Uri = Uri.Builder()
    .scheme("content").authority("${context.packageName}.download-share")
    .appendPath(if (uri.path?.startsWith("/external/downloads/") == true) "downloads" else "images")
    .appendPath(requireNotNull(uri.lastPathSegment)).appendPath(name).build()

  private fun mediaUri(uri: Uri): Uri {
    require(uri.authority == MediaStore.AUTHORITY)
    require(listOf("/external/downloads/", "/external/images/media/").any { uri.path?.startsWith(it) == true })
    return uri
  }

  @Suppress("DEPRECATION") // Downloads created on API 24–28 use public files.
  private fun legacyUri(uri: Uri, id: String): Uri {
    val file = File(requireNotNull(uri.path)).canonicalFile
    val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    val roots = listOf("Remote AI", "Codex Remote", "Codex Switch")
    require(roots.any { file.parentFile == File(File(downloads, it), id).canonicalFile })
    require(file.isFile && file.canRead())
    // Reuse the FileProvider already registered by react-native-blob-util for opening these files.
    return FileProvider.getUriForFile(context, "${context.packageName}.provider", file)
  }
}
