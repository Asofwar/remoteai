package com.codexswitch.downloads

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.FileNotFoundException

/** Read-only metadata adapter for published files; access requires an explicit URI grant. */
class DownloadShareProvider : ContentProvider() {
  override fun onCreate() = true

  override fun getType(uri: Uri): String? = context?.contentResolver?.getType(source(uri))

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor? {
    if (mode != "r") throw FileNotFoundException("Read-only download")
    return context?.contentResolver?.openFileDescriptor(source(uri), "r")
      ?: throw FileNotFoundException("Download unavailable")
  }

  override fun query(
    uri: Uri, projection: Array<out String>?, selection: String?,
    selectionArgs: Array<out String>?, sortOrder: String?,
  ): Cursor {
    val source = source(uri)
    val columns = (projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE))
      .filter { it == OpenableColumns.DISPLAY_NAME || it == OpenableColumns.SIZE }
    val values = columns.map { column ->
      if (column == OpenableColumns.DISPLAY_NAME) uri.lastPathSegment
      else context?.contentResolver?.openAssetFileDescriptor(source, "r")?.use { it.length }
    }
    // Some share sheets request document-only columns that MediaStore rejects.
    // Like FileProvider, return supported metadata instead of failing the whole query.
    return MatrixCursor(columns.toTypedArray(), 1).apply { addRow(values.toTypedArray()) }
  }

  override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException()
  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) =
    throw UnsupportedOperationException()
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) =
    throw UnsupportedOperationException()

  private fun source(uri: Uri): Uri {
    val parts = uri.pathSegments
    require(parts.size == 3 && parts[1].toLongOrNull()?.let { it > 0 } == true)
    val collection = when (parts[0]) {
      "downloads" -> "content://media/external/downloads"
      "images" -> "content://media/external/images/media"
      else -> throw FileNotFoundException("Unsupported download")
    }
    return Uri.withAppendedPath(Uri.parse(collection), parts[1])
  }
}
