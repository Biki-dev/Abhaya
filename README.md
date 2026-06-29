<div align="center">

<!-- LOGO -->
<img src="https://raw.githubusercontent.com/Biki-dev/Abhaya/main/assets/icon.png" width="100" height="100" alt="Abhaya Logo" />

<h1>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" width="200" height="40" style="vertical-align:middle">
    <text x="0" y="32" font-size="36" font-family="Georgia, serif" font-weight="bold" fill="#7C3AED">Abhaya</text>
  </svg>
</h1>

**अभया** — *fearless.*

A personal safety app for Android & iOS. One tap (or one word) and your people know where you are.

<br/>

[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-7C3AED?style=flat-square)](https://github.com/Biki-dev/Abhaya)
[![Built with Expo](https://img.shields.io/badge/built%20with-Expo%20~54-000020?style=flat-square&logo=expo)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Backend](https://img.shields.io/badge/backend-Render-46E3B7?style=flat-square)](https://abhaya-backend.onrender.com)
[![Socket.IO](https://img.shields.io/badge/realtime-Socket.IO-010101?style=flat-square&logo=socket.io)](https://socket.io)

</div>

---

## What is this?

Abhaya is a real-time safety companion app. When something feels wrong, you shouldn't have to unlock your phone, navigate to an app, and press buttons. Abhaya listens — for a keyword, a shake, or a tap — and immediately alerts your trusted contacts with your live GPS location, a countdown to cancel if it's a false alarm, and a two-way socket connection so the backend knows you're in trouble.

The name comes from the Sanskrit Word **abhaya** (अभया) — the meaning of protection and fearlessness. That's the intent.

---

## Features

| Feature | How it works |
|---|---|
| One-tap SOS | Big red button on the home screen. Starts a 10-second countdown — slide to cancel. After that, alerts go out. |
| Voice keyword detection | Microphone runs in background via `expo-task-manager`. Detected keyword → SOS flow begins. |
| Live location | `expo-location` in always-on mode. Coordinates stream to the backend over Socket.IO in real time. |
| BLE device support | Pair a Bluetooth button/wearable via `react-native-ble-manager`. Press it → same SOS flow. |
| Push notifications | Emergency contacts receive a push (`expo-notifications`) with your location and a live-tracking link. |
| Map view | In-app map (`react-native-maps`) shows your current location and any contacts tracking you. |
| Emergency audio | `react-native-audio-record` captures ambient audio on SOS trigger — stored for context. |
| Web viewer | Contacts open a web link (rendered via `react-native-webview` + `web-viewer/`) to see your live position. |

---

## System Architecture

<p align="center" style="background:black; padding:16px;">
  <img
    src="https://raw.githubusercontent.com/Biki-dev/Abhaya/main/flow.png"
    alt="Abhaya architecture"
    width="900"
  />
</p>

### How the layers talk to each other

**LocationContext** and **SOSContext** are mounted at the root level (above the navigator) so they stay alive regardless of which screen is active, including when the app is backgrounded. `expo-task-manager` keeps the location task running even when the process is in the background.

When an SOS fires, `SOSContext` does three things in parallel:
1. Posts to `/sos` on the REST API (persists the event).
2. Emits `sos:trigger` over the Socket.IO room — the backend broadcasts to all connected contacts.
3. Sends a push notification via `expo-notifications` to contacts who aren't online.

The **web-viewer** is a lightweight HTML page (no framework) that opens the Socket.IO room in read-only mode and renders a map with the user's coordinates as they stream in.

---

## Project Structure

```
Abhaya/
├── App.tsx                  # Root — ErrorBoundary → LocationProvider → SOSProvider
├── app.json                 # Expo config, permissions, backend URL
├── index.ts                 # Entry point
├── theme.ts                 # Global design tokens
│
├── navigation/
│   └── RootNavigator.tsx    # Stack + bottom tab navigation tree
│
├── context/
│   ├── LocationContext.tsx  # GPS, background task, coordinates state
│   └── SOSContext.tsx       # SOS state, countdown, keyword detection
│
├── screens/                 # One file per screen
├── components/              # Shared UI components
├── hooks/                   # Custom React hooks
├── services/                # socket.ts, api.ts (axios wrappers)
├── utils/                   # Pure helper functions
├── constants/               # Config values, keyword lists, etc.
│
├── backend/                 # Node.js backend source
├── web-viewer/              # Static HTML live-tracking page
└── assets/                  # Icons, splash, images
```

---

## Getting Started

**Prerequisites:** Node.js 18+, Expo CLI, Android Studio or Xcode.

```bash
# Clone
git clone https://github.com/Biki-dev/Abhaya.git
cd Abhaya

# Install
npm install

# Start (Expo Go or dev build)
npm start

# Android
npm run android

# iOS
npm run ios
```

The app points to `https://abhaya-backend.onrender.com` by default (configured in `app.json → extra.apiBaseUrl`). To run the backend locally, go into `backend/` and follow its own setup.

### Permissions the app will ask for

| Permission | Why |
|---|---|
| Fine / Coarse Location | Real-time GPS for SOS alerts |
| Background Location | Keeps tracking active when screen is off |
| Record Audio | Keyword detection + emergency audio capture |
| Bluetooth (Scan / Connect / Advertise) | Pairing with wearable BLE trigger device |
| Post Notifications | SOS alerts to emergency contacts |

---

## Tech Stack

| Layer | Technology |
|---|---|
| App framework | Expo ~54, React Native 0.81 |
| Language | TypeScript 5.9 |
| Navigation | React Navigation 6 (Stack + Bottom Tabs) |
| Real-time | Socket.IO client 4.8 |
| HTTP | Axios 1.6 |
| Location | expo-location + expo-task-manager |
| Audio | expo-av + react-native-audio-record |
| Bluetooth | react-native-ble-manager 12 |
| Maps | react-native-maps |
| Notifications | expo-notifications |
| Storage | @react-native-async-storage/async-storage |
| Fonts | @expo-google-fonts/manrope |
| Build | EAS Build |

---

<div align="center">
  Built by <a href="https://github.com/Biki-dev">Biki Kalita</a>
  <br/>
  <sub>अभया</sub>
</div>
