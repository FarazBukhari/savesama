import AVFoundation
import ExpoModulesCore

public class FoxyAudioExtractorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FoxyAudioExtractor")

    AsyncFunction("extractAudio") { (srcPath: String, destPath: String, promise: Promise) in
      self.extract(srcPath: srcPath, destPath: destPath, promise: promise)
    }

    AsyncFunction("muxVideoAudio") {
      (videoPath: String, audioPath: String, outPath: String, promise: Promise) in
      self.muxVideoAudio(videoPath: videoPath, audioPath: audioPath, outPath: outPath, promise: promise)
    }

    AsyncFunction("transcodeVideo") {
      (srcPath: String, outPath: String, options: [String: Any], promise: Promise) in
      let targetHeight = (options["targetHeight"] as? NSNumber)?.intValue ?? 0
      self.transcodeVideo(srcPath: srcPath, outPath: outPath, targetHeight: targetHeight, promise: promise)
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

  /// Combines a video-only file and an audio-only file into one MP4 at `outPath`
  /// via an `AVMutableComposition` + passthrough export (no re-encode). Inputs
  /// must be MP4-container-compatible (H.264 video + AAC audio).
  private func muxVideoAudio(videoPath: String, audioPath: String, outPath: String, promise: Promise) {
    let videoAsset = AVURLAsset(url: fileURL(videoPath))
    let audioAsset = AVURLAsset(url: fileURL(audioPath))
    let destURL = fileURL(outPath)

    guard let sourceVideoTrack = videoAsset.tracks(withMediaType: .video).first else {
      promise.reject("ERR_NO_VIDEO_TRACK", "no video track in video source")
      return
    }
    guard let sourceAudioTrack = audioAsset.tracks(withMediaType: .audio).first else {
      promise.reject("ERR_NO_AUDIO_TRACK", "no audio track in audio source")
      return
    }

    let composition = AVMutableComposition()
    guard
      let videoTrack = composition.addMutableTrack(
        withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let audioTrack = composition.addMutableTrack(
        withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
    else {
      promise.reject("ERR_MUX", "could not create composition tracks")
      return
    }

    do {
      let videoRange = CMTimeRange(start: .zero, duration: videoAsset.duration)
      try videoTrack.insertTimeRange(videoRange, of: sourceVideoTrack, at: .zero)
      // Preserve orientation (portrait Shorts export sideways otherwise).
      videoTrack.preferredTransform = sourceVideoTrack.preferredTransform

      let audioRange = CMTimeRange(start: .zero, duration: audioAsset.duration)
      try audioTrack.insertTimeRange(audioRange, of: sourceAudioTrack, at: .zero)
    } catch {
      promise.reject("ERR_MUX", error.localizedDescription)
      return
    }

    try? FileManager.default.removeItem(at: destURL)

    guard
      let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough)
    else {
      promise.reject("ERR_MUX", "could not create export session")
      return
    }
    export.outputURL = destURL
    export.outputFileType = .mp4

    export.exportAsynchronously {
      switch export.status {
      case .completed:
        promise.resolve(nil)
      case .failed, .cancelled:
        promise.reject("ERR_MUX", export.error?.localizedDescription ?? "mux export failed")
      default:
        promise.reject("ERR_MUX", "mux export ended in unexpected state")
      }
    }
  }

  /// Downscales/compresses the source video into a smaller MP4 at `outPath`.
  /// Uses an `AVAssetExportSession` with the smallest built-in H.264 preset whose
  /// bounding box covers `targetHeight`, so the output fits within that box while
  /// preserving aspect ratio.
  private func transcodeVideo(srcPath: String, outPath: String, targetHeight: Int, promise: Promise) {
    let asset = AVURLAsset(url: fileURL(srcPath))
    let destURL = fileURL(outPath)

    let preset = Self.presetForHeight(targetHeight)
    guard let export = AVAssetExportSession(asset: asset, presetName: preset) else {
      promise.reject("ERR_TRANSCODE", "could not create export session for preset \(preset)")
      return
    }

    try? FileManager.default.removeItem(at: destURL)
    export.outputURL = destURL
    export.outputFileType = .mp4
    export.shouldOptimizeForNetworkUse = true

    export.exportAsynchronously {
      switch export.status {
      case .completed:
        promise.resolve(nil)
      case .failed, .cancelled:
        promise.reject("ERR_TRANSCODE", export.error?.localizedDescription ?? "transcode failed")
      default:
        promise.reject("ERR_TRANSCODE", "transcode ended in unexpected state")
      }
    }
  }

  /// Maps a target pixel height to the smallest built-in export preset whose
  /// bounding box covers it. Presets fit the video into the box preserving aspect
  /// ratio, so a 360p target maps to the 640x480 box, etc.
  private static func presetForHeight(_ height: Int) -> String {
    switch height {
    case ..<540:
      return AVAssetExportPreset640x480
    case ..<720:
      return AVAssetExportPreset960x540
    default:
      return AVAssetExportPreset1280x720
    }
  }
}
