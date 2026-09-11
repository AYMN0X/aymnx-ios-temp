const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-av',
  'ios',
  'EXAV',
  'EXAV.h'
);
const oldImport = '#import <ExpoModulesCore/EXEventEmitter.h>';
const newImport = '#import <ExpoModulesCore/ExpoModulesCore.h>';

if (!fs.existsSync(target)) {
  console.warn('[patch-expo-av] EXAV.h not found, skipping.');
  process.exit(0);
}

const source = fs.readFileSync(target, 'utf8');
if (!source.includes(oldImport)) {
  console.log('[patch-expo-av] EXAV.h already patched.');
  process.exit(0);
}

fs.writeFileSync(target, source.split(oldImport).join(newImport), 'utf8');
console.log('[patch-expo-av] Patched EXAV.h import.');