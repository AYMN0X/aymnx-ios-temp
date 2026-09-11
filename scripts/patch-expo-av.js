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