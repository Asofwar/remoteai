package com.codexswitch.chat

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.modules.core.DeviceEventManagerModule

class ChatConnectionService : HeadlessJsTaskService() {
  private var taskStarted = false

  override fun onCreate() {
    super.onCreate()
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(
        CHANNEL_ID, "聊天连接", NotificationManager.IMPORTANCE_LOW
      ).apply { description = "在后台接收电脑上的聊天回复"; setShowBadge(false) })
    }
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
      .setContentTitle(if (mappingEnabled) "Remote AI 端口映射" else "Remote AI 聊天")
      .setContentText(if (mappingEnabled) "端口映射正在运行，点击返回应用" else "后台接收电脑回复，点击返回应用")
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
    fun setPortMappingEnabled(enabled: Boolean) {
      mappingEnabled = enabled
      instance?.updateNotification()
    }
    @Volatile var running = false
      private set
  }
}
