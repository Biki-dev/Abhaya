const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const EDGE_IMPULSE_FILES = [
  'run-impulse.js',
  'edge-impulse-standalone-all.js',
  'edge-impulse-standalone-all.wasm',
];

function copyEdgeImpulseAssets(projectRoot, androidProjectRoot) {
  const sourceDir = path.join(projectRoot, 'assets', 'ei');
  const destinationDir = path.join(androidProjectRoot, 'app', 'src', 'main', 'assets', 'ei');
  fs.mkdirSync(destinationDir, { recursive: true });

  for (const filename of EDGE_IMPULSE_FILES) {
    const source = path.join(sourceDir, filename);
    const destination = path.join(destinationDir, filename);
    if (!fs.existsSync(source)) {
      throw new Error(`[withEdgeImpulseAssets] Missing required asset: ${source}`);
    }
    fs.copyFileSync(source, destination);
  }
}

module.exports = function withEdgeImpulseAssets(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      copyEdgeImpulseAssets(config.modRequest.projectRoot, config.modRequest.platformProjectRoot);
      return config;
    },
  ]);
};
