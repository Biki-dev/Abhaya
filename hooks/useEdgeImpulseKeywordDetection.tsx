// hooks/useEdgeImpulseKeywordDetection.ts
// ─────────────────────────────────────────────────────────────────────────────
// Keyword detection using Edge Impulse WebAssembly model via a hidden WebView.
//
// WHY A WEBVIEW?
//   React Native's Hermes JS engine cannot run WebAssembly (.wasm files).
//   The Edge Impulse model is compiled to WASM + JS (Emscripten).
//   Solution: run the classifier inside a hidden WebView (which has a full
//   browser engine), and bridge audio chunks to it via postMessage.
//
// SETUP:
//   1. Copy edge-impulse-standalone-all.js and edge-impulse-standalone-all.wasm
//      into your app's assets folder (see ASSET SETUP section below).
//   2. Drop <EdgeImpulseWebView ref={eiRef} /> anywhere in HomeMapScreen.
//   3. useEdgeImpulseKeywordDetection() replaces useKeywordDetectionSOS().
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { PermissionsAndroid, Platform, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import AudioRecord from 'react-native-audio-record';
import { Buffer } from 'buffer';

// ── Re-export shared mic state so SensorFusion still works ───────────────────
export const GlobalMicState = { level: 0, isListening: false };

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const KEYWORD_DETECTION_ENABLED = true;
const CONFIDENCE_THRESHOLD      = 0.60;   
const AUDIO_SAMPLE_RATE         = 16000;  
const CHUNK_DURATION_MS         = 1000;   
const DEBOUNCE_MS               = 4000;
const WINDOW_SIZE               = 1;      
const DEBUG                     = __DEV__;
const WINDOW_SAMPLES            = Math.floor(AUDIO_SAMPLE_RATE * (CHUNK_DURATION_MS / 1000));

const EI_BASE_URL = Platform.OS === 'android'
  ? 'file:///android_asset/ei'    
  : 'http://localhost:8082';       


// ── Types ──
export type EIWebViewHandle = {
  sendAudio: (base64Chunk: string, windowSize?: number) => void;
  reset: () => void;
};

export type EIKeywordDetectionState = {
  isListening:    boolean;
  modelLoaded:    boolean;
  lastConfidence: number;
  lastLabel:      string | null;
  audioLevel:     number;
  status:         'idle' | 'loading' | 'listening' | 'processing' | 'detected';
  projectInfo:    { project: string; owner: string } | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// HTML Generator
// ─────────────────────────────────────────────────────────────────────────────
function buildEIHtml(baseUrl: string, modelFile: string = 'edge-impulse-standalone-all.js'): string {
  // Determine expected WASM filename (default is edge-impulse-standalone.wasm)
  const wasmFile = modelFile.replace('.js', '.wasm');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body>
<script>
function rnPost(msg) {
  try {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  } catch(e) {}
}

var classifier = null;
var classifierReady = false;
var pcmBuffer = [];
var lastDetection = 0;

function loadScript(src) {
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = function(e) { reject(new Error('Failed to load: ' + src)); };
    document.head.appendChild(s);
  });
}

async function initClassifier() {
  try {
    rnPost({ type: 'log', msg: '[EI] Loading model: ' + '${modelFile}' });
    
    // CRITICAL: Point the JS to the correct .wasm file
    window.Module = {
      locateFile: function(path) {
        if (path.endsWith('.wasm')) {
          return '${baseUrl}/' + '${wasmFile}';
        }
        return '${baseUrl}/' + path;
      }
    };

    await loadScript('${baseUrl}/run-impulse.js');
    classifier = new EdgeImpulseClassifier();
    
    var initPromise = classifier.init();
    loadScript('${baseUrl}/' + '${modelFile}').catch(function(e) {
      rnPost({ type: 'error', msg: '[EI] Failed to load JS: ' + e });
    });

    await initPromise;

    var project = classifier.getProjectInfo();
    classifierReady = true;

    rnPost({
      type: 'ready',
      project: project.name || 'Unknown',
      owner: project.owner || 'Unknown',
    });

    rnPost({ type: 'log', msg: '[EI] Model ready: ' + (project.name || '') + ' (' + modelFile + ')' });
  } catch(e) {
    rnPost({ type: 'error', msg: '[EI] Init failed: ' + (e.message || String(e)) });
  }
}

function processAudio(float32Samples) {
  if (!classifierReady || !classifier) return;
  try {
    var result = classifier.classify(Array.from(float32Samples));
    if (!result || !result.results) return;

    var best = null;
    var bestScore = -1;
    for (var i = 0; i < result.results.length; i++) {
      var r = result.results[i];
      if (r.value > bestScore) {
        bestScore = r.value;
        best = r;
      }
    }

    if (best) {
      rnPost({
        type: 'result',
        label: best.label,
        confidence: best.value,
        allResults: result.results,
      });
    }
  } catch(e) {
    rnPost({ type: 'error', msg: '[EI] classify() error: ' + (e.message || String(e)) });
  }
}

function handleMessage(event) {
  try {
    var msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (msg.type === 'audio') {
      var binaryStr = atob(msg.data);
      var numSamples = Math.floor(binaryStr.length / 2);
      for (var i = 0; i < numSamples; i++) {
        var lo = binaryStr.charCodeAt(i * 2);
        var hi = binaryStr.charCodeAt(i * 2 + 1);
        var int16 = (hi << 8) | lo;
        if (int16 >= 32768) int16 -= 65536;
        pcmBuffer.push(int16);
      }

      var windowSize = msg.windowSize || ${WINDOW_SAMPLES};
      if (pcmBuffer.length >= windowSize) {
        var toProcess = pcmBuffer.slice(0, windowSize);
        pcmBuffer = pcmBuffer.slice(Math.floor(windowSize / 2));
        processAudio(new Float32Array(toProcess));
      }
    } else if (msg.type === 'reset') {
      pcmBuffer = [];
    }
  } catch(e) {}
}

window.addEventListener('message', handleMessage);
document.addEventListener('message', handleMessage);
initClassifier();
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export const EdgeImpulseWebView = forwardRef<
  EIWebViewHandle,
  {
    onReady?: (info: { project: string; owner: string }) => void;
    onResult?: (label: string, confidence: number, allResults: Array<{ label: string; value: number }>) => void;
    onError?: (msg: string) => void;
    baseUrl?: string;
    modelFile?: string;
  }
>((props, ref) => {
  const webViewRef = useRef<WebView>(null);
  const htmlContent = buildEIHtml(props.baseUrl ?? EI_BASE_URL, props.modelFile);

  useImperativeHandle(ref, () => ({
    sendAudio(base64Chunk: string, windowSize = WINDOW_SAMPLES) {
      webViewRef.current?.postMessage(
        JSON.stringify({ type: 'audio', data: base64Chunk, windowSize })
      );
    },
    reset() {
      webViewRef.current?.postMessage(JSON.stringify({ type: 'reset' }));
    },
  }));

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      switch (msg.type) {
        case 'ready':
          props.onReady?.({ project: msg.project, owner: msg.owner });
          break;
        case 'result':
          props.onResult?.(msg.label, msg.confidence, msg.allResults ?? []);
          break;
        case 'log':
          if (DEBUG) console.log(msg.msg);
          break;
        case 'error':
          console.warn(msg.msg);
          props.onError?.(msg.msg);
          break;
      }
    } catch (_) {}
  }, [props.onReady, props.onResult, props.onError]);

  return (
    <View style={{ position: 'absolute', top: -1000, width: 0, height: 0, overflow: 'hidden' }}>
      <WebView
        ref={webViewRef}
        style={{ width: 1, height: 1, opacity: 0 }}
        source={{ html: htmlContent, baseUrl: props.baseUrl ?? EI_BASE_URL }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        onMessage={handleMessage}
        onError={(e) => {
          console.warn('[EI WebView] Error:', e.nativeEvent.description);
          props.onError?.(`WebView load error: ${e.nativeEvent.description}`);
        }}
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useEdgeImpulseKeywordDetection(
  enabled: boolean = true,
  onKeywordDetected?: (confidence: number, label: string) => void,
  webViewRef?: React.RefObject<EIWebViewHandle | null>,
) {
  const [state, setState] = useState<EIKeywordDetectionState>({
    isListening:    false,
    modelLoaded:    false,
    lastConfidence: 0,
    lastLabel:      null,
    audioLevel:     0,
    status:         'loading',
    projectInfo:    null,
  });

  const monitoringRef       = useRef(false);
  const isInitializedRef    = useRef(false);
  const lastDetectionRef    = useRef(0);
  const confidenceWindowRef = useRef<number[]>([]);
  const callbackRef         = useRef(onKeywordDetected);
  const modelReadyRef       = useRef(false);

  useEffect(() => { callbackRef.current = onKeywordDetected; }, [onKeywordDetected]);

  const handleModelReady = useCallback((info: { project: string; owner: string }) => {
    modelReadyRef.current = true;
    setState(s => ({ ...s, modelLoaded: true, status: 'idle', projectInfo: info }));
  }, []);

  const handleResult = useCallback((
    label: string,
    confidence: number,
    allResults: Array<{ label: string; value: number }>,
  ) => {
    if (DEBUG) {
      const summary = allResults.map(r => `${r.label}:${r.value.toFixed(2)}`).join(' ');
      console.log(`[keyword-EI] result → ${label} ${confidence.toFixed(3)} | ${summary}`);
    }

    const maxConf = Math.max(...allResults.map(r => r.value));
    GlobalMicState.level = maxConf;

    const isKeyword = isKeywordLabel(label) && confidence >= CONFIDENCE_THRESHOLD * 0.8;
    const score = isKeyword ? confidence : 0;

    confidenceWindowRef.current.push(score);
    if (confidenceWindowRef.current.length > WINDOW_SIZE) {
      confidenceWindowRef.current.shift();
    }
    const windowAvg =
      confidenceWindowRef.current.reduce((a, b) => a + b, 0) /
      confidenceWindowRef.current.length;

    setState(s => ({
      ...s,
      lastConfidence: windowAvg,
      lastLabel:      label,
      audioLevel:     maxConf,
      status:         windowAvg >= CONFIDENCE_THRESHOLD ? 'detected' : 'listening',
    }));

    if (windowAvg >= CONFIDENCE_THRESHOLD) {
      const now = Date.now();
      if (now - lastDetectionRef.current > DEBOUNCE_MS) {
        lastDetectionRef.current = now;
        confidenceWindowRef.current = [];
        console.log(`[keyword-EI] 🚨 KEYWORD DETECTED! label=${label} score=${windowAvg.toFixed(2)}`);
        callbackRef.current?.(windowAvg, label);
      }
    }
  }, []);

  const startListening = useCallback(async () => {
    if (monitoringRef.current) return;
    monitoringRef.current = true;

    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        monitoringRef.current = false;
        return;
      }
    }

    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      AudioRecord.init({
        sampleRate:    AUDIO_SAMPLE_RATE,
        channels:      1,
        bitsPerSample: 16,
        audioSource:   6,
        wavFile:       'ei.wav',
      });

      AudioRecord.on('data', (data: string) => {
        if (!monitoringRef.current) return;
        webViewRef?.current?.sendAudio(data, AUDIO_SAMPLE_RATE);
        const chunk = Buffer.from(data, 'base64');
        const numSamples = Math.floor(chunk.length / 2);
        let rmsSum = 0;
        for (let i = 0; i < numSamples; i++) {
          const sample = chunk.readInt16LE(i * 2) / 32768.0;
          rmsSum += sample * sample;
        }
        const rms = Math.sqrt(rmsSum / numSamples);
        GlobalMicState.level = rms;
        setState(s => ({ ...s, audioLevel: rms }));
      });
    }

    AudioRecord.start();
    GlobalMicState.isListening = true;
    setState(s => ({ ...s, isListening: true, status: 'listening' }));
    console.log('[keyword-EI] 🎤 Audio streaming started → Edge Impulse WebView');
  }, [webViewRef]);

  const stopListening = useCallback(() => {
    monitoringRef.current      = false;
    GlobalMicState.isListening = false;
    GlobalMicState.level       = 0;
    AudioRecord.stop();
    webViewRef?.current?.reset();
    setState(s => ({ ...s, isListening: false, status: 'idle' }));
  }, [webViewRef]);

  useEffect(() => {
    if (enabled) {
      const timer = setTimeout(startListening, 1000);
      return () => {
        clearTimeout(timer);
        monitoringRef.current = false;
        try { AudioRecord.stop(); } catch (_) {}
      };
    } else {
      stopListening();
    }
  }, [enabled, startListening, stopListening]);

  return { state, handleModelReady, handleResult };
}

function isKeywordLabel(label: string): boolean {
  const lower = label.toLowerCase();
  if (lower.includes('help'))    return true;
  if (lower.includes('sos'))     return true;
  if (lower.includes('bachao'))   return true;
  if (lower.includes('keyword')) return true;
  
  const negatives = ['noise', 'unknown', '_background_noise_', 'silence'];
  if (negatives.includes(lower)) return false;

  return true; 
}