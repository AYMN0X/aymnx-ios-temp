const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..', 'node_modules', 'expo-av', 'ios', 'EXAV');

function patchFile(rel, patchFn) {
  const file = path.join(base, rel);
  if (!fs.existsSync(file)) {
    console.warn(`[patch-expo-av] ${rel} not found, skipping.`);
    return;
  }
  const original = fs.readFileSync(file, 'utf8');
  const patched = patchFn(original);
  if (patched === original) {
    console.log(`[patch-expo-av] ${rel} already patched.`);
  } else {
    fs.writeFileSync(file, patched, 'utf8');
    console.log(`[patch-expo-av] Patched ${rel}.`);
  }
}

// 1. EXAV.h – replace EXEventEmitter.h import and add forward declaration
patchFile('EXAV.h', (src) => {
  const importOld = '#import <ExpoModulesCore/EXEventEmitter.h>';
  const importNew = '#import <ExpoModulesCore/ExpoModulesCore.h>';
  src = src.replace(importOld, importNew);

  const forwardDecl = '@protocol EXEventEmitter;\n';
  const interfaceMarker = '@interface EXAV : EXExportedModule';
  if (!src.includes(forwardDecl)) {
    src = src.replace(interfaceMarker, forwardDecl + interfaceMarker);
  }

  return src;
});

// 4. EXAV.m / EXAVTV.m – replace EXEventEmitterService.h with umbrella header
const legacyServiceHeaders = [
  'EXEventEmitterService.h',
  'EXAppLifecycleService.h',
  'EXPermissionsInterface.h',
];
['EXAV.m', 'EXAVTV.m'].forEach((file) => {
  patchFile(file, (src) => {
    legacyServiceHeaders.forEach((hdr) => {
      src = src.replace(
        `#import <ExpoModulesCore/${hdr}>`,
        '#import <ExpoModulesCore/ExpoModulesCore.h>'
      );
    });
    return src;
  });
});

// 2. Video/EXVideoView.h – replace import and add protocol definition
patchFile(path.join('Video', 'EXVideoView.h'), (src) => {
  src = src.replace(
    '#import <ExpoModulesCore/EXLegacyExpoViewProtocol.h>',
    '#import <ExpoModulesCore/ExpoModulesCore.h>'
  );

  const protoDef = '@protocol EXLegacyExpoViewProtocol <NSObject>\n@end\n\n';
  if (!src.includes('@protocol EXLegacyExpoViewProtocol')) {
    src = src.replace('@interface EXVideoView', protoDef + '@interface EXVideoView');
  }

  return src;
});

// 3. Stub Swift sources that fail to compile against modern ExpoModulesCore
function writeStub(rel, content) {
  const file = path.join(base, rel);
  if (!fs.existsSync(file)) {
    console.warn(`[patch-expo-av] ${rel} not found, skipping.`);
    return;
  }
  const original = fs.readFileSync(file, 'utf8');
  if (original === content) {
    console.log(`[patch-expo-av] ${rel} already patched.`);
  } else {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`[patch-expo-av] Patched ${rel}.`);
  }
}

writeStub(
  path.join('Video', 'VideoViewModule.swift'),
  `// Copyright 2022-present 650 Industries. All rights reserved.

import ExpoModulesCore

public final class VideoViewModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoVideoView")
  }
}
`
);

writeStub(
  'ExpoVideoView.swift',
  `// Copyright 2015-present 650 Industries. All rights reserved.
`
);

// 5. EXAudioRecordingPermissionRequester.m – add compat macros for EXErrorWithMessage/EXFatal
patchFile('EXAudioRecordingPermissionRequester.m', (src) => {
  const macros = `
#ifndef EXErrorWithMessage
#define EXErrorWithMessage(msg) [NSError errorWithDomain:@"EXAV" code:0 userInfo:@{NSLocalizedDescriptionKey: msg}]
#endif
#ifndef EXFatal
#define EXFatal(error) NSLog(@"Fatal: %@", error)
#endif
`;
  if (src.includes('#ifndef EXErrorWithMessage')) {
    return src;
  }
  const marker = '#import <objc/message.h>';
  if (!src.includes(marker)) {
    throw new Error('[patch-expo-av] Could not find marker in EXAudioRecordingPermissionRequester.m.');
  }
  return src.replace(marker, `${marker}\n${macros}`);
});