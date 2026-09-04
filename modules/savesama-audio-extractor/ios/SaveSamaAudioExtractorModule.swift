import AVFoundation
import ExpoModulesCore

public class SaveSamaAudioExtractorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SaveSamaAudioExtractor")

    AsyncFunction("extractAudio") { (srcPath: String, destPath: String, promise: Promise) in
      self.extract(srcPath: srcPath, destPath: destPath, promise: promise)
    }

    AsyncFunction("muxVideoAudio") {
      (videoPath: String, audioPath: String, outPath: String, promise: Promise) in
      self.muxVideoAudio(videoPath: videoPath, audioPath: audioPath, outPath: outPath, promise: promise)
    }

    Function("isTranscodeSupported") { true }

    // FFmpeg is Android-only; iOS keeps its AVFoundation implementation.
    Function("ffmpegVersion") { () -> String? in nil }

    AsyncFunction("renameMediaAsset") { (assetId: String, displayName: String, promise: Promise) in
      // PHAsset has no user-visible filename to rename.
      promise.reject("ERR_RENAME_UNSUPPORTED", "Renaming saved files is not supported on iOS")
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
  /// `targetHeight` is the conventional short-side resolution (a "360p" target
  /// means the shorter dimension should end up around 360, whatever the
  /// orientation). If the source is already at or below the target, the file is
  /// copied through untouched — no pointless lossy re-encode.
  private func transcodeVideo(srcPath: String, outPath: String, targetHeight: Int, promise: Promise) {
    let srcURL = fileURL(srcPath)
    let destURL = fileURL(outPath)
    let asset = AVURLAsset(url: srcURL)

    guard targetHeight > 0 else {
      promise.reject("ERR_TRANSCODE", "invalid targetHeight \(targetHeight)")
      return
    }
    guard let videoTrack = asset.tracks(withMediaType: .video).first else {
      promise.reject("ERR_TRANSCODE", "no video track in source")
      return
    }

    // Orientation-corrected display dimensions (portrait sources may encode
    // landscape frames plus a rotation transform).
    let transformed = videoTrack.naturalSize.applying(videoTrack.preferredTransform)
    let sourceWidth = abs(transformed.width)
    let sourceHeight = abs(transformed.height)
    guard sourceWidth > 0, sourceHeight > 0 else {
      promise.reject("ERR_TRANSCODE", "source has no usable dimensions")
      return
    }

    // Already small enough: pass the file through unchanged.
    if Int(min(sourceWidth, sourceHeight).rounded()) <= targetHeight {
      do {
        try? FileManager.default.removeItem(at: destURL)
        try FileManager.default.copyItem(at: srcURL, to: destURL)
        promise.resolve(nil)
      } catch {
        promise.reject("ERR_TRANSCODE", error.localizedDescription)
      }
      return
    }

    let preset = Self.preset(
      targetShortSide: targetHeight, sourceWidth: sourceWidth, sourceHeight: sourceHeight)
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

  /// Picks the smallest built-in export preset whose fit-inside scaling leaves
  /// the output's SHORT side at or above `targetShortSide`. Presets are
  /// landscape bounding boxes that scale the source uniformly to fit, so the
  /// resulting short side depends on the source's aspect ratio and orientation —
  /// a portrait 1080x1920 source needs the 1280x720 box for its short side to
  /// stay ≥ 360, where a landscape source only needs 640x480.
  private static func preset(
    targetShortSide: Int, sourceWidth: CGFloat, sourceHeight: CGFloat
  ) -> String {
    let boxes: [(name: String, width: CGFloat, height: CGFloat)] = [
      (AVAssetExportPreset640x480, 640, 480),
      (AVAssetExportPreset960x540, 960, 540),
      (AVAssetExportPreset1280x720, 1280, 720),
      (AVAssetExportPreset1920x1080, 1920, 1080),
    ]
    let sourceShortSide = min(sourceWidth, sourceHeight)
    for box in boxes {
      let scale = min(1, box.width / sourceWidth, box.height / sourceHeight)
      if sourceShortSide * scale >= CGFloat(targetShortSide) {
        return box.name
      }
    }
    return AVAssetExportPreset1920x1080
  }
}
