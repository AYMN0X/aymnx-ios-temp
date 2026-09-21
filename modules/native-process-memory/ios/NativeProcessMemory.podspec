Pod::Spec.new do |s|
  s.name           = 'NativeProcessMemory'
  s.version        = '1.0.0'
  s.summary        = 'Exposes native iOS process RAM (task_vm_info.phys_footprint) to JavaScript.'
  s.description    = 'An Expo local module that reads the Mach task_vm_info phys_footprint to report the app process physical memory usage in MB.'
  s.author         = 'AYMNX'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
