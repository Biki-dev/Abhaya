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
| Push notifications | Emergency contacts receive a push (`expo-notifications`) with your location and a live-tracking link. |
| Map view | In-app map (`react-native-maps`) shows your current location and any contacts tracking you. |
| Emergency audio | `react-native-audio-record` captures ambient audio on SOS trigger — stored for context. |
| Web viewer | Contacts open a web link (rendered via `react-native-webview` + `web-viewer/`) to see your live position. |
| Trusted-contact live session | SOS and SafeWalk links use a cryptographically random, expiring token. Contacts can view live location, timestamp, accuracy, status, and acknowledge the alert without installing Abhaya. |

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

The **web-viewer** is a lightweight HTML page (no framework) that opens a token-authorized Socket.IO room, renders a map with the user's coordinates as they stream in, and lets a trusted contact acknowledge the active session.

Trusted-contact links are served from `web-viewer/index.html` and use the `?t=<temporary-token>` format. The backend stores the token, expiry, acknowledgement timestamp, last location accuracy, and session status. Public viewers never receive user phone numbers or payment data. The viewer clearly states that it is not emergency-service dispatch; users should call local emergency services for immediate danger.

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
| Maps | react-native-maps |
| Notifications | expo-notifications |
| Storage | @react-native-async-storage/async-storage |
| Fonts | @expo-google-fonts/manrope |
| Build | EAS Build |

## RevenueCat Test Store subscriptions

Abhaya includes a RevenueCat subscription flow configured for **Test Store only**. The Free plan always includes SOS, emergency calling, basic safety tracking, profile, and route check-in. Abhaya Plus unlocks unlimited emergency contacts, extended route history, and enhanced safety history. Abhaya Family includes the Plus safety features.

| Plan | Entitlement | Test products |
|---|---|---|
| Abhaya Plus | `abhaya_plus` | `abhaya_plus_monthly_test`, `abhaya_plus_yearly_test` |
| Abhaya Family | `abhaya_family` | `abhaya_family_monthly_test`, `abhaya_family_yearly_test` |

Create these products in RevenueCat's **Test Store**, attach them to the matching entitlements, and place them in the `default` offering. Set the public Test Store SDK keys in a local `.env` file using `.env.example` as a template. No production keys or real store credentials belong in this repository.

RevenueCat uses `CustomerInfo.entitlements.active` as the source of truth for each user's plan. The app identifies the customer with the authenticated Abhaya phone number, so different users receive only the features granted to their own purchase. RevenueCat native modules require an Expo development build; Expo Go cannot run this payment integration.

Each startup, purchase, and restore also writes a **purchase-history snapshot** to the backend (`SubscriptionSnapshot`) for the authenticated user. It contains the Test Store marker, RevenueCat customer ID, active entitlement names, purchased product identifiers, and available RevenueCat dates. This is an audit/support record only: the client never treats the database snapshot as proof of entitlement, and no fake `isPremium` flag is stored. Apply the migration with `cd backend && npm run prisma:migrate` after setting `DATABASE_URL`.

#### Exact Test Store setup

1. In RevenueCat, create or open the project's **Test Store** and copy its public iOS and Android Test Store SDK keys into a local `.env` file. Never use secret RevenueCat API keys in the app.
2. Create the four Test Store products with these exact identifiers: `abhaya_plus_monthly_test`, `abhaya_plus_yearly_test`, `abhaya_family_monthly_test`, and `abhaya_family_yearly_test`. Give each product clearly marked test pricing; the suggested future INR prices in the product brief are not app charges.
3. Create entitlements `abhaya_plus` and `abhaya_family`. Attach the two Plus products to `abhaya_plus` and the two Family products to `abhaya_family`.
4. Create or edit the `default` offering. Add Plus monthly as `$rc_monthly`, Plus yearly as `$rc_annual`, and add the Family monthly and yearly products as custom packages (use the closest valid monthly/yearly package type if the dashboard does not allow a custom identifier). The product identifiers above must remain exact.
5. Build the app with the development profile and test purchases in the Test Store modal. Missing keys, missing offerings, network failures, and cancelled purchases leave the account on its last known plan and never disable SOS or emergency behavior. The enhanced sensor dashboard is locked for Free users; SOS, emergency calling, basic safety tracking, and basic route check-in remain available.

The current implementation deliberately does not add a backend premium flag or an unverified webhook. Before production, add a RevenueCat webhook endpoint with signature verification, persist server-side entitlement state keyed to the stable Abhaya user ID, and enforce server-side access for any backend-only premium operation. Replace Test Store products and keys only in a separate release configuration after Apple/Google sandbox testing.

```bash
npx expo install react-native-purchases expo-dev-client
eas build --profile development --platform android
# or: eas build --profile development --platform ios
npx expo start --dev-client
```

Run local checks with `npm run typecheck` and `npm test`; run `cd backend && npm run build` for the backend. RevenueCat Test Store purchases require the native development build; Expo Go can preview the screen only and must not be treated as payment validation.

### Edge Impulse Android asset bundling

The keyword classifier runs inside a WebView and requires `run-impulse.js`, `edge-impulse-standalone-all.js`, and `edge-impulse-standalone-all.wasm` under `file:///android_asset/ei`. The Expo config plugin `plugins/withEdgeImpulseAssets.js` copies these files automatically during `expo prebuild`, `expo run:android`, and EAS builds. After updating this fix, rebuild the native app; restarting Metro alone cannot change the already-installed APK:

```bash
npx expo prebuild --clean --platform android
npx expo run:android
# or: eas build --profile development --platform android
```

If the warning persists in an existing development build, uninstall the old APK first and install the newly rebuilt one.

Before production launch, replace Test Store products with real App Store/Google Play products, use platform-specific production keys, and complete platform sandbox testing. See the [RevenueCat Expo guide](https://www.revenuecat.com/docs/getting-started/installation/expo) and [sandbox guide](https://www.revenuecat.com/docs/test-and-launch/sandbox).

---

<div align="center">
  Built by <a href="https://github.com/Biki-dev">Biki Kalita</a>
  <br/>
  <sub>अभया</sub>
</div>
