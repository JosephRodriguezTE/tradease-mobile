# Tradease — Deferred Feature Backlog

These items were explicitly cut from the current build (Phases 1–5). They are logged here for future sprints.

## Payments
- [ ] **Stripe integration** — waiting on parent consent (user is 17). When ready, wire `PaymentProvider` mock to Stripe auth/capture. Map: hold = auth, release = capture.
- [ ] **Payment screens** — blocked on Stripe. Currently using `mock_payment_provider`.

## Media
- [ ] **360° photos / panoramic capture** — customer-facing immersive job documentation.
- [ ] **Blueprints / floor plans** — upload and annotation overlay.
- [ ] **Inspection report parsing** — extract fields from PDF inspection reports.

## Communication
- [ ] **Voice notes in chat** — audio recording + playback in the chat thread.

## Documentation
- [ ] **Equipment manuals** — attach equipment manuals to a work order or company profile.
- [ ] **Warranty document generation** — auto-generate warranty PDFs after job completion.

## Scheduling
- [ ] **Multi-employee assignment** — assign more than one contractor to a single work order; track per-employee time.

## Security / Compliance
- [ ] **IP/device fraud logging** — log IP and device fingerprint on login and booking events for fraud detection.

## Background Tasks
- [ ] **Background location (app killed mid-drive)** — requires `expo-task-manager` (not yet installed). When added:
  ```
  npm install expo-task-manager
  ```
  Register `LOCATION_TASK_NAME` in `lib/locationService.ts` and configure in `app.json` background modes.

## E2E Coverage Gaps
- [ ] **72-hour auto-capture scenario** — requires time manipulation in test environment; test that payment auto-captures when customer never approves.
- [ ] **App killed mid-drive resume** — requires background task (see above) to be in place first.

---

*Last updated: 2026-07-15*
