package com.codexswitch.update

import com.codexswitch.connectivity.NativeConnectivity
import org.json.JSONObject
import java.util.UUID

internal interface UpdateBlockWire {
  fun call(request: JSONObject): Any?
  fun packet(id: String): ByteArray?
}

internal class NativeUpdateBlockWire : UpdateBlockWire {
  private val owner = "update-" + UUID.randomUUID()
  override fun call(request: JSONObject): Any? {
    val response = JSONObject(NativeConnectivity.call(request.put("owner", owner).toString()))
    check(!response.has("error"))
    return response.opt("data").takeUnless { it == JSONObject.NULL }
  }
  override fun packet(id: String): ByteArray? = NativeConnectivity.receivePacket(owner, id)
}
