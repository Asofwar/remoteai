package com.codexswitch.chat

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.modules.core.DeviceEventManagerModule

/** Notification copy supplied by JavaScript in the interface language; Chinese remains the fallback. */
internal data class ChatConnectionLabels(
  val channel: String = "聊天连接",
  val channelDescription: String = "在后台接收电脑上的聊天回复",
  val chatTitle: String = "Remote AI 聊天",
  val chatText: String = "后台接收电脑回复，点击返回应用",
  val mappingTitle: String = "Remote AI 端口映射",
  val mappingText: String = "端口映射正在运行，点击返回应用",
) {
  companion object {
    fun from(values: Map<String, Any?>): ChatConnectionLabels {
      val defaults = ChatConnectionLabels()
      fun label(key: String, fallback: String) = (values[key] as? String)?.takeIf { it.isNotBlank() } ?: fallback
      return ChatConnectionLabels(
        label("channel", defaults.channel), label("channelDescription", defaults.channelDescription),
        label("chatTitle", defaults.chatTitle), label("chatText", defaults.chatText),
        label("mappingTitle", defaults.mappingTitle), label("mappingText", defaults.mappingText),
      )
    }
  }
}

class ChatConnectionService : HeadlessJsTaskService() {
  private var taskStarted = false

  override fun onCreate() {
    super.onCreate()
    createChannel(this)
    instance = this
    updateNotification()
    running = true
  }

  private fun updateNotification() {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_notify_chat)
      .setContentTitle(if (mappingEnabled) labels.mappingTitle else labels.chatTitle)
      .setContentText(if (mappingEnabled) labels.mappingText else labels.chatText)
      .setContentIntent(pending)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setOngoing(true).setShowWhen(false).setOnlyAlertOnce(true)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .build()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING or
        (if (mappingEnabled) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0)
    } else 0
    ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!taskStarted) {
      taskStarted = true
      // Keep RN timers and reconnects alive while the activity is paused.
      startTask(HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), 0, true))
    }
    return START_NOT_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    running = false
    instance = null
    mappingEnabled = false
    reactContext?.let { context ->
      if (context.hasActiveReactInstance()) {
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(STOP_EVENT, null)
      }
    }
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  companion object {
    const val TASK_NAME = "CodexChatConnection"
    const val STOP_EVENT = "codexChatConnectionStopped"
    private const val CHANNEL_ID = "chat-connection"
    private const val NOTIFICATION_ID = 7301
    private var instance: ChatConnectionService? = null
    private var mappingEnabled = false
    private var labels = ChatConnectionLabels()
    fun setPortMappingEnabled(enabled: Boolean) {
      mappingEnabled = enabled
      instance?.updateNotification()
    }

    /** Call on the main thread, like setPortMappingEnabled; a language change also renames the system channel. */
    internal fun setLabels(context: Context, next: ChatConnectionLabels) {
      if (next == labels) return
      labels = next
      val service = instance
      if (service != null) {
        createChannel(service)
        service.updateNotification()
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        context.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL_ID) != null) {
        createChannel(context)
      }
    }

    // Creating an existing channel again only updates its name and description.
    private fun createChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(
        CHANNEL_ID, labels.channel, NotificationManager.IMPORTANCE_LOW
      ).apply { description = labels.channelDescription; setShowBadge(false) })
    }

    @Volatile var running = false
      private set
  }
}
