package com.codexswitch.downloads

import com.codexswitch.connectivity.NativeConnectivity
import java.nio.ByteBuffer
import org.json.JSONArray
import org.json.JSONObject

/** Real mesh bytes traverse both JNI directions; the host verifies every echoed record. */
object PortStreamDuplex {
  private const val OWNER = "port-stream-duplex-test"
  private fun call(operation: String) = JSONObject().put("owner", OWNER).put("operation", operation)
  @JvmStatic fun main(args: Array<String>) {
    val config = JSONObject().put("sessionId", "native-bulk-android").put("secret", "ab".repeat(32))
      .put("servers", JSONArray().put("tcp://127.0.0.1:18779")).put("stunServers", JSONArray())
      .put("desktop", false).put("expiresAt", System.currentTimeMillis() + 120_000)
    val opened = NativeConnectivity.call(call("open").put("config", config).put("bulk", true).toString())
    val id = JSONObject(opened).getString("data")
    try {
      val deadline = System.currentTimeMillis() + 45_000
      var generation = 0L
      while (generation == 0L) {
        check(System.currentTimeMillis() < deadline)
        val reply = JSONObject(NativeConnectivity.call(call("poll").put("id", id).toString()))
        check(!reply.has("error"))
        val event = reply.optJSONObject("data") ?: continue
        if (event.optString("type") == "bulk") generation = event.optLong("generation")
      }
      val started = System.nanoTime()
      var received = 0
      while (received < 256) {
        check(System.currentTimeMillis() < deadline)
        val bytes = checkNotNull(NativeConnectivity.receiveBulk(OWNER, id))
        if (bytes.isEmpty()) continue
        received++
        check(bytes.size == 16384 && ByteBuffer.wrap(bytes).getInt(68) == received)
        check((72 until bytes.size).all { bytes[it] == (received % 251).toByte() })
        val batch = ByteBuffer.allocate(9 + bytes.size).putInt(0x52414e31).put(1).putInt(bytes.size).put(bytes).array()
        check(!NativeConnectivity.sendBulk("foreign-owner", id, generation, batch))
        check(NativeConnectivity.sendBulk(OWNER, id, generation, batch))
      }
      // Do not tear down buffered native writes until the host has verified all echoes.
      while (true) {
        check(System.currentTimeMillis() < deadline)
        val completed = checkNotNull(NativeConnectivity.receiveBulk(OWNER, id))
        if (completed.isEmpty()) continue
        check(completed.size == 16384 && ByteBuffer.wrap(completed).getInt(68) == 257)
        break
      }
      val ms = (System.nanoTime() - started) / 1_000_000
      println("PORT_STREAM_DUPLEX_PASS: 4 MiB received and echoed intact through Android JNI in ${ms} ms")
    } finally { NativeConnectivity.call(call("reset").toString()) }
  }
}
