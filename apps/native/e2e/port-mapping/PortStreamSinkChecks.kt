package com.codexswitch.downloads

import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import com.codexswitch.downloads.PortStreamCipherChecks.fails
import com.codexswitch.downloads.PortStreamCipherChecks.record

internal object PortStreamSinkChecks {
  private fun frame(offset: Long, data: ByteArray? = null): ByteArray =
    ByteBuffer.allocate(9 + (data?.size ?: 0)).put(if (data == null) 4.toByte() else 1.toByte())
      .putLong(offset).apply { if (data != null) put(data) }.array()

  fun verify() {
    reassembly()
    bounds()
    blockedWriter()
    timeout()
    encryptedLoopback()
  }

  private fun reassembly() {
    val source = ByteArray(64_000) { (it % 251).toByte() }
    val buffer = PortStreamBuffer()
    buffer.receive(frame(source.size.toLong())) // END can arrive before DATA on a new path.
    for (offset in (0 until source.size step 8000).reversed()) {
      buffer.receive(frame(offset.toLong(), source.copyOfRange(offset, offset + 8000)))
    }
    buffer.receive(frame(4000, source.copyOfRange(4000, 20000))) // Overlapping reframed retry.
    val batch = checkNotNull(buffer.take())
    check(batch.contentEquals(source) && buffer.consumed == 0L && !buffer.eof)
    buffer.receive(frame(0, source.copyOfRange(0, 8000))) // Do not duplicate an in-flight write.
    buffer.written(batch.size)
    check(buffer.consumed == source.size.toLong() && buffer.eof && buffer.take() == null)
    fails { buffer.receive(frame(0)) }
    fails { buffer.receive(frame(source.size.toLong(), byteArrayOf(1))) }
  }

  private fun bounds() {
    val buffer = PortStreamBuffer()
    buffer.receive(frame(PortStreamBuffer.WINDOW_BYTES - 1L, byteArrayOf(7)))
    fails { buffer.receive(frame(PortStreamBuffer.WINDOW_BYTES.toLong(), byteArrayOf(7))) }
    fails { buffer.receive(frame(-1, byteArrayOf(7))) }
    fails { buffer.receive(frame(9007199254740991L, byteArrayOf(7))) }
    fails { buffer.receive(frame(0, byteArrayOf())) }
    fails { buffer.receive(frame(0, ByteArray(16384))) }
    fails { buffer.receive(frame(5)) } // END cannot truncate an out-of-order segment.
    val fragmented = PortStreamBuffer()
    repeat(4096) { fragmented.receive(frame(it * 2L, byteArrayOf(7))) }
    fails { fragmented.receive(frame(8192, byteArrayOf(7))) }
  }

  private class SlowSocket : Socket() {
    val entered = CountDownLatch(1)
    val resume = CountDownLatch(1)
    val bytes = ByteArrayOutputStream()
    @Volatile var stopped = false
    override fun getOutputStream(): OutputStream = object : OutputStream() {
      override fun write(value: Int) { error("Unexpected single byte write") }
      override fun write(data: ByteArray) {
        entered.countDown(); check(resume.await(3, TimeUnit.SECONDS))
        check(!stopped); bytes.write(data)
      }
    }
    override fun close() { stopped = true; resume.countDown() }
  }

  private fun blockedWriter() {
    val socket = SlowSocket()
    val progress = CopyOnWriteArrayList<PortStreamSink.Progress>()
    val finished = CountDownLatch(1)
    val sink = PortStreamSink(socket, { progress.add(it); if (it.eof) finished.countDown() })
    try {
      sink.receive(frame(0, byteArrayOf(1, 2, 3)))
      check(socket.entered.await(1, TimeUnit.SECONDS))
      sink.receive(frame(0, byteArrayOf(1, 2, 3)))
      sink.receive(frame(3))
      check(progress.isEmpty()) // Queued bytes must not grant new credit to the sender.
      socket.resume.countDown()
      check(finished.await(1, TimeUnit.SECONDS))
      check(socket.bytes.toByteArray().contentEquals(byteArrayOf(1, 2, 3)))
      check(progress.last().consumed == 3L && progress.none { it.failed })
    } finally { sink.close() }
  }

  private fun timeout() {
    val socket = SlowSocket()
    val failed = CountDownLatch(1)
    val sink = PortStreamSink(socket, { check(it.consumed == 0L); if (it.failed) failed.countDown() }, 50)
    sink.receive(frame(0, byteArrayOf(1)))
    check(failed.await(2, TimeUnit.SECONDS) && socket.stopped)
    sink.close()
  }

  private fun encryptedLoopback() {
    val owner = "sink-check"; val id = UUID.randomUUID(); val epoch = UUID.randomUUID()
    val request = PortStreamCipherChecks.request.toString()
    val source = ByteArray(128 * 1024) { (it % 251).toByte() }
    val received = ByteArray(source.size)
    ServerSocket(0, 1, InetAddress.getLoopbackAddress()).use { server ->
      Socket(server.inetAddress, server.localPort).use { browser ->
        server.accept().use { accepted ->
          PortStreamRecords.register(owner, id.toString(), epoch.toString(), PortStreamCipherChecks.key)
          val target = PortStreamRecords.SinkTarget(request, accepted)
          fails { PortStreamRecords.bind("foreign", id.toString(), target) }
          PortStreamRecords.bind(owner, id.toString(), target)
          fails { PortStreamRecords.bind(owner, id.toString(), target) }
          browser.soTimeout = 3000
          val reader = Thread { DataInputStream(browser.getInputStream()).readFully(received) }
          reader.start()
          try { deliver(id, epoch, source); awaitEnd(owner, id.toString(), source.size) }
          finally { PortStreamRecords.close(owner) }
          reader.join(3000)
          check(!reader.isAlive && received.contentEquals(source))
        }
      }
    }
  }

  private fun deliver(id: UUID, epoch: UUID, source: ByteArray) {
    var sequence = 0
    for (offset in (0 until source.size step 4096).reversed()) {
      val payload = frame(offset.toLong(), source.copyOfRange(offset, offset + 4096))
      check(PortStreamRecords.receive(record(id, epoch, ++sequence, payload), "direct"))
      check(PortStreamRecords.receive(record(id, epoch, ++sequence, payload), "relay"))
    }
    check(PortStreamRecords.receive(record(id, epoch, ++sequence, frame(source.size.toLong())), "direct"))
  }

  private fun awaitEnd(owner: String, id: String, size: Int) {
    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3)
    var consumed = 0L
    while (System.nanoTime() < deadline) {
      val result = PortStreamRecords.poll(owner, id)
      check(result.records.isEmpty()) // No payload crosses the JS bridge.
      for (update in result.progress) {
        check(!update.value.failed && update.value.consumed >= consumed)
        consumed = update.value.consumed
        if (update.value.eof) { check(consumed == size.toLong()); return }
      }
    }
    error("Native sink did not finish")
  }
}
