package com.codexswitch.downloads

import android.util.Base64
import com.facebook.react.bridge.*
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.RejectedExecutionException

class PortStreamModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val owner = UUID.randomUUID().toString()
  private val workers = ThreadPoolExecutor(8, 8, 0, TimeUnit.SECONDS, ArrayBlockingQueue<Runnable>(8))
  override fun getName() = "PortMappingStreams"

  @ReactMethod fun register(id: String, epoch: String, promise: Promise) {
    try { PortStreamRecords.register(owner, id, epoch); promise.resolve(null) }
    catch (_: Exception) { promise.reject("STREAM_OPEN", "连接暂不可用，请重试。") }
  }
  @ReactMethod fun poll(id: String, promise: Promise) {
    try {
      workers.execute {
        try {
          val result = Arguments.createArray()
          for (record in PortStreamRecords.poll(owner, id)) result.pushMap(Arguments.createMap().apply {
            putString("path", record.path); putString("data", Base64.encodeToString(record.bytes, Base64.NO_WRAP))
          })
          promise.resolve(result)
        } catch (_: Exception) { promise.reject("STREAM_CLOSED", "连接已中断，请重试。") }
      }
    } catch (_: RejectedExecutionException) { promise.reject("STREAM_CLOSED", "连接已中断，请重试。") }
  }
  @ReactMethod fun close(id: String) { PortStreamRecords.remove(owner, id) }
  override fun invalidate() { PortStreamRecords.close(owner); workers.shutdown(); super.invalidate() }
}
