package expo.modules.foxyaudioextractor

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
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

    Function("isTranscodeSupported") { true }

    AsyncFunction("transcodeVideo") {
      srcPath: String, outPath: String, options: Map<String, Any?>, promise: Promise ->
      val targetShortSide = (options["targetHeight"] as? Number)?.toInt() ?: 0
      if (targetShortSide <= 0) {
        promise.reject(
          CodedException("ERR_TRANSCODE", "invalid targetHeight $targetShortSide", null)
        )
      } else {
        // Transformer must be created, started and listened to on one Looper
        // thread; Expo runs this block off the main thread, so hop over.
        Handler(Looper.getMainLooper()).post {
          try {
            transcode(stripScheme(srcPath), stripScheme(outPath), targetShortSide, promise)
          } catch (e: CodedException) {
            promise.reject(e)
          } catch (e: Exception) {
            promise.reject(CodedException("ERR_TRANSCODE", e.message ?: "transcode failed", e))
          }
        }
      }
    }
  }

  private fun stripScheme(path: String): String =
    if (path.startsWith("file://")) path.removePrefix("file://") else path

  /**
   * Downscales [srcPath] into an MP4 at [outPath] whose SHORT side is about
   * [targetShortSide], matching the iOS implementation and `resolutionPlan.ts`
   * (a "480p" target means the shorter dimension ends up near 480, whatever the
   * orientation). Portrait reels are the common case here, so scaling by raw
   * height would over-shrink them by the aspect ratio — Media3's
   * `Presentation.createForHeight` is height-based, so the output box is computed
   * explicitly instead.
   *
   * If the source is already at or below the target it is copied through
   * untouched rather than re-encoded for no benefit.
   */
  @OptIn(UnstableApi::class)
  private fun transcode(
    srcPath: String,
    outPath: String,
    targetShortSide: Int,
    promise: Promise
  ) {
    val (sourceWidth, sourceHeight) = displayDimensions(srcPath)
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw CodedException("ERR_TRANSCODE", "source has no usable dimensions", null)
    }

    val outFile = File(outPath)
    outFile.parentFile?.mkdirs()
    if (outFile.exists()) {
      outFile.delete()
    }

    if (minOf(sourceWidth, sourceHeight) <= targetShortSide) {
      File(srcPath).copyTo(outFile, overwrite = true)
      promise.resolve(null)
      return
    }

    val scale = targetShortSide.toDouble() / minOf(sourceWidth, sourceHeight)
    // H.264 encoders reject odd dimensions on many devices, so round to even.
    val outWidth = evenDimension(sourceWidth * scale)
    val outHeight = evenDimension(sourceHeight * scale)

    val editedMediaItem =
      EditedMediaItem.Builder(MediaItem.fromUri("file://$srcPath"))
        .setEffects(
          Effects(
            /* audioProcessors= */ emptyList(),
            /* videoEffects= */ listOf(
              Presentation.createForWidthAndHeight(
                outWidth,
                outHeight,
                Presentation.LAYOUT_SCALE_TO_FIT
              )
            )
          )
        )
        .build()

    // Guard against a listener firing twice (or after an early throw) settling the
    // promise more than once.
    var settled = false

    val context =
      appContext.reactContext
        ?: throw CodedException("ERR_TRANSCODE", "no android context available", null)

    val transformer =
      Transformer.Builder(context)
        .setVideoMimeType(MimeTypes.VIDEO_H264)
        .setAudioMimeType(MimeTypes.AUDIO_AAC)
        .addListener(
          object : Transformer.Listener {
            override fun onCompleted(composition: Composition, result: ExportResult) {
              if (settled) return
              settled = true
              promise.resolve(null)
            }

            override fun onError(
              composition: Composition,
              result: ExportResult,
              exception: ExportException
            ) {
              if (settled) return
              settled = true
              outFile.delete()
              // A device that cannot decode or encode this clip is a capability
              // problem, not a bug: report it with the code the download layer
              // degrades on, so the user still gets the original file instead of
              // a failed download. Everything else surfaces as a real error.
              val code =
                if (isCapabilityFailure(exception)) "ERR_TRANSCODE_UNSUPPORTED" else "ERR_TRANSCODE"
              promise.reject(
                CodedException(code, exception.message ?: "transcode failed", exception)
              )
            }
          }
        )
        .build()

    transformer.start(editedMediaItem, outPath)
  }

  /** True for ExportExceptions caused by missing decoder/encoder capability. */
  @OptIn(UnstableApi::class)
  private fun isCapabilityFailure(exception: ExportException): Boolean =
    when (exception.errorCode) {
      ExportException.ERROR_CODE_DECODER_INIT_FAILED,
      ExportException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED,
      ExportException.ERROR_CODE_ENCODER_INIT_FAILED,
      ExportException.ERROR_CODE_ENCODING_FORMAT_UNSUPPORTED -> true
      else -> false
    }

  /**
   * Orientation-corrected dimensions: a portrait recording often stores landscape
   * frames plus a 90°/270° rotation, so the raw width/height must be swapped to
   * get what the viewer actually sees.
   */
  private fun displayDimensions(srcPath: String): Pair<Int, Int> {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(srcPath)
      val width =
        retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
          ?: 0
      val height =
        retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
          ?: 0
      val rotation =
        retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull()
          ?: 0
      return if (rotation == 90 || rotation == 270) height to width else width to height
    } finally {
      try {
        retriever.release()
      } catch (_: Exception) {
      }
    }
  }

  /** Rounds to an even pixel count, never below 2. */
  private fun evenDimension(value: Double): Int {
    val rounded = Math.round(value).toInt()
    val even = rounded - (rounded % 2)
    return if (even < 2) 2 else even
  }

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
