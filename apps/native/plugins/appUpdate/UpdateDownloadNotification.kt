package com.codexswitch.update

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.text.format.Formatter
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/** The app owns one quiet notification across both peer and official downloads. */
internal class UpdateDownloadNotification(private val context: Context, input: JSONObject) {
  private val manager = context.getSystemService(NotificationManager::class.java)
  private val labels = input.optJSONObject("notification") ?: JSONObject()
  private val version = input.getString("version")

  init {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(
        CHANNEL_ID, label("channel", "应用更新"), NotificationManager.IMPORTANCE_LOW,
      ).apply { setShowBadge(false) })
    }
  }

  fun progress(received: Long, total: Long, speed: Long, verifying: Boolean) {
    val percent = if (total > 0) (received * 100 / total).coerceIn(0, 100).toInt() else 0
    val sizes = if (total > 0) "${bytes(received)} / ${bytes(total)}" else bytes(received)
    val detail = if (verifying) label("verifying", "正在校验") else
      listOfNotNull(if (total > 0) "$percent%" else null, sizes, "${bytes(speed)}/s").joinToString(" · ")
    show(builder().setContentText(detail).setStyle(NotificationCompat.BigTextStyle().bigText(detail))
      .setProgress(100, percent, verifying || total <= 0).setOngoing(true))
  }

  fun finish(success: Boolean) {
    val detail = if (success) label("ready", "更新已下载，点击打开应用安装。")
      else label("failed", "下载未完成，点击打开应用重试。")
    show(builder().setSmallIcon(android.R.drawable.stat_sys_download_done)
      .setContentText(detail).setStyle(NotificationCompat.BigTextStyle().bigText(detail))
      .setProgress(0, 0, false).setOngoing(false).setAutoCancel(true))
  }

  private fun builder(): NotificationCompat.Builder {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val pending = launch?.let {
      PendingIntent.getActivity(context, NOTIFICATION_ID, it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("Remote AI v$version")
      .setContentIntent(pending).setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setOnlyAlertOnce(true).setShowWhen(false).setSilent(true)
  }

  private fun show(builder: NotificationCompat.Builder) {
    try { manager.notify(NOTIFICATION_ID, builder.build()) }
    catch (_: SecurityException) { /* Denied notifications must not interrupt an update. */ }
  }

  private fun bytes(value: Long) = Formatter.formatShortFileSize(context, value)
  private fun label(key: String, fallback: String) = labels.optString(key, fallback)

  companion object {
    private const val CHANNEL_ID = "app-update-download"
    private const val NOTIFICATION_ID = 7302
    fun dismiss(context: Context) {
      context.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
    }
  }
}
