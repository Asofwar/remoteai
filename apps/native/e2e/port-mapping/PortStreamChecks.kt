package com.codexswitch.downloads

import com.codexswitch.connectivity.NativeConnectivity
import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

/** Runs against Android's actual VM and JNI without installing or replacing the user's app. */
object PortStreamChecks {
  private const val OWNER = "port-stream-device-test"
  private fun record(id: UUID, epoch: UUID): ByteBuffer {
    val bytes = ByteBuffer.allocate(89)
    bytes.putInt(0x52414231).putInt(0x01010048)
    bytes.putLong(id.mostSignificantBits).putLong(id.leastSignificantBits)
    bytes.putLong(epoch.mostSignificantBits).putLong(epoch.leastSignificantBits)
    bytes.putInt(64, 1).putInt(68, 1)
    bytes.position(0)
    return bytes
  }
  private fun fails(action: () -> Unit) {
    var failed = false
    try { action() } catch (_: Exception) { failed = true }
    check(failed)
  }
  private fun queued(): Int {
    val field = PortStreamRecords::class.java.getDeclaredField("queued")
    field.isAccessible = true
    return (field.get(null) as AtomicInteger).get()
  }

  @JvmStatic fun main(args: Array<String>) {
    val id = UUID.randomUUID(); val epoch = UUID.randomUUID()
    PortStreamRecords.register(OWNER, id.toString(), epoch.toString())
    fails { PortStreamRecords.poll("foreign-owner", id.toString()) }
    check(PortStreamRecords.receive(record(id, UUID.randomUUID()), "relay"))
    check(queued() == 0)
    repeat(17) { check(PortStreamRecords.receive(record(id, epoch), if (it % 2 == 0) "direct" else "relay")) }
    val batch = PortStreamRecords.poll(OWNER, id.toString())
    check(batch.size == 16 && batch[0].path == "direct" && batch[1].path == "relay")
    check(batch.all { it.bytes.contentEquals(record(id, epoch).array()) })
    PortStreamRecords.remove(OWNER, id.toString()); check(queued() == 0)
    PortStreamRecords.register(OWNER, id.toString(), epoch.toString())
    repeat(4097) { PortStreamRecords.receive(record(id, epoch), "direct") }
    fails { PortStreamRecords.poll(OWNER, id.toString()) }; check(queued() == 0)
    PortStreamRecords.close(OWNER)
    repeat(20) {
      PortStreamRecords.register(OWNER, id.toString(), epoch.toString())
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
    println("PORT_STREAM_PASS: ownership, paths, batch bounds, overflow, close races, duplex JNI")
  }
}
