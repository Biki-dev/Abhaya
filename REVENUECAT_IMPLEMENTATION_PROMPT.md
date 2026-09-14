# RevenueCat Sandbox Payment Implementation Prompt for Abhaya

Copy the prompt below into the coding agent that will implement the feature.

---

## Prompt

You are working in the existing GitHub repository `Biki-dev/Abhaya`, an Expo React Native safety application with a TypeScript/Express backend and PostgreSQL/Prisma database.

Implement **RevenueCat subscription payments in test mode only**. Do not enable production purchases, do not use real store credentials, and do not charge real users.

### Product decision

Use this three-tier plan model for the first implementation:

| Plan | Test product identifiers | Suggested production positioning | Features |
|---|---|---|---|
| **Free** | No purchase required | Free | SOS, emergency contacts up to 3, core safety tracking, basic profile, basic route check-in |
| **Abhaya Plus** | `abhaya_plus_monthly_test`, `abhaya_plus_yearly_test` | ₹99/month or ₹799/year | Unlimited emergency contacts, full route history, enhanced sensor/fall alerts, and extended safety history |
| **Abhaya Family** | `abhaya_family_monthly_test`, `abhaya_family_yearly_test` | ₹199/month or ₹1,499/year | Everything in Plus with expanded safety history and priority alerts |

The prices above are only suggested future production prices. For this task, create **RevenueCat Test Store products only** with clearly marked test pricing. Do not present the suggested production prices as real charges.

Keep the Free plan useful. Do not paywall the primary emergency SOS function, emergency calling, or basic safety protection.

### RevenueCat configuration

Use RevenueCat's built-in **Test Store** for development. Configure:

- Entitlement: `abhaya_plus`
- Entitlement: `abhaya_family`
- Offering identifier: `default`
- Packages in the default offering:
  - `$rc_monthly` mapped to `abhaya_plus_monthly_test`
  - `$rc_annual` mapped to `abhaya_plus_yearly_test`
  - A custom family monthly package mapped to `abhaya_family_monthly_test`
  - A custom family annual package mapped to `abhaya_family_yearly_test`

If RevenueCat's current dashboard does not allow the exact package identifier above, use the closest valid RevenueCat package type and document the final mapping in the README. Product identifiers must remain exactly as configured in the RevenueCat Test Store.

Attach products to entitlements as follows:

- Plus monthly and Plus yearly products → `abhaya_plus`
- Family monthly and Family yearly products → `abhaya_family`

Do not grant access based only on the product ID. Use RevenueCat `CustomerInfo.entitlements.active` as the source of truth.

### Expo implementation requirements

1. Inspect the existing Expo SDK version and package manager before changing dependencies.
2. Install compatible versions of:
   - `react-native-purchases`
   - `react-native-purchases-ui` only if using RevenueCat's native paywall/customer center UI
   - `expo-dev-client`
3. Do not claim that this works in Expo Go. RevenueCat native modules require an Expo development build or EAS build.
4. Add a development build configuration without breaking the existing Android/iOS configuration.
5. Use separate environment variables for Test Store keys:
   - `EXPO_PUBLIC_REVENUECAT_TEST_APPLE_KEY`
   - `EXPO_PUBLIC_REVENUECAT_TEST_GOOGLE_KEY`
6. Never commit API keys or store credentials. Add/update `.env.example` with placeholders only.
7. Select the platform-specific Test Store key using `Platform.OS`.
8. Initialize RevenueCat exactly once at app startup, preferably through a small service such as `services/revenueCat.ts`.
9. Set verbose RevenueCat logs only in development builds.
10. Identify the RevenueCat customer using the existing authenticated Abhaya user phone number only after normalizing it, or use a stable existing user identifier. Do not use a random ID on every launch.
11. On login/bootstrap, call `Purchases.logIn(appUserId)` and handle the returned `CustomerInfo`.
12. On logout, call `Purchases.logOut()` and clear only the local subscription cache; do not delete RevenueCat customer data.

### Required app behavior

Add a subscription screen reachable from Settings, with:

- Current plan display: Free, Plus, or Family
- Test-mode badge clearly saying `TEST MODE — NO REAL CHARGE`
- Monthly and yearly Plus options
- Monthly and yearly Family options
- Product title, description, price returned by RevenueCat, and billing period
- A highlighted yearly option showing the calculated savings only when both prices are available
- Purchase buttons with loading states
- Restore Purchases button
- Manage Subscription button or a clear message explaining that store management is used in the real store build
- Link/placeholders for Terms of Use and Privacy Policy
- Error states for cancelled purchases, unavailable offerings, network errors, invalid configuration, and already-owned subscriptions
- A success state after purchase and immediate entitlement refresh

Do not hard-code prices in the UI. Render the localized price and product metadata returned by RevenueCat. The suggested INR prices are product strategy guidance only, not UI values.

### Entitlement access rules

Create a single reusable hook/service, for example `useSubscription()` or `services/subscriptions.ts`, that exposes:

- `isPlusActive`
- `isFamilyActive`
- `isPremiumActive`
- `currentPlan`
- `customerInfo`
- `offerings`
- `isLoading`
- `purchasePackage(packageToPurchase)`
- `restorePurchases()`
- `refreshCustomerInfo()`

Access rules:

- `isFamilyActive` grants Family and Plus-level features.
- `isPlusActive` grants Plus features.
- `isPremiumActive` is true when either Plus or Family is active.
- Free users retain core SOS and emergency functionality.
- All premium feature gates must fail open to safe emergency behavior. A RevenueCat/network error must never disable SOS, emergency calling, or basic safety tracking.
- Do not use AsyncStorage as the authority for paid access. It may cache the last known state for display only.
- Refresh CustomerInfo on app startup, after login, after purchase, after restore, and when returning to the subscription screen.

### Backend and database requirements

Do not store payment secrets in the mobile app or backend.

For this first sandbox implementation:

- Use RevenueCat CustomerInfo on the client for entitlement display and feature gating.
- Do not create a fake `isPremium` boolean in PostgreSQL.
- Do not trust a client-submitted premium flag.
- If the existing backend needs subscription status later, propose a separate RevenueCat webhook endpoint with signature verification, but do not add an unverified webhook in this task.
- Document how a future webhook-backed server entitlement check should be added before production launch.

### Test-only acceptance criteria

The implementation is complete only when all of the following work in a RevenueCat Test Store development build:

1. App starts without crashing when Test Store keys are missing; it stays in Free mode and shows a useful configuration warning in development.
2. App starts without crashing when the network is unavailable.
3. Free user can use SOS and core safety features.
4. Subscription screen loads the configured Test Store offering.
5. Plus monthly purchase unlocks `abhaya_plus`.
6. Plus yearly purchase unlocks `abhaya_plus`.
7. Family purchase unlocks `abhaya_family` and all Plus features.
8. Cancelled purchase shows a non-destructive message and leaves the user on the current plan.
9. Restore Purchases refreshes entitlements correctly.
10. App restart restores the entitlement through RevenueCat CustomerInfo.
11. Logout logs out the RevenueCat customer and the next user cannot see the previous user's entitlement.
12. Invalid/missing API key does not crash the app.
13. No production API key, App Store product, Google Play product, Stripe key, or real payment credential is committed.
14. Tests cover plan calculation, entitlement mapping, loading states, cancelled purchases, restore failures, and missing offerings.

### Deliverables

Produce:

- RevenueCat service/module
- Subscription screen
- Subscription state hook/context if needed
- Settings entry point to the subscription screen
- Development/Test Store configuration changes
- `.env.example` updates
- Any required app configuration changes
- Unit tests for entitlement mapping and error handling
- README section with exact Test Store dashboard setup steps
- A list of files changed
- Commands used to build and test the Expo development build
- A clear note that Expo Go cannot test the native RevenueCat module

Before finishing, run the project type checker and backend build. Report any checks that cannot run and why. Do not push or publish anything unless explicitly asked.

Use these official references while implementing:

- Expo installation: https://www.revenuecat.com/docs/getting-started/installation/expo
- Sandbox testing: https://www.revenuecat.com/docs/test-and-launch/sandbox
- Test Store: https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store
- Products, entitlements, and offerings: https://www.revenuecat.com/docs/offerings/products-overview

---

## Important setup note

RevenueCat's Test Store can be used without App Store Connect or Google Play Console setup. However, because this is an Expo app with native RevenueCat modules, testing should use an **Expo development build**, not Expo Go. Before production, create real Apple/Google products and switch to platform-specific production keys only after completing platform sandbox testing.
