package expo.modules.foxydownloadservice

import android.content.Intent
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS bridge for the download foreground service.
 *
 * Every function is best-effort: a failure to start the service must never fail the
 * download itself — the worst case is that a backgrounded transfer may be killed by
 * the system, which is exactly the pre-service behaviour.
 */
class FoxyDownloadServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FoxyDownloadService")

    Function("isSupported") { true }

    Function("start") { title: String ->
      send(FoxyDownloadService.ACTION_START) {
        putExtra(FoxyDownloadService.EXTRA_TITLE, title)
        putExtra(FoxyDownloadService.EXTRA_INDETERMINATE, true)
      }
    }

    Function("update") { title: String, progress: Int ->
      send(FoxyDownloadService.ACTION_UPDATE) {
        putExtra(FoxyDownloadService.EXTRA_TITLE, title)
        putExtra(FoxyDownloadService.EXTRA_PROGRESS, progress)
        putExtra(FoxyDownloadService.EXTRA_INDETERMINATE, false)
      }
    }

    Function("stop") { send(FoxyDownloadService.ACTION_STOP) {} }
  }

  private fun send(action: String, configure: Intent.() -> Unit) {
    val context =
      appContext.reactContext
        ?: throw CodedException("ERR_NO_CONTEXT", "no android context available", null)
    val intent = Intent(context, FoxyDownloadService::class.java).setAction(action)
    intent.configure()
    if (action == FoxyDownloadService.ACTION_STOP) {
      context.stopService(intent)
      return
    }
    // startForegroundService requires the service to call startForeground promptly;
    // FoxyDownloadService does so in onStartCommand.
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }
}
