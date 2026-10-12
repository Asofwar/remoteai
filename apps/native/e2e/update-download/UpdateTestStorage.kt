package com.codexswitch.update

import android.content.ContextWrapper
import org.json.JSONObject
import java.io.Closeable
import java.io.File
import java.security.MessageDigest
import java.util.UUID

internal class UpdateTestStorage : Closeable {
  private val root = File("/data/local/tmp/update-checks-${UUID.randomUUID()}").apply { check(mkdirs()) }
  val context = object : ContextWrapper(null) {
    override fun getFilesDir() = root
    override fun getExternalFilesDir(type: String?) = root
  }
  val files = UpdateFiles(context)
  fun input(size: Int): JSONObject {
    val artifact = hex(MessageDigest.getInstance("SHA-256").digest(UUID.randomUUID().toString().toByteArray()))
    return JSONObject().put("path", files.createPath("test")).put("artifact", artifact).put("size", size)
  }
  fun partial(input: JSONObject) = File(File(input.getString("path")).parentFile,
    "CodexSwitch-update-partial-${input.getString("artifact")}.apk")
  override fun close() { check(root.deleteRecursively()) }
}
