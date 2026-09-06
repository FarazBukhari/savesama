package expo.modules.savesamaaudioextractor

import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
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
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFmpegKitConfig
import com.arthenica.ffmpegkit.ReturnCode
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer

class SaveSamaAudioExtractorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SaveSamaAudioExtractor")

    AsyncFunction("extractAudio") { srcPath: String, destPath: String, promise: Promise ->
      try {
        val src = stripScheme(srcPath)
        val dest = stripScheme(destPath)
        if (!ffmpegExtractAudio(src, dest)) {
          extract(src, dest)
        }
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
        val video = stripScheme(videoPath)
        val audio = stripScheme(audioPath)
        val out = stripScheme(outPath)
        if (!ffmpegMux(video, audio, out)) {
          muxVideoAudio(video, audio, out)
        }
        promise.resolve(null)
      } catch (e: CodedException) {
        promise.reject(e)
      } catch (e: Exception) {
        promise.reject(CodedException("ERR_MUX", e.message ?: "mux failed", e))
      }
    }

    Function("isTranscodeSupported") { true }

    /** Which engine backs the module: the FFmpeg version, or null when its native libs are absent. */
    Function("ffmpegVersion") { ffmpegVersion() }

    /**
     * Renames a MediaStore asset the app saved. `assetId` is expo-media-library's id,
     * which on Android is the MediaStore `_ID`. Resolves with the name MediaStore
     * actually applied (it may de-duplicate with " (1)").
     */
    AsyncFunction("renameMediaAsset") { assetId: String, displayName: String, promise: Promise ->
      try {
        promise.resolve(renameMediaAsset(assetId, displayName))
      } catch (e: CodedException) {
        promise.reject(e)
      } catch (e: SecurityException) {
        promise.reject(CodedException("ERR_RENAME_PERMISSION", e.message ?: "not allowed", e))
      } catch (e: Exception) {
        promise.reject(CodedException("ERR_RENAME", e.message ?: "rename failed", e))
      }
    }

    AsyncFunction("transcodeVideo") {
      srcPath: String, outPath: String, options: Map<String, Any?>, promise: Promise ->
      val targetShortSide = (options["targetHeight"] as? Number)?.toInt() ?: 0
      if (targetShortSide <= 0) {
        promise.reject(
          CodedException("ERR_TRANSCODE", "invalid targetHeight $targetShortSide", null)
        )
      } else {
        val src = stripScheme(srcPath)
        val out = stripScheme(outPath)
        // FFmpeg runs synchronously, so do it here on Expo's worker thread; only the
        // Media3 fallback needs the main looper.
        val handledByFfmpeg =
          try {
            ffmpegTranscode(src, out, targetShortSide)
          } catch (e: Exception) {
            Log.w(TAG, "ffmpeg transcode threw, falling back to Media3", e)
            false
          }
        if (handledByFfmpeg) {
          promise.resolve(null)
          return@AsyncFunction
        }
        // Transformer must be created, started and listened to on one Looper
        // thread; Expo runs this block off the main thread, so hop over.
        Handler(Looper.getMainLooper()).post {
          try {
            transcode(src, out, targetShortSide, promise)
          } catch (e: CodedException) {
            promise.reject(e)
          } catch (e: Exception) {
            promise.reject(CodedException("ERR_TRANSCODE", e.message ?: "transcode failed", e))
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // FFmpeg engine. Every function returns false (after logging) when FFmpeg is not
  // available or the command fails, so the caller can fall back to the platform path.
  // ---------------------------------------------------------------------------

  private fun ffmpegVersion(): String? =
    try {
      FFmpegKitConfig.getFFmpegVersion()
    } catch (e: Throwable) {
      // UnsatisfiedLinkError when the .so files are missing (e.g. an ABI we don't ship).
      Log.w(TAG, "ffmpeg unavailable", e)
      null
    }

  private fun runFfmpeg(args: List<String>): Boolean {
    return try {
      val session = FFmpegKit.executeWithArguments(args.toTypedArray())
      if (ReturnCode.isSuccess(session.returnCode)) {
        true
      } else {
        val logs = session.allLogsAsString ?: ""
        Log.w(
          TAG,
          "ffmpeg failed rc=${session.returnCode} args=${args.joinToString(" ")}\n" +
            logs.takeLast(1500)
        )
        false
      }
    } catch (e: Throwable) {
      Log.w(TAG, "ffmpeg not runnable", e)
      false
    }
  }

  private fun prepareOutput(path: String): File {
    val file = File(path)
    file.parentFile?.mkdirs()
    if (file.exists()) file.delete()
    return file
  }

  private fun hasOutput(file: File): Boolean = file.exists() && file.length() > 0

  /**
   * Audio track → .m4a. Stream copy first (AAC/HE-AAC stays bit-exact); if the source
   * audio isn't MP4-compatible (Opus, Vorbis) re-encode to AAC instead.
   */
  private fun ffmpegExtractAudio(src: String, dest: String): Boolean {
    val out = prepareOutput(dest)
    val copied =
      runFfmpeg(
        listOf(
          "-y", "-hide_banner", "-loglevel", "error", "-i", src,
          "-vn", "-map", "0:a:0", "-c:a", "copy", "-movflags", "+faststart", "-f", "ipod", dest
        )
      ) && hasOutput(out)
    if (copied) return true
    prepareOutput(dest)
    return runFfmpeg(
      listOf(
        "-y", "-hide_banner", "-loglevel", "error", "-i", src,
        "-vn", "-map", "0:a:0", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
        "-f", "ipod", dest
      )
    ) && hasOutput(out)
  }

  /**
   * Video-only + audio-only → one MP4, streams copied. Unlike MediaMuxer this also
   * carries VP9 (Meta's DASH original) into MP4, which is what makes the
   * "original quality" preference possible.
   */
  private fun ffmpegMux(video: String, audio: String, out: String): Boolean {
    val outFile = prepareOutput(out)
    return runFfmpeg(
      listOf(
        "-y", "-hide_banner", "-loglevel", "error", "-i", video, "-i", audio,
        "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-movflags", "+faststart",
        "-shortest", "-f", "mp4", out
      )
    ) && hasOutput(outFile)
  }

  /**
   * Downscale so the SHORT side is about [targetShortSide] (same contract as the
   * Media3 path and `resolutionPlan.ts`). FFmpeg applies the rotation matrix while
   * decoding, so `iw`/`ih` in the filter are already display dimensions. Encoding goes
   * through the hardware MediaCodec H.264 encoder; audio is copied.
   */
  private fun ffmpegTranscode(src: String, out: String, targetShortSide: Int): Boolean {
    val (sourceWidth, sourceHeight) = displayDimensions(src)
    if (sourceWidth <= 0 || sourceHeight <= 0) return false
    val outFile = prepareOutput(out)
    if (minOf(sourceWidth, sourceHeight) <= targetShortSide) {
      File(src).copyTo(outFile, overwrite = true)
      return true
    }
    val scale = targetShortSide.toDouble() / minOf(sourceWidth, sourceHeight)
    val outWidth = evenDimension(sourceWidth * scale)
    val outHeight = evenDimension(sourceHeight * scale)
    // ~2.5 bits per pixel per second lands 480p reels near 1 Mbps and 1080p near 5 Mbps.
    val bitrate = (outWidth.toLong() * outHeight.toLong() * 2.5).toLong().coerceIn(400_000L, 12_000_000L)
    return runFfmpeg(
      listOf(
        "-y", "-hide_banner", "-loglevel", "error", "-i", src,
        "-vf", "scale=$outWidth:$outHeight",
        "-c:v", "h264_mediacodec", "-b:v", bitrate.toString(), "-pix_fmt", "yuv420p",
        "-c:a", "copy", "-movflags", "+faststart", "-f", "mp4", out
      )
    ) && hasOutput(outFile)
  }

  // ---------------------------------------------------------------------------
  // MediaStore rename
  // ---------------------------------------------------------------------------

  /**
   * Resolves the id expo-media-library hands us to the MediaStore row to update.
   *
   * On Android the library's `Asset.id` is the asset's **content uri**
   * (`content://media/external/images/media/123`), not the bare `_ID`. Parsing it as a
   * number failed for every file, which is why renames never applied. The uri is also
   * the better handle: it names the type-specific collection, and MediaStore only allows
   * a DISPLAY_NAME change (a "movement") within a well-defined collection — the generic
   * Files collection can refuse it. A bare numeric id is still accepted for callers that
   * have one, against the Files collection as before.
   */
  private fun assetUri(assetId: String): Uri {
    val parsed = Uri.parse(assetId)
    if (parsed.scheme == ContentResolver.SCHEME_CONTENT) {
      try {
        ContentUris.parseId(parsed)
      } catch (e: Exception) {
        throw CodedException("ERR_RENAME", "asset uri has no row id: $assetId", e)
      }
      return parsed
    }
    val id =
      assetId.toLongOrNull()
        ?: throw CodedException("ERR_RENAME", "asset id is neither a content uri nor a MediaStore id: $assetId", null)
    return ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), id)
  }

  private fun renameMediaAsset(assetId: String, displayName: String): String {
    val context =
      appContext.reactContext
        ?: throw CodedException("ERR_RENAME", "no android context available", null)
    val uri = assetUri(assetId)
    val safeName = displayName.replace(Regex("[\\\\/:*?\"<>|\\x00-\\x1f]"), "").trim()
    if (safeName.isEmpty() || safeName.startsWith(".")) {
      throw CodedException("ERR_RENAME", "invalid file name", null)
    }
    val resolver = context.contentResolver

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      // Legacy storage: MediaStore doesn't move files for us, so rename on disk and
      // point the row at the new path.
      resolver.query(uri, arrayOf(MediaStore.MediaColumns.DATA), null, null, null)?.use { cursor ->
        if (!cursor.moveToFirst()) throw CodedException("ERR_RENAME", "asset not found", null)
        val current = File(cursor.getString(0))
        val target = File(current.parentFile, safeName)
        if (target.exists()) throw CodedException("ERR_RENAME_EXISTS", "a file with that name exists", null)
        if (!current.renameTo(target)) throw CodedException("ERR_RENAME", "could not rename file", null)
        val values = ContentValues().apply {
          put(MediaStore.MediaColumns.DATA, target.absolutePath)
          put(MediaStore.MediaColumns.DISPLAY_NAME, safeName)
          put(MediaStore.MediaColumns.TITLE, target.nameWithoutExtension)
        }
        resolver.update(uri, values, null, null)
      }
      return safeName
    }

    // Scoped storage: updating DISPLAY_NAME on a row this app owns renames the file.
    val values = ContentValues().apply { put(MediaStore.MediaColumns.DISPLAY_NAME, safeName) }
    val updated = resolver.update(uri, values, null, null)
    if (updated == 0) throw CodedException("ERR_RENAME", "asset not found or not owned by this app", null)
    resolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) return cursor.getString(0) ?: safeName
    }
    return safeName
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
    private const val TAG = "SaveSamaMedia"
    private const val DEFAULT_BUFFER_SIZE = 1 shl 20 // 1 MiB
  }
}
