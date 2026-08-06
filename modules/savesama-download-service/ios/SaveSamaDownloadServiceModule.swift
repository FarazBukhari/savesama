import ExpoModulesCore

/**
 * iOS stub.
 *
 * Android needs a foreground service to stop the system reclaiming the process
 * mid-download. iOS works differently: backgrounded JS is suspended outright, so the
 * equivalent feature would be a background `URLSession` owning the transfer rather
 * than a service keeping JS alive. Until that exists, these are no-ops and
 * `isSupported` reports false so the JS layer can skip them.
 */
public class SaveSamaDownloadServiceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SaveSamaDownloadService")

    Function("isSupported") { false }
    Function("start") { (_: String) in }
    Function("update") { (_: String, _: Int) in }
    Function("stop") { }
  }
}
