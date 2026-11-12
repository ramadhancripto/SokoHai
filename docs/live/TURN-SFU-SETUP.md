# SokoHai Live — TURN / SFU setup (owner action required)

**Status of this document:** the code paths described here are implemented and locally tested
to the extent possible without external infrastructure. The external services themselves are
**NOT activated and NOT verified** (no credentials, no paid service, no production deploy — all
of that is owner-gated).

Last updated: 2026-11-12 (Master Completion Project, Stage 3).

---

## 1. What exists today (verified locally)

| Layer | File | Status |
|---|---|---|
| Video transport (mesh, WebRTC) | `js/app/125-live-video.js` (`MeshRtcProvider`) | VERIFIED — host→viewer frames in real browsers (B3, B8, B9, B14, B15) |
| RTC signalling store | `live_sessions/{id}/rtc/{uid}` + `firestore.rules` | VERIFIED — ownership rules (B7 25/25, B11 14/14) |
| Provider abstraction | `skhLiveVideo.useProvider(provider)` | VERIFIED — any object with the same interface swaps in with no UI change (B15 M8) |
| SFU provider | `SfuRtcProvider` (stub in `125-live-video.js`) | IMPLEMENTED BUT NOT VERIFIED — needs provider account + token endpoint |
| ICE / TURN configuration | `iceConfig()` + `window.SKH_ICE` + `<meta name="skh-ice">` | IMPLEMENTED BUT NOT VERIFIED — plumbing verified (B15 M7), no TURN server contacted |
| Host media controls | `#lv7HostMedia` bar (source / camera / microphone / switch) | VERIFIED (B15) |
| Pause / resume | `livePause` / `liveResume` + host controls | VERIFIED (B13 18/18, B14 13/13) |

## 2. Why TURN is needed

The default configuration is:

* `http://127.0.0.1`, `http://localhost` → **no STUN at all** (offline-safe: the sandbox and CI
  must not emit external DNS/network noise).
* any other host → `stun:stun.l.google.com:19302` (STUN only).

STUN is enough when host and viewers can reach each other directly. It is **not** enough on
networks with symmetric NAT / carrier-grade NAT / restrictive corporate firewalls — those need a
TURN relay. The mesh also means the host uploads one stream per viewer (≈0.55 Mbps per viewer
measured locally), which is the reason an SFU becomes attractive beyond a handful of viewers.

## 3. What the owner must provide (TURN)

1. A TURN service with **UDP 3478**, **TCP 3478** and **TLS 5349** reachable from the public
   internet (self-hosted coturn, Twilio Network Traversal, Cloudflare Calls, Metered, Xirsys…).
2. Credentials. Two options:
   * static: `username` + `credential` (simplest, weakest — rotate often), or
   * ephemeral / time-limited credentials minted by a server endpoint (strongly preferred; add a
     callable such as `liveTurnCredentials` that returns `{urls, username, credential, ttl}`).
3. The chosen realm/domain and the bandwidth budget (TURN relays media, so it is billed per GB).

### Wiring it (no code change required)

Static credentials — add to the page head (or to the host template) **before** the live module
loads:

```html
<meta name="skh-ice" content='[
  {"urls":"turn:turn.example.com:3478?transport=udp","username":"USER","credential":"SECRET"},
  {"urls":"turns:turn.example.com:5349","username":"USER","credential":"SECRET"}
]'>
```

or at runtime, before a live starts:

```js
window.SKH_ICE = [
  { urls: 'turn:turn.example.com:3478?transport=udp', username: 'USER', credential: 'SECRET' },
  { urls: 'turns:turn.example.com:5349', username: 'USER', credential: 'SECRET' }
];
```

`window.SKH_ICE` wins over the meta tag; both are sanitised (`iceConfig()` keeps only `urls`,
`username`, `credential`). Nothing else in the app needs to change.

**Do not commit credentials.** For ephemeral credentials, replace `window.SKH_ICE` with a fetch
from a callable that mints them per session.

### Acceptance test once TURN exists

1. Put host and viewer on **different networks** (e.g. host on mobile data, viewer on home Wi-Fi).
2. Start a camera live; confirm `#lv7Remote` has `videoWidth > 0`.
3. In Chrome `chrome://webrtc-internals`, confirm the selected candidate pair is of type `relay`.
4. Repeat with UDP 3478 blocked to confirm the TCP/TLS fallback.

Until that runs, TURN connectivity is **NOT VERIFIED**.

## 4. What the owner must provide (SFU)

Mesh upload grows linearly with viewers. For large audiences an SFU (LiveKit, Agora, Mux/IVS via
HLS, Cloudflare Stream…) is the usual answer. The app already isolates transport behind
`skhLiveVideo.useProvider()`:

```js
skhLiveVideo.useProvider(new SfuRtcProvider({ tokenFn: 'liveSfuToken' }));
```

To finish an SFU integration the owner must supply:

1. Provider account + API key/secret (kept server-side only).
2. Approval to add a **token-minting callable** (e.g. `liveSfuToken`: verifies caller, decides
   publisher vs subscriber, returns a short-lived token).
3. Room/webhook configuration for join/leave events (so viewer counts stay server-authoritative).
4. A decision on recording/egress (billing implication).

The stub `SfuRtcProvider.open()` currently throws `sfu_haijaunganishwa` on purpose: the UI shows a
retryable state instead of pretending video works.

## 5. Verification status summary

| Item | Status |
|---|---|
| Mesh host→viewer video | VERIFIED (local + emulator, 3 viewers at 1.67 Mbps host upload) |
| Mesh at N≥4 viewers | BLOCKED BY EXTERNAL DEPENDENCY — 2 GB / 2 vCPU sandbox can not boot the 4th browser context (boot timeouts); no extrapolation made |
| ICE config injection (`window.SKH_ICE`, meta tag) | IMPLEMENTED BUT NOT VERIFIED (plumbing only) |
| TURN relay connectivity | BLOCKED BY EXTERNAL DEPENDENCY (no server/credentials) |
| SFU provider swap | IMPLEMENTED BUT NOT VERIFIED (interface verified, no provider) |
| Camera / mic / source controls | VERIFIED (B15 10/10) |
