package expo.modules.foxyaudioextractor

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer

class FoxyAudioExtractorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FoxyAudioExtractor")

    AsyncFunction("extractAudio") { srcPath: String, destPath: String, promise: Promise ->
      try {
        extract(stripScheme(srcPath), stripScheme(destPath))
        promise.resolve(null)
      } catch (e: CodedException) {
        promise.reject(e)
      } catch (e: Exception) {
        promise.reject(
          CodedException("ERR_AUDIO_EXTRACT", e.message ?: "audio extraction failed", e)
        )
      }
    }

    AsyncFunction("muxVideoAudio") {
      videoPath: String, audioPath: String, outPath: String, promise: Promise ->
      try {
        muxVideoAudio(stripScheme(videoPath), stripScheme(audioPath), stripScheme(outPath))
        promise.resolve(null)
      } catch (e: CodedException) {
        promise.reject(e)
      } catch (e: Exception) {
        promise.reject(CodedException("ERR_MUX", e.message ?: "mux failed", e))
      }
    }

    AsyncFunction("transcodeVideo") {
      srcPath: String, outPath: String, options: Map<String, Any?>, promise: Promise ->
      // Downscaling requires a full decode → GL scale → re-encode MediaCodec
      // pipeline, which is device-sensitive and not yet implemented on Android.
      // Reject clearly; the JS download layer falls back to saving the source
      // rendition so the download still succeeds.
      promise.reject(
        CodedException(
          "ERR_TRANSCODE_UNSUPPORTED",
          "on-device video transcoding is not yet available on Android",
          null
        )
      )
    }
  }

  private fun stripScheme(path: String): String =
    if (path.startsWith("file://")) path.removePrefix("file://") else path

  /**
   * Copies the first audio track of [srcPath] into a new MP4/M4A container at
   * [destPath] without re-encoding, using the platform [MediaExtractor] +
   * [MediaMuxer].
   */
  private fun extract(srcPath: String, destPath: String) {
    val extractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    var muxerStarted = false
    try {
      extractor.setDataSource(srcPath)

      var audioTrackIndex = -1
      var audioFormat: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(i)
        val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
        if (mime.startsWith("audio/")) {
          audioTrackIndex = i
          audioFormat = format
          break
        }
      }
      if (audioTrackIndex < 0 || audioFormat == null) {
        throw CodedException("ERR_NO_AUDIO_TRACK", "no audio track found in source", null)
      }

      extractor.selectTrack(audioTrackIndex)

      val outFile = File(destPath)
      outFile.parentFile?.mkdirs()
      if (outFile.exists()) {
        outFile.delete()
      }

      muxer = MediaMuxer(destPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val outTrackIndex = muxer.addTrack(audioFormat)
      muxer.start()
      muxerStarted = true

      copyTrack(extractor, audioFormat, muxer, outTrackIndex)
    } finally {
      if (muxerStarted) {
        try {
          muxer?.stop()
        } catch (_: Exception) {
        }
      }
      try {
        muxer?.release()
      } catch (_: Exception) {
      }
      extractor.release()
    }
  }

  /**
   * Combines the first video track of [videoPath] and the first audio track of
   * [audioPath] into a single MP4 at [outPath] without re-encoding, using two
   * [MediaExtractor]s feeding one [MediaMuxer]. Inputs must be MP4-compatible
   * codecs (H.264 video + AAC audio) or [MediaMuxer.addTrack] will throw.
   */
  private fun muxVideoAudio(videoPath: String, audioPath: String, outPath: String) {
    val videoExtractor = MediaExtractor()
    val audioExtractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    var muxerStarted = false
    try {
      videoExtractor.setDataSource(videoPath)
      audioExtractor.setDataSource(audioPath)

      val (videoIndex, videoFormat) = selectTrack(videoExtractor, "video/")
        ?: throw CodedException("ERR_NO_VIDEO_TRACK", "no video track in video source", null)
      val (audioIndex, audioFormat) = selectTrack(audioExtractor, "audio/")
        ?: throw CodedException("ERR_NO_AUDIO_TRACK", "no audio track in audio source", null)

      videoExtractor.selectTrack(videoIndex)
      audioExtractor.selectTrack(audioIndex)

      val outFile = File(outPath)
      outFile.parentFile?.mkdirs()
      if (outFile.exists()) {
        outFile.delete()
      }

      muxer = MediaMuxer(outPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val outVideoIndex = muxer.addTrack(videoFormat)
      val outAudioIndex = muxer.addTrack(audioFormat)
      muxer.start()
      muxerStarted = true

      copyTrack(videoExtractor, videoFormat, muxer, outVideoIndex)
      copyTrack(audioExtractor, audioFormat, muxer, outAudioIndex)
    } finally {
      if (muxerStarted) {
        try {
          muxer?.stop()
        } catch (_: Exception) {
        }
      }
      try {
        muxer?.release()
      } catch (_: Exception) {
      }
      videoExtractor.release()
      audioExtractor.release()
    }
  }

  /** Finds the first track whose MIME starts with [mimePrefix]. */
  private fun selectTrack(extractor: MediaExtractor, mimePrefix: String): Pair<Int, MediaFormat>? {
    for (i in 0 until extractor.trackCount) {
      val format = extractor.getTrackFormat(i)
      val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith(mimePrefix)) {
        return i to format
      }
    }
    return null
  }

  /**
   * Copies every sample of the currently-selected track in [extractor] into
   * [outTrackIndex] of [muxer], preserving timestamps and keyframe flags.
   */
  private fun copyTrack(
    extractor: MediaExtractor,
    format: MediaFormat,
    muxer: MediaMuxer,
    outTrackIndex: Int
  ) {
    val maxInputSize = if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
      format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE)
    } else {
      DEFAULT_BUFFER_SIZE
    }
    val buffer = ByteBuffer.allocate(maxInputSize.coerceAtLeast(DEFAULT_BUFFER_SIZE))
    val bufferInfo = MediaCodec.BufferInfo()

    while (true) {
      val sampleSize = extractor.readSampleData(buffer, 0)
      if (sampleSize < 0) {
        break
      }
      bufferInfo.offset = 0
      bufferInfo.size = sampleSize
      bufferInfo.presentationTimeUs = extractor.sampleTime
      bufferInfo.flags =
        if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) {
          MediaCodec.BUFFER_FLAG_KEY_FRAME
        } else {
          0
        }
      muxer.writeSampleData(outTrackIndex, buffer, bufferInfo)
      extractor.advance()
    }
  }

  companion object {
    private const val DEFAULT_BUFFER_SIZE = 1 shl 20 // 1 MiB
  }
}
