package com.codexswitch.update

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Records accepted bytes only; exception messages may contain private paths and are never reported. */
internal class UpdateDownloadReport(input: JSONObject) {
  private val value = JSONObject().put("id", UUID.randomUUID().toString())
    .put("artifact", input.optString("artifact")).put("platform", "android")
    .put("peerBytes", 0L).put("serverBytes", 0L).put("originBytes", 0L)
  private val failures = linkedMapOf<String, JSONObject>()

  @Synchronized fun accepted(source: String, bytes: Long) {
    val key = when (source) { "peer" -> "peerBytes"; "server" -> "serverBytes"; else -> "originBytes" }
    value.put(key, value.getLong(key) + bytes)
  }

  @Synchronized fun failure(source: String, stage: String, code: String) {
    val key = "$source:$stage:$code"
    val existing = failures[key]
    if (existing != null) existing.put("count", (existing.getInt("count") + 1).coerceAtMost(1000))
    else if (failures.size < 16) failures[key] = JSONObject().put("source", source)
      .put("stage", stage).put("code", code).put("count", 1)
  }

  @Synchronized fun finish(path: String?): String {
    if (path == null && failures.isEmpty()) failure("download", "transfer", "unavailable")
    value.put("outcome", if (path != null) "success" else "failed")
    value.put("failures", JSONArray(failures.values.toList()))
    return JSONObject().put("path", path ?: JSONObject.NULL).put("report", value).toString()
  }

  @Synchronized fun interrupted(error: Exception) {
    if (failures.values.any { it.optString("source") == "download" }) return
    val stage = if (error is java.io.IOException) "storage" else "transfer"
    val code = if (error is java.io.IOException) "io" else "unavailable"
    failure("download", stage, code)
  }
}
