package com.codexswitch.update

import android.content.ContextWrapper
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL

/** Runs the production downloader on Android without installing or changing an application. */
internal object UpdateOriginChecks {
  private const val URL_VALUE = "https://github.com/piperhex/remoteai/releases/download/test/android.apk"
  private const val SIZE = UPDATE_BLOCK_BYTES * 2 + 17
  private val files = UpdateFiles(ContextWrapper(null))

  fun run() {
    sequentialBlocksReuseOneResponse()
    largeDownloadsContinueAtResponseBoundaries()
    resumeAndGapsUseExactRanges()
    responseValidation()
    interruptedBodiesCanResume()
    cancellationClosesTheResponse()
    peerSchedulingKeepsOriginContiguous()
    schedulingRecoversFailedAndSlowSources()
    println("PASS: continuous response, resume, gaps, validation, cancellation and peer scheduling")
  }

  private fun input() = JSONObject().put("url", URL_VALUE).put("size", SIZE).put("wifiOnly", false)
  private fun bytes(start: Int, length: Int) = ByteArray(length) { ((start + it) % 251).toByte() }
  private fun assertBytes(actual: ByteArray, index: Int) {
    val start = index * UPDATE_BLOCK_BYTES
    check(actual.contentEquals(bytes(start, minOf(UPDATE_BLOCK_BYTES, SIZE - start))))
  }

  private fun sequentialBlocksReuseOneResponse() {
    val request = response()
    var opened = 0
    UpdateOriginBlocks(files, input()) { opened++; request }.use { download ->
      repeat(3) { assertBytes(download.block(it), it) }
    }
    check(opened == 1)
    check(request.getRequestProperty("Range") == "bytes=0-${SIZE - 1}")
    check(request.getRequestProperty("Accept-Encoding") == "identity")
    check(request.closed && request.body.closed)
  }

  private fun largeDownloadsContinueAtResponseBoundaries() {
    val boundary = UPDATE_ORIGIN_REQUEST_BYTES.toInt()
    val size = boundary + 17
    val requests = listOf(Response(bytes(0, boundary)), Response(bytes(boundary, 17)))
    requests[0].headers.putAll(mapOf("Content-Range" to "bytes 0-${boundary - 1}/$size",
      "Content-Length" to boundary.toString()))
    requests[1].headers.putAll(mapOf("Content-Range" to "bytes $boundary-${size - 1}/$size",
      "Content-Length" to "17"))
    var opened = 0
    UpdateOriginBlocks(files, input().put("size", size)) { requests[opened++] }.use { download ->
      repeat(boundary / UPDATE_BLOCK_BYTES) { index ->
        check(download.block(index).contentEquals(bytes(index * UPDATE_BLOCK_BYTES, UPDATE_BLOCK_BYTES)))
        check(opened == 1)
      }
      check(requests[0].closed && requests[0].body.closed)
      check(download.block(boundary / UPDATE_BLOCK_BYTES).contentEquals(bytes(boundary, 17)))
    }
    check(opened == 2 && requests[1].closed && requests[1].body.closed)
    check(requests[1].getRequestProperty("Range") == "bytes=$boundary-${size - 1}")
  }

  private fun resumeAndGapsUseExactRanges() {
    val resumed = response(UPDATE_BLOCK_BYTES)
    var opened = 0
    UpdateOriginBlocks(files, input()) { opened++; resumed }.use { download ->
      assertBytes(download.block(1), 1)
      assertBytes(download.block(2), 2)
    }
    check(opened == 1 && resumed.getRequestProperty("Range") == "bytes=$UPDATE_BLOCK_BYTES-${SIZE - 1}")
    val requests = listOf(response(), response(UPDATE_BLOCK_BYTES * 2))
    opened = 0
    UpdateOriginBlocks(files, input()) { requests[opened++] }.use { download ->
      assertBytes(download.block(0), 0)
      assertBytes(download.block(2), 2)
    }
    check(opened == 2 && requests.all { it.closed && it.body.closed })
    check(requests[1].getRequestProperty("Range") == "bytes=${UPDATE_BLOCK_BYTES * 2}-${SIZE - 1}")
  }

  private fun responseValidation() {
    val full = response().apply { status = 200; headers.remove("Content-Range") }
    UpdateOriginBlocks(files, input()) { full }.use { download -> repeat(3) { assertBytes(download.block(it), it) } }
    listOf(
      response().apply { status = 404 },
      response().apply { headers["Content-Range"] = "bytes 1-${SIZE - 1}/$SIZE" },
      response().apply { headers["Content-Length"] = (SIZE - 1).toString() },
    ).forEach { request ->
      UpdateOriginBlocks(files, input()) { request }.use { expectFailure { it.block(0) } }
      check(request.closed)
    }
    val ignoredRange = response().apply { status = 200 }
    UpdateOriginBlocks(files, input()) { ignoredRange }.use { expectFailure { it.block(1) } }
    check(ignoredRange.closed)
    val oversized = response(bodyLength = SIZE + 1).apply { headers.remove("Content-Length") }
    UpdateOriginBlocks(files, input()) { oversized }.use { download ->
      download.block(0); download.block(1)
      expectFailure { download.block(2) }
    }
    check(oversized.closed && oversized.body.closed)
  }

  private fun interruptedBodiesCanResume() {
    val requests = listOf(response(bodyLength = UPDATE_BLOCK_BYTES + 13), response(UPDATE_BLOCK_BYTES))
    var opened = 0
    UpdateOriginBlocks(files, input()) { requests[opened++] }.use { download ->
      assertBytes(download.block(0), 0)
      expectFailure { download.block(1) }
      check(requests[0].closed && requests[0].body.closed)
      assertBytes(download.block(1), 1)
      assertBytes(download.block(2), 2)
    }
    check(opened == 2 && requests[1].closed)
  }

  private fun cancellationClosesTheResponse() {
    val request = response()
    UpdateOriginBlocks(files, input()) { request }.use { download ->
      download.block(0)
      Thread.currentThread().interrupt()
      try { expectFailure { download.block(1) } } finally { Thread.interrupted() }
      check(request.closed && request.body.closed)
    }
    val partial = response()
    UpdateOriginBlocks(files, input()) { partial }.use { it.block(0) }
    check(partial.closed && partial.body.closed)
  }

  private fun peerSchedulingKeepsOriginContiguous() {
    val plan = UpdateBlockPlan(12, 3)
    repeat(4) { round ->
      val firstPeer = checkNotNull(plan.claim(0, round.toLong(), fromEnd = true))
      val secondPeer = checkNotNull(plan.claim(1, round.toLong(), fromEnd = true))
      val origin = checkNotNull(plan.claim(2, round.toLong()))
      check(firstPeer == 11 - round * 2 && secondPeer == 10 - round * 2 && origin == round)
      check(plan.claim(2, round.toLong()) == null)
      check(plan.finish(0, firstPeer) && plan.finish(1, secondPeer) && plan.finish(2, origin))
    }
    check(plan.complete() && plan.claim(2, 10) == null)
    val resumed = UpdateBlockPlan(5, 2)
    resumed.restore(booleanArrayOf(true, false, true, false, true))
    check(resumed.claim(0, 0, fromEnd = true) == 3 && resumed.claim(1, 0) == 1)
    check(resumed.finish(0, 3) && resumed.finish(1, 1) && resumed.complete())
  }

  private fun schedulingRecoversFailedAndSlowSources() {
    val plan = UpdateBlockPlan(3, 2)
    check(plan.claim(0, 0, fromEnd = true) == 2 && plan.claim(1, 0) == 0)
    plan.fail(0)
    check(plan.finish(1, 0) && plan.claim(1, 1) == 1)
    check(plan.finish(1, 1) && plan.claim(1, 2) == 2)
    check(plan.finish(1, 2) && plan.complete() && plan.claim(0, 3, fromEnd = true) == null)
    val slow = UpdateBlockPlan(2, 2)
    check(slow.claim(0, 0, fromEnd = true) == 1 && slow.claim(1, 0) == 0)
    check(slow.finish(1, 0) && slow.claim(1, 1_999) == null && slow.claim(1, 2_000) == 1)
    check(slow.finish(1, 1) && !slow.finish(0, 1) && slow.complete())
  }

  private fun expectFailure(action: () -> Unit) {
    var failed = false
    try { action() } catch (_: Exception) { failed = true }
    check(failed) { "Expected the invalid response or cancelled download to fail" }
  }

  private fun response(start: Int = 0, bodyLength: Int = SIZE - start) =
    Response(bytes(start, bodyLength)).apply {
      headers["Content-Range"] = "bytes $start-${SIZE - 1}/$SIZE"
      headers["Content-Length"] = (SIZE - start).toString()
    }

  private class Body(bytes: ByteArray) : ByteArrayInputStream(bytes) {
    var closed = false
    override fun close() { closed = true; super.close() }
  }

  private class Response(bytes: ByteArray) : HttpURLConnection(URL(URL_VALUE)) {
    val body = Body(bytes)
    val headers = mutableMapOf<String, String>()
    var status = HTTP_PARTIAL
    var closed = false
    override fun connect() = Unit
    override fun usingProxy() = false
    override fun disconnect() { closed = true }
    override fun getResponseCode() = status
    override fun getHeaderField(name: String) = headers[name]
    override fun getInputStream() = body
  }
}
