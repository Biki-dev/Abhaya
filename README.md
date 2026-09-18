<div align="center">

<img src="https://raw.githubusercontent.com/Biki-dev/Abhaya/main/assets/icon.png" width="96" height="96" alt="Abhaya logo" />

# Abhaya

**A real-time personal safety companion for Android and iOS.**

One tap, one word, or one detected safety event can start an SOS flow with a cancel window, current location, emergency alert delivery, and a shareable live safety session.

[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-7C3AED?style=flat-square)](https://github.com/Biki-dev/Abhaya)
[![Expo](https://img.shields.io/badge/Expo-54-000020?style=flat-square&logo=expo)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Backend](https://img.shields.io/badge/backend-Render-46E3B7?style=flat-square)](https://abhaya-backend.onrender.com)

</div>

## Product overview

Abhaya is designed for the moment when opening an app is already too difficult. The user can start an SOS from the home screen, trigger the flow through the configured voice keyword, or use safety tracking and route check-in. A short countdown reduces false alarms. The app then sends the alert through the hosted backend and keeps the latest location available to the live safety viewer.

The viewer is a secure, temporary web page. A trusted contact can open it without installing the app and see the session status, latest location, timestamp, accuracy, expiry, and acknowledgement control. It does not expose the user's phone number or subscription data.

## Architecture

```text
Expo / React Native app
        │ HTTPS + Socket.IO
        ▼
Hosted Node.js API on Render ───── PostgreSQL database
        │
        ├── SOS and safety-session routes
        ├── Twilio SMS integration
        ├── Prisma migrations and purchase snapshots
        └── Static trusted-contact viewer deployed separately
```

The repository contains the mobile app, backend, database schema and migrations, and the static viewer. The mobile app defaults to the hosted API configured in `app.json`. The backend uses PostgreSQL through Prisma. The viewer uses a short-lived token and Socket.IO for live updates.

## End-to-end safety flow

The existing project flowchart below shows how a safety event moves from the device to the backend, database, emergency delivery, and trusted-contact viewer.

<p align="center">
  <img src="https://raw.githubusercontent.com/Biki-dev/Abhaya/main/flow.png" alt="Abhaya end-to-end safety flowchart" width="960" />
</p>

The mobile app remains responsible for user consent, countdown control, and plan-aware UI. The backend stores safety sessions and purchase-history snapshots, while RevenueCat remains the authority for client-side subscription entitlements. The public viewer receives only the temporary session data required to follow the active safety event.

## Run the mobile app with the hosted backend

### Prerequisites

Install Node.js 18 or newer, Git, and one native target:

- **Android:** Android Studio, an emulator or USB-connected device, and a development build.

Expo Go can preview basic screens, but it cannot validate RevenueCat purchases, background location, foreground services, or the Edge Impulse native asset flow. Use a development build for the complete demo.

### Install and configure the app

```bash
git clone https://github.com/Biki-dev/Abhaya.git
cd Abhaya
npm install
cp .env.example .env
```

The default API is already configured as:

```text
https://abhaya-backend.onrender.com
```

You only need to add the public RevenueCat Test Store keys if you want to test subscriptions. The frontend template is [`.env.example`](.env.example).

### Start a basic preview

```bash
npm start
```

Use this path for navigation and non-native UI review. For the complete feature set, create a development build.

### Build the complete Android app

```bash
npx expo prebuild --clean --platform android
npx expo run:android
```

Alternatively, create an installable EAS development build:

```bash
eas build --profile development --platform android
npx expo start --dev-client
```

After installation, grant the requested permissions. For background location, Android may require the user to enable **Allow all the time** in system settings after first granting foreground location.

Use a development build for microphone, notifications, background location, and RevenueCat Test Store testing.

## Backend deployment for maintainers

The hosted Render backend must have a PostgreSQL database and the backend environment variables configured. A judge using the hosted API can skip this section.

### Backend environment

Copy [`backend/.env.example`](backend/.env.example) to `backend/.env` and set:

| Variable | Required | Purpose |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Prisma. |
| `PORT` | No | HTTP port; defaults to `4000`. |
| `VIEWER_URL` | No | Base URL used to generate trusted-contact links. |
| `TWILIO_ACCOUNT_SID` | For SMS | Twilio account identifier. |
| `TWILIO_AUTH_TOKEN` | For SMS | Twilio server credential. |
| `TWILIO_FROM_NUMBER` | For SMS | Verified Twilio sender number. |
| `POLICE_FALLBACK_NUMBER` | No | Fallback number in E.164 format. |

Never put backend credentials in the Expo `.env` file or in the mobile bundle.

### Run the backend locally

```bash
cd backend
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

The backend listens on `http://localhost:4000`. Verify it with:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{"ok":true}
```

### Use a local backend with a physical device

The phone cannot reach the computer through `localhost`. Find the computer's LAN address and set this in the root `.env`:

```env
EXPO_PUBLIC_LAN_API_BASE_URL=http://192.168.1.25:4000
```

Keep the phone and computer on the same Wi-Fi network, allow port `4000` through the local firewall, and restart Expo after changing `.env`.


## Permissions and privacy

The app requests permissions only for declared safety functions:

- **Location:** current and background safety tracking.
- **Microphone:** voice keyword detection and emergency audio features.
- **Notifications:** countdown, SOS, check-in, and foreground-service status.
- **Android foreground service and wake lock:** continued location updates while the screen is off.

Android may stop background work after a force-stop, and device manufacturers may apply additional battery restrictions. Background location and sensor behavior must be tested in a native development or release build, not only in Expo Go.

## Quality checks

Run these checks before submitting changes:

```bash
npm run typecheck
npm test
cd backend && npm run build
```

The Android Edge Impulse files are copied during native prebuild by `plugins/withEdgeImpulseAssets.js`. If the classifier reports missing Android assets, uninstall the old build and rebuild:

```bash
npx expo prebuild --clean --platform android
npx expo run:android
```

## Repository layout

```text
App.tsx                 Expo application root
context/                Global location and SOS providers
screens/                App screens and user flows
services/               API, SOS, notifications, RevenueCat, and storage logic
backend/                Express server, Socket.IO, Prisma schema, and migrations
web-viewer/             Static trusted-contact live-session viewer
plugins/                Expo native asset configuration
assets/                 Icons, model assets, and application artwork
```

<div align="center">

Built by [Biki Kalita](https://github.com/Biki-dev)

</div>
