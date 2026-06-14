import AVFoundation
import ExpoModulesCore

public class FoxyAudioExtractorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FoxyAudioExtractor")

    AsyncFunction("extractAudio") { (srcPath: String, destPath: String, promise: Promise) in
      self.extract(srcPath: srcPath, destPath: destPath, promise: promise)
    }
  }

  private func fileURL(_ path: String) -> URL {
    if path.hasPrefix("file://"), let url = URL(string: path) {
      return url
    }
    return URL(fileURLWithPath: path)
  }

  /// Copies the audio track of the source video into an `.m4a` at `destPath`
  /// using an `AVAssetExportSession` in passthrough mode (no re-encode).
  private func extract(srcPath: String, destPath: String, promise: Promise) {
    let srcURL = fileURL(srcPath)
    let destURL = fileURL(destPath)

    let asset = AVURLAsset(url: srcURL)
    guard let audioTrack = asset.tracks(withMediaType: .audio).first else {
      promise.reject("ERR_NO_AUDIO_TRACK", "no audio track found in source")
      return
    }

    let composition = AVMutableComposition()
    guard
      let compositionTrack = composition.addMutableTrack(
        withMediaType: .audio,
        preferredTrackID: kCMPersistentTrackID_Invalid
      )
    else {
      promise.reject("ERR_AUDIO_EXTRACT", "could not create composition track")
      return
    }

    do {
      try compositionTrack.insertTimeRange(
        CMTimeRange(start: .zero, duration: asset.duration),
        of: audioTrack,
        at: .zero
      )
    } catch {
      promise.reject("ERR_AUDIO_EXTRACT", error.localizedDescription)
      return
    }

    try? FileManager.default.removeItem(at: destURL)

    guard
      let export = AVAssetExportSession(
        asset: composition,
        presetName: AVAssetExportPresetPassthrough
      )
    else {
      promise.reject("ERR_AUDIO_EXTRACT", "could not create export session")
      return
    }
    export.outputURL = destURL
    export.outputFileType = .m4a

    export.exportAsynchronously {
      switch export.status {
      case .completed:
        promise.resolve(nil)
      case .failed, .cancelled:
        promise.reject("ERR_AUDIO_EXTRACT", export.error?.localizedDescription ?? "audio export failed")
      default:
        promise.reject("ERR_AUDIO_EXTRACT", "audio export ended in unexpected state")
      }
    }
  }
}
