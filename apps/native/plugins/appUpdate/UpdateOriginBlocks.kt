package com.codexswitch.update

import org.json.JSONObject
import java.io.Closeable
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

// Amortize redirect latency without relying on whole-file CDN throughput.
internal const val UPDATE_ORIGIN_REQUEST_BYTES = 8L * 1024 * 1024

/** Read consecutive checkpoint blocks from each bounded HTTP response. */
internal class UpdateOriginBlocks(
  private val files: UpdateFiles, private val input: JSONObject,
  private val openConnection: (URL) -> HttpURLConnection = { url -> openOriginConnection(files, input, url) },
) : Closeable {
  private val size = input.getLong("size").also { require(it in 1..MAX_UPDATE_BYTES) }
  private var connection: HttpURLConnection? = null
  private var stream: InputStream? = null
  private var nextOffset = 0L
  private var responseEnd = 0L

  fun block(index: Int): ByteArray {
    val start = index.toLong() * UPDATE_BLOCK_BYTES
    require(start in 0 until size)
    val length = minOf(UPDATE_BLOCK_BYTES.toLong(), size - start).toInt()
    try {
      checkActive()
      if (stream == null || nextOffset != start) open(start)
      val bytes = read(length)
      nextOffset += length
      if (nextOffset == responseEnd) {
        check(checkNotNull(stream).read() == -1)
        close()
      }
      return bytes
    } catch (error: Exception) {
      try { close() } catch (closing: Exception) { error.addSuppressed(closing) }
      throw error
    }
  }

  private fun open(start: Long) {
    close()
    val url = input.getString("url")
    require(officialUrl(url))
    val request = openConnection(URL(url))
    connection = request
    request.connectTimeout = REQUEST_TIMEOUT_MS
    request.readTimeout = REQUEST_TIMEOUT_MS
    val end = minOf(size, start + UPDATE_ORIGIN_REQUEST_BYTES)
    request.setRequestProperty("Range", "bytes=$start-${end - 1}")
    request.setRequestProperty("Accept-Encoding", "identity")
    responseEnd = when (request.responseCode) {
      HttpURLConnection.HTTP_PARTIAL -> {
        check(request.getHeaderField("Content-Range") == "bytes $start-${end - 1}/$size")
        end
      }
      HttpURLConnection.HTTP_OK -> { check(start == 0L); size }
      else -> error("Update download unavailable")
    }
    val contentLength = request.getHeaderField("Content-Length")
    check(contentLength == null || contentLength.toLongOrNull() == responseEnd - start)
    stream = request.inputStream
    nextOffset = start
  }

  private fun checkActive() {
    check(!Thread.currentThread().isInterrupted)
    if (input.optBoolean("wifiOnly")) check(files.wifiAvailable())
  }

  private fun read(length: Int): ByteArray {
    val bytes = ByteArray(length)
    var offset = 0
    while (offset < length) {
      checkActive()
      val count = checkNotNull(stream).read(bytes, offset, minOf(READ_BUFFER_BYTES, length - offset))
      check(count > 0); offset += count
    }
    return bytes
  }

  override fun close() {
    try { stream?.close() } finally {
      stream = null
      connection?.disconnect()
      connection = null
    }
  }

  private companion object {
    const val REQUEST_TIMEOUT_MS = 8_000
    const val READ_BUFFER_BYTES = 64 * 1024
  }
}

private fun openOriginConnection(files: UpdateFiles, input: JSONObject, url: URL): HttpURLConnection {
  if (!input.optBoolean("wifiOnly")) return url.openConnection() as HttpURLConnection
  // Pin the whole response to Wi-Fi so losing it cannot silently switch to mobile data.
  return checkNotNull(files.wifiNetwork()).openConnection(url) as HttpURLConnection
}
