Pod::Spec.new do |s|
  s.name           = 'FoxyDownloadService'
  s.version        = '0.1.0'
  s.summary        = 'Keeps downloads alive while the app is backgrounded (Android only).'
  s.description    = 'Local Expo module wrapping an Android foreground service. iOS is a no-op: backgrounded JS is suspended there, so keeping a download running needs a background URLSession instead.'
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
