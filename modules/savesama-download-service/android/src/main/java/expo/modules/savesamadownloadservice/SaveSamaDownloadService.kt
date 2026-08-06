package expo.modules.savesamadownloadservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the app's process alive while downloads run.
 *
 * It does not download anything itself. On Android the React Native JS thread keeps
 * running while the app is backgrounded — what interrupts a long download is the
 * system reclaiming the process. A foreground service is what stops that, and the
 * notification it requires doubles as the download's progress UI.
 */
class SaveSamaDownloadService : Service() {
  companion object {
    const val ACTION_START = "expo.modules.savesamadownloadservice.START"
    const val ACTION_UPDATE = "expo.modules.savesamadownloadservice.UPDATE"
    const val ACTION_STOP = "expo.modules.savesamadownloadservice.STOP"

    const val EXTRA_TITLE = "title"
    const val EXTRA_PROGRESS = "progress"
    const val EXTRA_INDETERMINATE = "indeterminate"

    private const val CHANNEL_ID = "savesama_downloads"
    private const val NOTIFICATION_ID = 4201
  }

  override fun onBind(intent: Intent?) = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopForegroundCompat()
        stopSelf()
      }
      else -> {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Downloading"
        val progress = intent?.getIntExtra(EXTRA_PROGRESS, 0) ?: 0
        val indeterminate = intent?.getBooleanExtra(EXTRA_INDETERMINATE, false) ?: false
        val notification = buildNotification(title, progress, indeterminate)
        if (intent?.action == ACTION_UPDATE) {
          // Already in the foreground: just refresh the notification. Re-calling
          // startForeground on every progress tick is wasteful.
          notificationManager().notify(NOTIFICATION_ID, notification)
        } else {
          startForegroundCompat(notification)
        }
      }
    }
    // Downloads are driven from JS; a restarted service with no JS state would show
    // a notification for work that isn't happening.
    return START_NOT_STICKY
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  private fun notificationManager(): NotificationManager =
    getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun buildNotification(
    title: String,
    progress: Int,
    indeterminate: Boolean
  ): Notification {
    ensureChannel()

    // Tapping the notification returns to the app rather than launching a new task.
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent =
      launchIntent?.let {
        PendingIntent.getActivity(
          this,
          0,
          it,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setProgress(100, progress.coerceIn(0, 100), indeterminate)
      .apply { contentIntent?.let { setContentIntent(it) } }
      .build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel =
      NotificationChannel(
        CHANNEL_ID,
        "Downloads",
        // LOW keeps it silent: a progress bar shouldn't buzz the phone.
        NotificationManager.IMPORTANCE_LOW
      )
    channel.setShowBadge(false)
    notificationManager().createNotificationChannel(channel)
  }
}
