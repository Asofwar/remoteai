package com.codexswitch.downloads

import android.util.Base64
import android.os.SystemClock
import com.facebook.react.bridge.Promise
import okhttp3.WebSocket
import okio.ByteString.Companion.toByteString
import java.nio.ByteBuffer
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/** Bounded worker writes preserve RN responsiveness when the relay is congested. */
internal class SocketBulkSender {
  private val workers = ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS, ArrayBlockingQueue<Runnable>(8))

  fun send(session: String, data: String, socket: () -> WebSocket, promise: Promise) {
    try {
      require(session.matches(Regex("[a-zA-Z0-9_-]{1,128}")) && data.length <= 350_000)
      workers.execute {
        try {
          val frames = frames(session, Base64.decode(data, Base64.NO_WRAP))
          val deadline = SystemClock.elapsedRealtime() + 30_000
          for (frame in frames) {
            while (socket().queueSize() + frame.size > 256 * 1024) {
              check(SystemClock.elapsedRealtime() < deadline)
              Thread.sleep(4)
            }
            check(socket().send(frame.toByteString()))
          }
          promise.resolve(null)
        } catch (_: Exception) { promise.reject("SOCKET_SEND", "连接已中断，请重新连接。") }
      }
    } catch (_: Exception) { promise.reject("SOCKET_BUSY", "连接繁忙，请稍后重试。") }
  }

  private fun frames(session: String, bytes: ByteArray): List<ByteArray> {
    val input = ByteBuffer.wrap(bytes)
    require(bytes.size in 5..262_213 && input.int == 0x52414e31)
    val count = input.get().toInt() and 255
    require(count in 1..16)
    val header = "CSF1".toByteArray() + byteArrayOf(session.length.toByte()) + session.toByteArray()
    val frames = (0 until count).map {
      val length = input.int
      require(length in 89..16_384 && length <= input.remaining())
      val record = ByteArray(length); input.get(record)
      val view = ByteBuffer.wrap(record)
      require(view.int == 0x52414231 && view.int == 0x01010048 && view.getInt(64) == length - 88)
      header + record
    }
    require(!input.hasRemaining())
    return frames
  }

  fun close() { workers.shutdown() }
}
