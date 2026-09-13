# Abhaya Ship-a-Ton Next Gen Winning Plan

**Prepared:** September 13, 2026  
**Target:** Ship-a-Ton Next Gen 2026  
**Application:** Abhaya personal safety app  
**Submission deadline identified in the current rules:** September 30, 2026 at 11:45 p.m. PDT. Re-check the live rules before submission because the organizer may change dates or requirements.[1]

## Executive conclusion

Abhaya is already broad enough to make a strong hackathon entry. Its current codebase includes one-tap SOS, countdown cancellation, location tracking, emergency contacts, route check-ins, guardian surfaces, sensor fusion, voice-keyword detection, BLE experiments, a web viewer, and RevenueCat Test Store subscriptions.

The highest-probability winning strategy is **not** to add more disconnected features. It is to make one safety promise undeniable:

> **When a person is in danger, Abhaya creates a calm, cancellable path from one action to a trusted person who can see what happened and act.**

The primary demo should show this causal chain:

`Free account → trusted contact → SOS countdown → cancel or confirm → location freshness → notification/request status → guardian live view → recovery`, followed by a RevenueCat Test Store purchase that unlocks one clearly useful enhancement.

This strategy directly supports the published Next Gen criteria: a clear and useful idea, meaningful progress toward a working app, thoughtful RevenueCat use, and thoughtful technical, product, and presentation quality.[1]

There is no guaranteed winning formula. The recommendations below maximize judge-visible evidence and reduce the largest risks found in the current repository.

## 1. What the judges are likely to evaluate

The official Next Gen rules state that judges may rely solely on the submission description, video, screenshots, and public repository rather than testing the project themselves.[1] Therefore, every important claim must be visible in the first two minutes or immediately verifiable in the repository.

| Published requirement or judging signal | What Abhaya must visibly prove | Current position |
|---|---|---|
| Clear, useful, interesting, original idea | One sentence explaining the user, danger moment, and outcome | Strong product basis, but currently too many features compete for attention |
| Meaningful progress toward a working app | A physical-device demo of one complete safety flow | Code is substantial; native-device and end-to-end delivery proof remain incomplete |
| Thoughtful RevenueCat use | Free emergency value, paid enhancement, purchase, entitlement unlock, and restore | RevenueCat flow exists; Test Store configuration and physical-device proof remain to be demonstrated |
| Technical and product quality | Calm emergency UX, honest status states, privacy decisions, clean setup, reliable failure handling | Several good foundations exist; guardian data and delivery states need hardening |
| Public repository | Source, assets, instructions, license, and reproducible build path | A root open-source `LICENSE` was not found and must be added immediately |
| Submission video | Public English video under two minutes with device footage | Must be recorded on the exact tagged build submitted |

## 2. The product position to use everywhere

Use this positioning in the README, Devpost description, video opening, and presentation:

> **Abhaya is a personal safety companion that turns a tap, voice trigger, or route-check-in failure into a cancellable, location-aware alert for a trusted person. Core protection stays free. Paid plans add capacity and coordination rather than putting emergency help behind a paywall.**

Do not lead with “AI,” “BLE mesh,” “crime zones,” or “many sensors.” Those are implementation details. Lead with the outcome a frightened or distracted person needs.

A strong short description is:

> **Abhaya helps people get help without navigating a phone under stress. It combines a one-tap SOS, cancellable countdown, live location, route check-ins, and trusted-person alerts. RevenueCat powers ethical upgrades for richer history, enhanced sensing, and family coordination while core SOS remains free.**

## 3. What to keep, improve, defer, or remove from the demo

### Keep in the headline experience

| Capability | Decision | Reason |
|---|---|---|
| One-tap SOS | Keep and polish first | It is the clearest safety action and easiest for a judge to understand |
| Countdown and cancellation | Keep and make visually excellent | It proves humane safety design and reduces false-alert anxiety |
| Current location and freshness | Keep and make explicit | A location without timestamp or accuracy is not trustworthy |
| Emergency contacts | Keep | It creates a concrete recipient for the safety outcome |
| Route check-in | Keep as the second scenario | It demonstrates proactive protection, not only panic response |
| Live-tracking web view or guardian view | Keep only if live and reliable | It makes the alert outcome visible to another person |
| Free/Plus/Family boundary | Keep | It gives RevenueCat a meaningful product role |
| Test Store purchase and restore | Keep | It proves RevenueCat is part of the product, not decorative code |

### Keep in the product but do not headline unless verified

| Capability | Treatment |
|---|---|
| Voice-keyword detection | Show only if it works reliably on the exact judging device. Otherwise describe it as an optional trigger in the repository. |
| Fall and motion detection | Use as an optional Plus enhancement if the physical-device behavior is deterministic. Do not make it the only safety path. |
| BLE button/wearable support | Label beta unless pairing, triggering, permissions, and fallback behavior are all reproducible. |
| Sensor dashboard | Keep as a Plus/Family unlock, but show only one useful insight rather than a dense engineering console. |
| Emergency audio | Keep out of the headline unless recording, privacy, storage, and playback are fully demonstrated. |
| Crime-zone and police lookup | Keep as supporting infrastructure. Do not claim guaranteed police response or safety prediction. |

### Remove from the winning narrative

Do not delete working code merely to prepare the hackathon. Remove features from the demo path, screenshots, and headline description when they increase risk without improving the central proof.

Exclude these from the primary video unless they are fully tested:

- BLE mesh identity and proximity-routing claims.
- Police lookup or language implying guaranteed emergency-service dispatch.
- Hard-coded guardian people, coordinates, or alert history.
- Dense sensor charts that do not lead to a clear user outcome.
- Claims of production billing, App Store revenue, guaranteed delivery, or server-verified entitlement.
- Any feature that requires a judge to configure multiple devices or accounts during the video.

The 2024 and 2025 winner retrospectives repeatedly emphasize focused positioning, polished interaction, feasible monetization, and visible user value rather than maximum feature count.[2] [3]

## 4. Highest-priority changes to the codebase

### P0: Add eligibility and repository safeguards

Complete these before product polish:

1. Add a recognized root open-source license, such as `LICENSE` with the MIT License, if that license accurately reflects the team’s intent.
2. Verify the GitHub repository is public.
3. Remove or replace any real phone numbers, locations, tokens, credentials, and personal data in screenshots, seed data, comments, and demo fixtures.
4. Add a `DEMO.md` file containing the exact tested device, build profile, test account setup, Test Store IDs, expected behavior, and known limitations.
5. Tag the exact commit used for recording, for example `shipaton-2026-demo`.
6. Perform a clean-checkout test from the public repository, not only from the current working directory.

The official Next Gen rules explicitly require a public/open-source repository containing the source, assets, and instructions, including an open-source license detectable at the repository top.[1]

### P0: Build a real demo mode without faking emergency delivery

Add a controlled demo configuration that uses synthetic contacts and deterministic UI data, but never claims that a simulated notification was delivered.

The product should distinguish these states:

| State | Meaning |
|---|---|
| `Preparing` | The user has initiated the safety action and the app is collecting the latest location |
| `Countdown` | The user can cancel before escalation |
| `Queued` | The app accepted the alert locally but the network/provider has not confirmed delivery |
| `Sent` | The configured provider accepted the message/request |
| `Acknowledged` | The trusted person or guardian confirmed receipt |
| `Offline` | The app could not reach the backend/provider and explains the next safe action |
| `Completed` | The user ended the safety session safely |

Never show “Alert delivered” merely because a local function returned successfully. This is one of the most important trust improvements for a safety product.

### P0: Make the guardian view real or remove it from the core claim

The current guardian screen contains hard-coded sample data such as a named person, fixed coordinates, and static alert history. That is a significant demo credibility risk.

Choose one path:

- **Preferred:** implement a minimal live guardian view that reads the active safety session and displays the real demo user, latest timestamp, status, location, and acknowledgement action.
- **Fallback:** use the existing shareable web viewer and show a live session link with synthetic data clearly marked as a demo.
- **Last resort:** remove Family Guardian from the main pitch and demonstrate Plus route history or sensor insights instead.

Do not present static data as live family protection.

### P0: Prove RevenueCat on the exact physical device

The repository already includes the correct general architecture: platform-specific Test Store keys, stable customer identity, `CustomerInfo.entitlements.active`, Plus/Family products, purchase, restore, and fail-open Free behavior.

Before recording, verify all of these on the same native development build:

1. Missing keys produce a useful warning and do not crash the app.
2. The Free user can trigger core SOS.
3. The default offering loads.
4. Plus monthly purchase unlocks `abhaya_plus`.
5. Plus yearly purchase unlocks `abhaya_plus`.
6. Family purchase unlocks `abhaya_family` and Plus-level features.
7. Cancelled purchase leaves the current plan unchanged.
8. Restore refreshes the entitlement.
9. Logout prevents the next user from seeing the previous user’s paid state.
10. App restart restores the entitlement through RevenueCat.
11. The purchase snapshot is stored as history, but the database is not used as entitlement authority.

The UI should show the Test Store badge and explicitly state that there is no real charge. Do not describe Test Store access as production revenue.

### P1: Make the premium value obvious in one screen

Use one primary paid upgrade for the video. The best choice is likely:

- **Plus:** enhanced sensor insights or extended route history.
- **Family:** only if the guardian view is genuinely live and useful.

Do not demonstrate four paid features in the video. A judge should be able to answer “what did the purchase unlock?” within five seconds.

Recommended paywall copy:

> **Free protects the moment. Plus helps you understand and coordinate what happens next.**

The pricing should continue to come from RevenueCat product metadata. Do not hard-code production INR prices in the UI.

### P1: Add test coverage for the judge-visible boundaries

The current five tests cover basic plan mapping and error messages. Add tests for:

- Free, Plus, and Family entitlement matrix.
- Family inheriting Plus features.
- Missing RevenueCat keys.
- Missing offerings.
- Purchase cancellation.
- Restore failure.
- Logout/customer switching.
- RevenueCat/network failure leaving SOS available.
- Snapshot persistence being best-effort and not an access authority.
- Purchase-to-unlock state transition.

The most valuable invariant is:

> **No RevenueCat failure may disable SOS, emergency calling, basic safety tracking, or basic route check-in.**

### P1: Triage security before making production claims

The audited backend uses phone numbers or user identifiers in several request paths. Before submission, at minimum:

- Add ownership checks to contact, route, session, and subscription-history operations.
- Authenticate Socket.IO room joins and location updates.
- Rate-limit SOS and SMS-triggering routes.
- Prevent arbitrary users from reading another user’s route or contact data.
- Keep RevenueCat database snapshots audit-only unless a signed webhook-backed entitlement service is implemented and tested.
- Remove default production database credentials from deployable configuration.
- Document what data is retained and how a user can delete it.

If a complete secure backend redesign cannot be safely tested before submission, do not imply that the backend is production-ready. Show the working client/demo scope honestly.

## 5. The exact two-minute demo

The official rules require a publicly visible video shorter than two minutes with device footage.[1] Record several versions and choose the one with the clearest causal story.

| Time | Screen/action | Spoken or captioned message |
|---|---|---|
| 0:00–0:10 | Home screen, user and trusted contact configured | “Abhaya helps someone get help without navigating a phone under stress.” |
| 0:10–0:25 | Tap SOS; show current location, timestamp, and countdown | “The alert is cancellable, so a false trigger does not immediately escalate.” |
| 0:25–0:38 | Cancel once, then repeat and let it proceed | “Canceling stops escalation. Confirming continues to the trusted person.” |
| 0:38–0:58 | Show queued/sent state and guardian/live web view | “The guardian sees the current location and alert state, not a static success message.” |
| 0:58–1:08 | End the safety session and show recovery | “The user can complete the session safely and close the alert.” |
| 1:08–1:22 | Open Plans; show Free, Plus, Family, localized product metadata | “Core SOS remains Free. Paid plans add capacity and coordination.” |
| 1:22–1:38 | Purchase one Test Store package | “RevenueCat activates the entitlement for this account.” |
| 1:38–1:48 | Return to premium feature and show the unlock | “The feature changes only after the active RevenueCat entitlement changes.” |
| 1:48–1:56 | Show restore or logout/restart state | “Restore and account switching are handled without exposing another user’s plan.” |
| 1:56–2:00 | Repository/README screenshot and final product statement | “A public repository documents the build, Test Store setup, limitations, and safety boundaries.” |

Use synthetic names and locations. Do not show real phone numbers, real emergency contacts, API keys, or private coordinates. Use original narration or cleared audio only. The rules prohibit unlicensed copyrighted material and allow judges to rely only on the submitted material.[1]

## 6. Seven-day execution schedule

### Day 1: Freeze the strategy and satisfy eligibility

Add `LICENSE`, `DEMO.md`, and the submission-specific README section. Confirm the repository is public. Choose the primary paid unlock. Decide whether the guardian view is live enough to remain in the central demo.

### Day 2: Stabilize the safety vertical slice

Test onboarding, trusted-contact setup, permissions, SOS countdown, cancellation, location freshness, session completion, and the guardian/live view on the target physical device. Remove nonessential screens from the recording route.

### Day 3: Complete the RevenueCat Test Store fixture

Create the four exact Test Store products. Attach the two Plus products to `abhaya_plus` and the two Family products to `abhaya_family`. Populate the `default` offering. Inject public SDK keys through local or EAS secrets, never into Git. Test purchase, restore, cancellation, restart, logout, and missing-offering behavior.

### Day 4: Add targeted tests and reliability states

Add the entitlement matrix tests and Free-SOS invariant tests. Add visible `Queued`, `Sent`, `Acknowledged`, and `Offline` states. Add ownership checks and socket authorization if they can be implemented and verified safely.

### Day 5: Rebuild and rehearse failures

Rebuild the native app after Edge Impulse and RevenueCat changes. Test on the exact device used for recording. Verify app restart, background/foreground transitions, denied permissions, offline behavior, notification behavior, and the native Edge Impulse asset bundle.

Run from a clean checkout:

```bash
npm ci
npm run typecheck
npm test
cd backend && npm ci && npm run build
```

### Day 6: Polish and record

Improve calm typography, countdown hierarchy, haptics, GPS freshness, delivery labels, accessibility contrast, and paywall copy. Record multiple two-minute takes. Select the take with the clearest outcome rather than the greatest number of features.

### Day 7: Freeze and submit

Create a Git tag. Verify the public repository from a clean clone. Upload the 1024×1024 icon and required frameless screenshot. Confirm the video is public, in English or accompanied by English instructions, under two minutes, and recorded from the submitted build. Re-read the live official rules immediately before submitting.

## 7. What not to spend hackathon time on

Do not add another subscription tier. Do not add decorative AI. Do not add OneSignal merely because it appeared in previous award categories. Do not add production store credentials before the Test Store demo is reliable. Do not rebuild the entire backend if the core demo still fails on a physical device.

The 2025 winner retrospective describes strong results across different categories, including products with clear problems, polished design, real user/launch evidence, privacy/accessibility, and thoughtful monetization. These are directional patterns, not guarantees or official hidden weights.[2] The 2024 retrospective similarly highlights focused business positioning, polished interaction, onboarding/paywall quality, and feedback-driven building.[3]

## 8. Internal prioritization rubric

The following is an internal planning model, not an official Ship-a-Ton score:

| Area | Internal weight | Winning evidence |
|---|---:|---|
| Problem clarity and usefulness | 30% | One sentence, one user, one visible outcome |
| Working progress and reliability | 30% | Physical-device SOS-to-guardian flow with honest failure states |
| RevenueCat product thinking | 20% | Free emergency protection, meaningful paid unlock, purchase, restore, entitlement change |
| Technical, product, and presentation quality | 20% | Smooth UX, native build, privacy, accessible design, public repository, concise video |

The highest-impact work is therefore: **eligibility, one reliable vertical slice, physical-device proof, and a visible RevenueCat unlock**. Additional feature breadth has lower expected impact and higher failure risk.

## 9. Final submission checklist

### Eligibility and rules

- Confirm active-student eligibility and qualifying academic email.
- Confirm guardian consent if any entrant is below the local age of majority.
- Re-check the live Next Gen page and official rules immediately before submission.
- Confirm the project is accessible from the United States.

### Repository

- Public GitHub repository.
- Root `LICENSE` file.
- All source code, assets, native configuration, and setup instructions included.
- Exact tested commit or tag referenced in the submission.
- No production keys, private credentials, real contact data, or private location data.
- Clean-checkout commands tested.

### RevenueCat

- At least one working Test Store purchase flow.
- Exact product IDs documented.
- Plus and Family entitlements documented.
- Purchase changes the visible feature state.
- Restore works.
- Cancellation and error states are non-destructive.
- Test Mode/no-real-charge messaging is visible.
- No claim of production revenue or App Store/Google Play billing.

### Video and assets

- Public YouTube or Vimeo URL.
- Less than two minutes.
- Device footage.
- Clear problem, user, product outcome, and monetization flow.
- English narration or English translations.
- Original or properly licensed audio and visuals.
- 1024×1024 app icon.
- At least one frameless 1179×2556 screenshot.

### Technical proof

- `npm run typecheck` passes.
- `npm test` passes.
- `cd backend && npm run build` passes.
- Native development build tested.
- RevenueCat Test Store tested.
- Edge Impulse assets included in the native build.
- Offline, cancellation, restart, restore, and logout behavior rehearsed.

## 10. Recommended final decision

**Do not delete most of Abhaya. Do delete complexity from the winning story.**

The final entry should present three layers:

1. **Free protection:** SOS, emergency calling, basic tracking, basic route check-in, and a trusted contact.
2. **Plus coordination:** richer history and enhanced sensor insight.
3. **Family coordination:** only if the guardian view is truly live; otherwise defer it from the main claim.

The winning artifact is not the largest codebase. It is the most credible two-minute demonstration that a real person can use Abhaya under stress, that another person can understand the alert, and that RevenueCat supports a fair upgrade without paywalling emergency protection.

## References

[1]: https://www.shipaton.com/next-gen "Ship-a-Ton Next Gen 2026"
[2]: https://www.revenuecat.com/blog/company/shipaton-2025-winners "Shipaton 2025 Winners"
[3]: https://www.revenuecat.com/blog/company/2024-ship-a-ton-winners "2024 Ship-a-ton Winners"
[4]: https://www.shipaton.com/go/devpost?to=%2Frules "Ship-a-Ton Official Rules"
[5]: https://github.com/Biki-dev/Abhaya "Abhaya public repository"
