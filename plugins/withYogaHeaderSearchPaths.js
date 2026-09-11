const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const YOGA_HOOK = `
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['HEADER_SEARCH_PATHS'] ||= '$(inherited)'
        config.build_settings['HEADER_SEARCH_PATHS'] << ' "\${PODS_ROOT}/Headers/Public/Yoga"'
        config.build_settings['HEADER_SEARCH_PATHS'] << ' "\${PODS_ROOT}/Headers/Private/Yoga"'
      end
    end
`;

function applyYogaHook(podfile) {
  if (podfile.includes('Headers/Private/Yoga')) {
    return podfile;
  }
  const marker = 'post_install do |installer|';
  const patched = podfile.replace(marker, `${marker}\n${YOGA_HOOK}`);
  if (patched === podfile) {
    throw new Error('[withYogaHeaderSearchPaths] Could not find post_install block in Podfile.');
  }
  return patched;
}

function withYogaHeaderSearchPaths(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const podfile = fs.readFileSync(podfilePath, 'utf8');
      const patched = applyYogaHook(podfile);
      if (patched !== podfile) {
        fs.writeFileSync(podfilePath, patched, 'utf8');
      }
      return config;
    },
  ]);
}

module.exports = withYogaHeaderSearchPaths;
module.exports.applyYogaHook = applyYogaHook;