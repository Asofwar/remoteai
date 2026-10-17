package com.codexswitch.downloads

import java.net.Socket
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.ThreadFactory
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/** Single-flight writers keep slow browser sockets off the shared decrypt/poll workers. */
internal class PortStreamSink(private val socket: Socket, private val report: (Progress) -> Unit,
  private val timeoutMs: Long = 30_000) {
  data class Progress(val consumed: Long, val eof: Boolean, val failed: Boolean = false)
  companion object {
    private const val MAX_WRITERS = 24
    private val threads = ThreadFactory { task -> Thread(task, "port-stream-write").apply { isDaemon = true } }
    private val writers = ThreadPoolExecutor(MAX_WRITERS, MAX_WRITERS, 30, TimeUnit.SECONDS,
      ArrayBlockingQueue<Runnable>(MAX_WRITERS), threads).apply { allowCoreThreadTimeOut(true) }
    private val deadlines = ScheduledThreadPoolExecutor(1, threads).apply { removeOnCancelPolicy = true }
  }
  private val buffer = PortStreamBuffer()
  private var closed = false
  private var writing = false

  fun receive(frame: ByteArray) {
    try {
      val start = synchronized(this) {
        if (closed) return
        buffer.receive(frame)
        if (writing) false else { writing = true; true }
      }
      if (start) writers.execute { drain() }
    } catch (_: Exception) { fail() }
  }

  private fun drain() {
    try {
      while (true) {
        val batch = synchronized(this) {
          if (closed) return
          buffer.take().also { if (it == null) writing = false }
        }
        if (batch == null) { publish(); return }
        val deadline = deadlines.schedule({ fail() }, timeoutMs, TimeUnit.MILLISECONDS)
        try { socket.getOutputStream().write(batch) } finally { deadline.cancel(false) }
        synchronized(this) { if (closed) return; buffer.written(batch.size) }
        publish()
      }
    } catch (_: Exception) { fail() }
  }

  private fun publish() {
    synchronized(this) {
      if (closed) return
      report(Progress(buffer.consumed, buffer.eof))
    }
  }

  private fun fail() {
    val progress = synchronized(this) {
      if (closed) return
      closed = true; buffer.clear()
      Progress(buffer.consumed, false, true)
    }
    closeSocket(); report(progress)
  }

  fun close() {
    synchronized(this) { closed = true; buffer.clear() }
    closeSocket()
  }
  private fun closeSocket() {
    try { socket.close() } catch (_: java.io.IOException) { /* Socket is already being torn down. */ }
  }
}
