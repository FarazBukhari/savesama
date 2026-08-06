Pod::Spec.new do |s|
  s.name           = 'SaveSamaAudioExtractor'
  s.version        = '0.1.0'
  s.summary        = 'Extracts the audio track from a video into an m4a (no re-encode).'
  s.description    = 'Local Expo module that remuxes the audio track of a video file into an m4a using AVFoundation passthrough.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
