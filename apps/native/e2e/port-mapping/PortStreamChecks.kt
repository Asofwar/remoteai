package com.codexswitch.downloads

import com.codexswitch.connectivity.NativeConnectivity
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import com.codexswitch.downloads.PortStreamCipherChecks.record
import com.codexswitch.downloads.PortStreamCipherChecks.fails
import com.codexswitch.downloads.PortStreamCipherChecks.key

/** Runs against Android's actual VM and JNI without installing or replacing the user's app. */
object PortStreamChecks {
  private const val OWNER = "port-stream-device-test"
  private fun queued(): Int {
    val field = PortStreamRecords::class.java.getDeclaredField("queued")
    field.isAccessible = true
    return (field.get(null) as AtomicInteger).get()
  }

  @JvmStatic fun main(args: Array<String>) {
    val id = UUID.randomUUID(); val epoch = UUID.randomUUID()
    PortStreamCipherChecks.verify()
    PortStreamSinkChecks.verify()
    PortStreamRecords.register(OWNER, id.toString(), epoch.toString(), key)
    fails { PortStreamRecords.poll("foreign-owner", id.toString()) }
    check(PortStreamRecords.receive(record(id, UUID.randomUUID()), "relay"))
    check(queued() == 0)
    repeat(17) { check(PortStreamRecords.receive(record(id, epoch, it + 1), if (it % 2 == 0) "direct" else "relay")) }
    val batch = PortStreamRecords.poll(OWNER, id.toString()).records
    check(batch.size == 17 && batch[0].path == "direct" && batch[1].path == "relay")
    check(batch.withIndex().all { (index, it) -> it.bytes.contentEquals(PortStreamCipherChecks.payload(index + 1))
      && it.requestId == PortStreamCipherChecks.request.toString() })
    PortStreamRecords.remove(OWNER, id.toString()); check(queued() == 0)
    PortStreamRecords.register(OWNER, id.toString(), epoch.toString(), key)
    repeat(4097) { PortStreamRecords.receive(record(id, epoch), "direct") }
    fails { PortStreamRecords.poll(OWNER, id.toString()) }; check(queued() == 0)
    PortStreamRecords.close(OWNER)
    repeat(20) {
      PortStreamRecords.register(OWNER, id.toString(), epoch.toString(), key)
      val receiver = Thread {
        try { PortStreamRecords.poll(OWNER, id.toString()) } catch (_: Exception) { /* close races a pending poll */ }
      }
      receiver.start()
      repeat(32) { PortStreamRecords.receive(record(id, epoch), "relay") }
      PortStreamRecords.close(OWNER); receiver.join(1000)
      check(!receiver.isAlive && queued() == 0)
    }
    check(!NativeConnectivity.sendBulk(OWNER, "missing", 1, byteArrayOf(1)))
    check(NativeConnectivity.call("{\"operation\":\"bulk-poll\",\"owner\":\"$OWNER\",\"id\":\"missing\"}")
      .contains("error"))
    println("PORT_STREAM_PASS: native decryption, replay, forgery, ownership, paths, bounds, close races, duplex JNI")
  }
}
