# Android APK: app icon replacement

Date: 2026-11-20. Branch: `remediation/server-20261120` (uncommitted).

## 1. What was found

**The repository has no Android project.** The scan covered `git ls-files` and the two connected folders (`real-sokohai-complete` and `sokohai-remediation`). None of the following exist:

- `AndroidManifest.xml`;
- `res/mipmap-*`;
- `capacitor.config.*`;
- `twa-manifest.json`;
- `build.gradle`;
- a keystore.

The other Desktop folders could not be opened without extra folder access. The local shell on the computer could not start because of low disk space, so it could not search them either.

The only icon configuration the APK can read is the **web app manifest**. Any wrapper (PWABuilder, Bubblewrap/TWA, WebView) builds its launcher icons from it.

| File | Current icon reference |
|---|---|
| `sokohai-manifest.json` (served by `index.html`, `<link rel="manifest">`) | `assets/img/sokohai-app-192-v2.png` (192, purpose `any`) and `assets/img/sokohai-app-512-v2.png` (512, purpose `any`). There is **no `maskable` icon**, so Android adaptive masks shrink the icon onto a white plate. |
| `index.html` | `<link rel="icon">` and `<link rel="apple-touch-icon">` use `assets/img/sokohai-app-192-v2.png` |
| `assets/sokohai-manifest.json` (old copy, not linked) | `assets/sokohai-s-mark.png` |
| `icon-192.png`, `icon-512.png` (repo root, RGB) | not referenced by the manifest |

**`.well-known/assetlinks.json` is missing.** A Trusted Web Activity APK therefore cannot verify the domain and opens with a browser address bar. This must be added together with the APK's package name and signing SHA-256. It is a separate owner step: the package name and signing key were not available here, and they must not be changed.

## 2. The image the owner supplied

| Property | Value |
|---|---|
| File | `Glossy_Green_and_Gold_Shopping_Cart_Icon.png` |
| Size | 1254 × 1254 px PNG, RGB with no transparency |
| sha256 (first 16 characters) | `0ac8f2e02e5d7c9a` |
| Content | Green rounded-square tile, white face, green "S"-shaped cart with gold basket rim, speed lines and wheels, gold/green wave at the bottom, soft green glow on a white background |

**Suitability:**

- Good:
  - the subject is centred;
  - it has strong contrast;
  - the cart is recognisable at 48 px (checked on the preview sheet).
- Limitations:
  - the image has its own rounded frame and an outer glow, but no transparency;
  - the glow and white margin were cropped away, and the tile corners were made transparent (corner radius about 21.5 %).

No artwork was redrawn, recoloured or invented.

## 3. Resources prepared (not yet wired into a project)

The resources are in `_sokohai-local\\sokohai-app-icon-android-res-20261120.zip` (Android `res/` + `mkicons.py`) and `…\\sokohai-app-icon-pwa-play-20261120.zip`, with the preview in `…\\sokohai-icon-mask-preview.png`. The full pack, including the 1024 px master tile, is the chat download `sokohai-app-icon-pack-20261120.zip`. Everything was generated reproducibly by `mkicons.py`.

| Resource | Sizes | How it was made |
|---|---|---|
| `res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png` | 48 / 72 / 96 / 144 / 192 | tile at 92 % on a transparent background (legacy launchers, API ≤ 25) |
| `res/mipmap-*/ic_launcher_round.png` | same | white circle with the tile at 70 %, so no corner is cut |
| `res/mipmap-*/ic_launcher_foreground.png` | 108 / 162 / 216 / 324 / 432 | tile scaled to 72/108 of the canvas: the cart lies inside the 66 dp safe zone, so circle, squircle, rounded-square and teardrop masks keep it whole |
| `res/mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml` | — | `<adaptive-icon>`: background `@color/ic_launcher_background`, foreground `@mipmap/ic_launcher_foreground` |
| `res/values/ic_launcher_background.xml` | — | `#FFFFFF` |
| `play-store/sokohai-play-icon-512.png` | 512 × 512 | Google Play listing icon (32-bit PNG) |
| `pwa/sokohai-app-{192,512}-v3.png` | 192, 512 | manifest `purpose: "any"` |
| `pwa/sokohai-app-{192,512}-maskable-v3.png` | 192, 512 | manifest `purpose: "maskable"`, tile at 78 % (inside the 80 % maskable safe zone) |
| `VERIFY-mask-preview.png` | — | the icon under 5 launcher masks and at 24/32/48 px |

**Not produced: an Android 13+ monochrome (themed) icon.** It needs a single-colour silhouette of the cart, which would be new artwork. If the owner wants themed icons, supply a flat one-colour cart silhouette on a transparent background (see §5).

## 4. Safe integration (owner approval required; nothing was changed)

**A. If the APK is built from the web manifest (PWABuilder / Bubblewrap). This is the most likely case.**

1. Copy `pwa/*.png` to `assets/img/`.
2. In `sokohai-manifest.json`, replace the two `icons` entries with four:
   - 192 and 512 `-v3` with `"purpose": "any"`;
   - 192 and 512 `-maskable-v3` with `"purpose": "maskable"`.

   The new file names avoid the old service-worker cache.
3. Optionally point `index.html` `rel="icon"` and `apple-touch-icon` at `sokohai-app-192-v3.png`. This also changes the browser tab icon, so it is a separate owner choice.
4. Deploy the site. Then regenerate the APK in PWABuilder or with `bubblewrap update`. Keep:
   - the **same package ID**;
   - the **same signing key / keystore**;
   - `versionCode` + 1.
5. Install on a test phone and check the launcher icon under circle and squircle masks, and in the app switcher.

**B. If an Android Studio / Capacitor project exists elsewhere.**

1. Copy `android/res/*` into `app/src/main/res/`, replacing only the `ic_launcher*` files and `values/ic_launcher_background.xml`.
2. Check that `AndroidManifest.xml` has `android:icon="@mipmap/ic_launcher"` and `android:roundIcon="@mipmap/ic_launcher_round"`.
3. Do not touch `applicationId`, `signingConfigs` or the keystore.
4. Build a signed release with the existing key, bump `versionCode`, and test as in A.5.

## 5. What to send if a better master is wanted (optional)

| Requirement | Value |
|---|---|
| Format | PNG with transparency (or SVG) |
| Size | **1024 × 1024 px or larger** |
| Layer 1 (foreground) | the cart only, on a **transparent** background, centred, filling no more than the central 66 % |
| Layer 2 (background) | a plain colour (hex code) or a full-bleed 1024 image with no important detail at the edges |
| Optional layer 3 (Android 13 themed icon) | a flat single-colour silhouette of the cart on transparent |
| Avoid | outer glow, drop shadow outside the tile, thin text, a pre-drawn rounded frame (Android masks it again) |

The supplied image works as it is. The separate layers above would give a sharper adaptive icon, with full-bleed colour instead of the tile on white.

## 6. Status

| Item | Status |
|---|---|
| Icon configuration inspected | Done. Web manifest only; no Android project in the repository or connected folders. |
| Image requirements | Done (§5) |
| Launcher resources from the owner's image | **Provisional** (earlier image), prepared and checked visually (`VERIFY-mask-preview.png`). To be regenerated from the approved image (§7). |
| Applied to the manifest or an APK project | **Waiting for owner approval** and the location of the APK build project (PWABuilder account, Bubblewrap folder, or Android Studio project) |
| `assetlinks.json` | **Owner action**: needs the APK package name and signing SHA-256 |

## 7. Owner decision (2026-11-20): wait for the approved image

The owner will supply the **approved** SokoHai image. **Nothing is installed or replaced until then.** The packs in §3 were made from the earlier image. They are **provisional** and will not be used unless the owner approves that same image.

**Image to send:**

| Requirement | Value |
|---|---|
| File type | **PNG** (32-bit RGBA, with transparency). SVG is also accepted. |
| Dimensions | **1024 × 1024 px** (square; anything larger and square is fine) |
| Colour | sRGB |
| Content | the logo centred, with the important part inside the central **66 %** (about 676 px), so circular masks never cut it |
| Background | transparent, **or** state one plain background colour (hex) |
| Optional extras | (a) a separate full-bleed background layer 1024 × 1024; (b) a single-colour silhouette PNG for the Android 13 themed icon |
| Avoid | outer glow or shadow, a pre-drawn rounded frame, thin text |

**Package that will be used after approval.** The same generator (`mkicons.py`, unchanged) will be run on the approved image. It produces the same structure as the provisional packs, under new names so nothing is overwritten:

- `sokohai-app-icon-android-res-<date>-approved.zip`: `res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png`, `ic_launcher_round.png`, `ic_launcher_foreground.png`, `mipmap-anydpi-v26/ic_launcher.xml` + `ic_launcher_round.xml`, `values/ic_launcher_background.xml`.
- `sokohai-app-icon-pwa-play-<date>-approved.zip`: `sokohai-app-{192,512}-v3.png` (`any`), `sokohai-app-{192,512}-maskable-v3.png` (`maskable`), and the Play icon 512 × 512.
- A new mask preview for the owner to check before anything is integrated.

Integration then follows §4 (path A or B). Package ID, signing key and keystore stay as they are.
