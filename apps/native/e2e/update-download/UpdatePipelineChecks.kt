package com.codexswitch.update

import android.content.ContextWrapper
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.ArrayDeque

internal object UpdatePipelineChecks {
  fun run() {
    pipelinedHeadersMayOvertakePayloads()
    verifiedBlocksSurviveALaterCorruptBlock()
    legacyPeerAndWindowLimits()
    reservedWindowsRecoverAndRefill()
    println("PASS: peer request pipeline, early headers, corruption, legacy negotiation, window bounds and refill")
  }

  private fun session(wire: Wire): UpdateBlockSession {
    val input = JSONObject().put("size", UPDATE_BLOCK_BYTES * 2).put("artifact", "a".repeat(64))
    val config = JSONObject().put("desktop", false).put("sessionId", "update-test")
    return UpdateBlockSession(UpdateFiles(ContextWrapper(null)), input, config, wire).also { it.open() }
  }

  private fun pipelinedHeadersMayOvertakePayloads() {
    val wire = Wire()
    val session = session(wire)
    check(session.requestWindow == 2)
    val received = mutableListOf<Int>()
    session.blocks(listOf(0, 1)) { index, bytes ->
      check(bytes.all { it == (index + 1).toByte() })
      received.add(index)
    }
    check(received == listOf(0, 1) && wire.requests == listOf(0, 1) && wire.firstReadQueued == 2)
    session.close()
  }

  private fun verifiedBlocksSurviveALaterCorruptBlock() {
    val wire = Wire(corrupt = true)
    val received = mutableListOf<Int>()
    val session = session(wire)
    check(runCatching { session.blocks(listOf(0, 1)) { index, _ -> received.add(index) } }.isFailure)
    check(received == listOf(0))
    session.close()
  }

  private fun legacyPeerAndWindowLimits() {
    val session = session(Wire(legacy = true))
    check(session.requestWindow == 1)
    check(runCatching { session.blocks(listOf(0, 1)) { _, _ -> } }.isFailure)
    session.blocks(listOf(0)) { index, _ -> check(index == 0) }
    session.close()
    val window = UpdateRequestWindow(8)
    window.observe(UPDATE_BLOCK_BYTES * 2L, 100)
    check(window.size == 8)
    window.observe(UPDATE_BLOCK_BYTES * 2L, 20_000)
    check(window.size == 2)
  }

  private fun reservedWindowsRecoverAndRefill() {
    val plan = UpdateBlockPlan(8, 3)
    plan.window(0, 3)
    check((0 until 3).map { plan.claim(0, 0, true) } == listOf(7, 6, 5))
    check(plan.claim(0, 0, true) == null && plan.finish(0, 7))
    plan.fail(0)
    check(plan.claim(1, 1, true) == 6)
    plan.revive(0)
    check(plan.claim(0, 1, true) == 5)
    check(plan.claim(2, 1) == 0)
  }

  private class Wire(private val corrupt: Boolean = false, private val legacy: Boolean = false) : UpdateBlockWire {
    private val events = ArrayDeque<JSONObject>()
    private val packets = ArrayDeque<ByteArray>()
    val requests = mutableListOf<Int>()
    var firstReadQueued = 0
    override fun call(request: JSONObject): Any? = when (request.getString("operation")) {
      "open" -> {
        events.add(JSONObject().put("type", "open"))
        events.add(JSONObject().put("type", "status").put("route", JSONObject().put("direct", true)))
        "test"
      }
      "poll" -> events.pollFirst()
      "send" -> { send(JSONObject(request.getString("text"))); null }
      "close" -> null
      else -> error("Unexpected operation")
    }
    private fun send(frame: JSONObject) {
      if (frame.getString("type") == "describe") {
        val manifest = JSONObject().put("type", "manifest").put("size", UPDATE_BLOCK_BYTES * 2)
          .put("hashes", JSONArray((1..2).map { value ->
            hex(MessageDigest.getInstance("SHA-256").digest(ByteArray(UPDATE_BLOCK_BYTES) { value.toByte() }))
          }))
        if (!legacy) manifest.put("requestWindow", 8)
        events.add(data(manifest))
        return
      }
      val index = frame.getInt("index")
      requests.add(index)
      events.add(data(JSONObject().put("type", "block").put("index", index).put("length", UPDATE_BLOCK_BYTES)))
      repeat(8) { packets.add(ByteArray(64 * 1024) { if (corrupt && index == 1) 9 else (index + 1).toByte() }) }
    }
    override fun packet(id: String): ByteArray? {
      if (firstReadQueued == 0) firstReadQueued = requests.size
      return packets.pollFirst()
    }
    private fun data(frame: JSONObject) = JSONObject().put("type", "data").put("text", frame.toString())
  }
}
