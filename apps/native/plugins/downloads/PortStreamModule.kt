package com.codexswitch.downloads

import android.util.Base64
import com.facebook.react.bridge.*
import com.asterinet.react.tcpsocket.TcpSocketModule
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.RejectedExecutionException

class PortStreamModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val owner = UUID.randomUUID().toString()
  private val workers = ThreadPoolExecutor(8, 8, 0, TimeUnit.SECONDS, ArrayBlockingQueue<Runnable>(8))
  override fun getName() = "PortMappingStreams"

  @ReactMethod fun registerReceiver(id: String, epoch: String, key: String, promise: Promise) {
    try { PortStreamRecords.register(owner, id, epoch, key); promise.resolve(null) }
    catch (_: Exception) { promise.reject("STREAM_OPEN", "连接暂不可用，请重试。") }
  }
  @ReactMethod fun bind(id: String, request: String, socketId: Int, promise: Promise) {
    try {
      // This dependency has no @ReactModule annotation, so React's class-based lookup cannot resolve it.
      val tcp = checkNotNull(reactApplicationContext.getNativeModule(TcpSocketModule.TAG) as? TcpSocketModule)
      PortStreamRecords.bind(owner, id, PortStreamRecords.SinkTarget(request, tcp.portMappingSocket(socketId)))
      promise.resolve(null)
    } catch (_: Exception) { promise.reject("STREAM_BIND", "连接暂不可用，请重试。") }
  }
  @ReactMethod fun unbind(id: String, request: String) { PortStreamRecords.unbind(owner, id, request) }
  @ReactMethod fun pollReceiver(id: String, promise: Promise) {
    try {
      workers.execute {
        try {
          promise.resolve(encode(PortStreamRecords.poll(owner, id)))
        } catch (_: Exception) { promise.reject("STREAM_CLOSED", "连接已中断，请重试。") }
      }
    } catch (_: RejectedExecutionException) { promise.reject("STREAM_CLOSED", "连接已中断，请重试。") }
  }
  private fun encode(result: PortStreamRecords.PollResult): WritableMap {
    val records = Arguments.createArray()
    for (record in result.records) records.pushMap(Arguments.createMap().apply {
      putString("data", Base64.encodeToString(record.bytes, Base64.NO_WRAP))
      putString("requestId", record.requestId)
    })
    val progress = Arguments.createArray()
    for (update in result.progress) progress.pushMap(Arguments.createMap().apply {
      putString("requestId", update.requestId)
      putDouble("consumed", update.value.consumed.toDouble())
      putBoolean("eof", update.value.eof)
      putBoolean("failed", update.value.failed)
    })
    return Arguments.createMap().apply { putArray("records", records); putArray("progress", progress) }
  }
  @ReactMethod fun close(id: String) { PortStreamRecords.remove(owner, id) }
  override fun invalidate() { PortStreamRecords.close(owner); workers.shutdown(); super.invalidate() }
}
