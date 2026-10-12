package com.codexswitch.update

import java.net.URI

/** Mirrors contribute bytes only; official digests and installed-app signatures remain authoritative. */
internal fun validMirrorUrl(value: String, official: String): Boolean = try {
  val mirror = URI(value)
  val path = URI(official).rawPath.removePrefix("/piperhex/remoteai/releases/download/")
  officialUrl(official) && mirror.scheme == "https" && !mirror.host.isNullOrEmpty() &&
    mirror.userInfo == null && mirror.rawQuery == null && mirror.rawFragment == null &&
    mirror.rawPath.endsWith("/update-packages/" + path)
} catch (_: Exception) { false }
