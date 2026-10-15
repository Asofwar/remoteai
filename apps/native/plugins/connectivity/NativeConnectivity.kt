package com.codexswitch.connectivity

object NativeConnectivity {
    init { System.loadLibrary("csw_chat_connectivity") }
    @JvmStatic external fun call(request: String): String
    @JvmStatic external fun receiveBulk(owner: String, id: String): ByteArray?
    @JvmStatic external fun sendBulk(owner: String, id: String, generation: Long, bytes: ByteArray): Boolean
    @JvmStatic external fun receivePacket(owner: String, id: String): ByteArray?
}
