// metro.config.js
// Registers .tflite as a bundleable asset so react-native-fast-tflite can
// load the model via require('../model_sim_float16.tflite')
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
