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

      val maxInputSize = if (audioFormat.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
        audioFormat.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE)
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

  companion object {
    private const val DEFAULT_BUFFER_SIZE = 1 shl 20 // 1 MiB
  }
}
