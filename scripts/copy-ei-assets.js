#!/usr/bin/env node
// scripts/copy-ei-assets.js
// ─────────────────────────────────────────────────────────────────────────────
// Copies edge-impulse-standalone-all.js and edge-impulse-standalone-all.wasm
// into the correct native asset folders for Android and iOS.
//
// Run once after adding/updating the model:
//   node scripts/copy-ei-assets.js
//
// Or add to your package.json:
//   "postinstall": "node scripts/copy-ei-assets.js"
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

// Source files (your Edge Impulse deployment folder)
const EI_SOURCE_DIR = path.join(__dirname, '..', 'assets', 'ei');

// Destination folders
const ANDROID_ASSETS = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'ei');
const IOS_ASSETS     = path.join(__dirname, '..', 'ios', 'Rakshita', 'ei');  // adjust "Rakshita" to your iOS target name

const FILES = [
  'edge-impulse-standalone-all.js',
  'edge-impulse-standalone-all.wasm',
  'run-impulse.js'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Created:', dir);
  }
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`❌  Source not found: ${src}`);
    console.error('    Place your Edge Impulse files in: assets/ei/');
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  const size = (fs.statSync(dest).size / 1024).toFixed(1);
  console.log(`✅  ${path.basename(src)} → ${dest} (${size} KB)`);
}

console.log('\n📦  Copying Edge Impulse assets...\n');

// ── Android ──────────────────────────────────────────────────────────────────
if (fs.existsSync(path.join(__dirname, '..', 'android'))) {
  ensureDir(ANDROID_ASSETS);
  for (const f of FILES) {
    copyFile(path.join(EI_SOURCE_DIR, f), path.join(ANDROID_ASSETS, f));
  }
  console.log('\nAndroid: load via file:///android_asset/ei/edge-impulse-standalone-all.js');
} else {
  console.log('ℹ️   No android/ folder found, skipping Android copy.');
}

// ── iOS ───────────────────────────────────────────────────────────────────────
if (fs.existsSync(path.join(__dirname, '..', 'ios'))) {
  ensureDir(IOS_ASSETS);
  for (const f of FILES) {
    copyFile(path.join(EI_SOURCE_DIR, f), path.join(IOS_ASSETS, f));
  }
  console.log('\niOS: remember to add ei/ folder to your Xcode project as a folder reference.');
  console.log('     Then use: Bundle.main.url(forResource: "edge-impulse-standalone-all", withExtension: "js")');
} else {
  console.log('ℹ️   No ios/ folder found, skipping iOS copy.');
}

console.log('\n✅  Done. Edge Impulse assets copied.\n');