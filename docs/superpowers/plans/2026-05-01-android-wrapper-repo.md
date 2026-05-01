# Android wrapper — `e-OIC-android-wrapper` repo implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `e-OIC-android-wrapper` Capacitor project, ship a signed APK to GitHub Releases via CI, and verify the share + update flows work end-to-end on the node7 emulator.

**Architecture:** A Capacitor Android project whose WebView points at the live e-OIC PWA URL. Three plugins do all the work: `@capacitor/share` (Intent.ACTION_SEND), `@capacitor/filesystem` (cache-write + APK download), `@capacitor-community/file-opener` (launch system installer). A small Kotlin `MainActivity` adds a `JavascriptInterface` named `EoicWrapper` that exposes the build-time wrapper version to the webview. GitHub Actions builds and signs the APK on tag push and uploads it as a Release asset.

**Tech Stack:** Capacitor 6, Android Gradle Plugin (matching Capacitor's expected version, currently 8.x), Kotlin, JDK 17, GitHub Actions.

**Spec:** lives in the e-OIC repo at `docs/superpowers/specs/2026-05-01-android-wrapper-design.md`.

**Prerequisite:** The web-side plan (`2026-05-01-android-wrapper-web-side.md`) must be merged and deployed first — `wrapper-version.json` must be live at `https://nickcason.github.io/e-OIC/wrapper-version.json` before this plan's update flow can be tested.

**Conventions:** Match e-OIC: direct-on-main, scoped commits with conventional prefixes (`feat:`, `chore:`, `fix:`, `docs:`, `ci:`), `git add <specific files>` (never `-A`).

---

## File structure

| Path | Status | Responsibility |
|---|---|---|
| `package.json` | Create | Capacitor dependencies, npm scripts. |
| `capacitor.config.ts` | Create | `server.url` pointing at live PWA; appId. |
| `tsconfig.json` | Create | Minimal TS config so `capacitor.config.ts` compiles. |
| `src/index.html` | Create | Tiny placeholder (Capacitor requires `webDir`; never loaded). |
| `android/` | Create (via `npx cap add android`) | Generated Android project, committed to repo. |
| `android/app/src/main/AndroidManifest.xml` | Modify | Add `REQUEST_INSTALL_PACKAGES`. |
| `android/app/src/main/java/com/etechgroup/eoic/MainActivity.kt` | Modify | Install `EoicWrapper` JavascriptInterface. |
| `android/app/build.gradle` | Modify | Read `WRAPPER_VERSION` from env into `BuildConfig`; signing config from env. |
| `.github/workflows/release.yml` | Create | Tag-driven build + sign + upload-to-Release. |
| `.github/workflows/ci.yml` | Create | PR-trigger debug build for breakage detection. |
| `README.md` | Create | Install/build/release instructions. |
| `docs/install.md` | Create | One-screen field-engineer sideload help (linked from web-side banner). |
| `.gitignore` | Create | Standard Android + Capacitor + node ignores. |

---

## Task 1: Initialize repo and Capacitor project

**Files:**
- Create: `/Users/nickcason/DevSpace/Work/e-OIC-android-wrapper/`

- [ ] **Step 1: Verify parent directory and confirm wrapper repo doesn't exist**

```bash
ls -la /Users/nickcason/DevSpace/Work/ | grep -i e-oic
```
Expected: only `e-OIC` listed; `e-OIC-android-wrapper` absent.

- [ ] **Step 2: Create directory and `cd` in**

```bash
mkdir /Users/nickcason/DevSpace/Work/e-OIC-android-wrapper
cd /Users/nickcason/DevSpace/Work/e-OIC-android-wrapper
git init -b main
```

- [ ] **Step 3: Initialize npm and install Capacitor**

```bash
npm init -y
npm install --save @capacitor/core @capacitor/android @capacitor/share @capacitor/filesystem @capacitor-community/file-opener
npm install --save-dev @capacitor/cli typescript
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["capacitor.config.ts"]
}
```

- [ ] **Step 5: Create `capacitor.config.ts`**

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.etechgroup.eoic',
  appName: 'e-OIC',
  webDir: 'src',
  server: {
    url: 'https://nickcason.github.io/e-OIC/',
    cleartext: false,
    androidScheme: 'https',
  },
};

export default config;
```

- [ ] **Step 6: Create placeholder `src/index.html`**

```bash
mkdir src
```

`src/index.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8"><title>e-OIC wrapper</title></head>
<body>This page is never loaded — the wrapper redirects to the live PWA.</body></html>
```

- [ ] **Step 7: Create `.gitignore`**

```gitignore
node_modules/
dist/
build/
.gradle/
*.apk
*.aab
*.keystore
*.jks
local.properties
android/app/release/
.idea/
.vscode/
.DS_Store
```

- [ ] **Step 8: Initial commit**

```bash
git add package.json package-lock.json tsconfig.json capacitor.config.ts src/index.html .gitignore
git commit -m "chore: scaffold Capacitor project pointing at live e-OIC PWA"
```

---

## Task 2: Generate the Android project

**Files:**
- Create: `android/` (entire directory tree)

- [ ] **Step 1: Run `npx cap add android`**

```bash
npx cap add android
```
This generates the entire `android/` Gradle project. Verify it succeeded:
```bash
ls android/app/src/main/AndroidManifest.xml
ls android/app/src/main/java/com/etechgroup/eoic/MainActivity.java
```
Expected: both exist. (The Java filename may be `MainActivity.java`; Kotlin migration in Task 3.)

- [ ] **Step 2: Run `npx cap sync` to wire plugin native modules**

```bash
npx cap sync android
```
Expected: prints "found X Capacitor plugins" listing share, filesystem, file-opener.

- [ ] **Step 3: Verify Gradle wrapper builds debug APK**

```bash
cd android && ./gradlew assembleDebug && cd ..
ls android/app/build/outputs/apk/debug/app-debug.apk
```
Expected: APK exists. First build downloads dependencies; takes 3-5 min.

If this fails because Android SDK isn't installed locally, document the failure in a comment on the task and proceed — CI handles the build. Local builds are convenience, not a hard requirement.

- [ ] **Step 4: Commit the generated Android project**

```bash
git add android/
git commit -m "feat: generate Android project via cap add android"
```

This commit will be large (Gradle wrapper, build files, generated icons). Expected.

---

## Task 3: Migrate `MainActivity` to Kotlin and add `EoicWrapper` interface

**Files:**
- Delete: `android/app/src/main/java/com/etechgroup/eoic/MainActivity.java`
- Create: `android/app/src/main/java/com/etechgroup/eoic/MainActivity.kt`
- Modify: `android/app/build.gradle`

- [ ] **Step 1: Add Kotlin to the app build**

Open `android/app/build.gradle` and add to the `plugins` block:

```gradle
plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}
```

If `org.jetbrains.kotlin.android` is unknown, add to `android/build.gradle` (the project-level one) inside `buildscript.dependencies`:

```gradle
classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22"
```

- [ ] **Step 2: Replace `MainActivity.java` with a Kotlin version**

```bash
rm android/app/src/main/java/com/etechgroup/eoic/MainActivity.java
```

Create `android/app/src/main/java/com/etechgroup/eoic/MainActivity.kt`:

```kotlin
package com.etechgroup.eoic

import android.os.Bundle
import android.webkit.JavascriptInterface
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Expose the wrapper version (compiled in via BuildConfig) to the
        // webview before any script in the page runs. The web side reads
        // this through window.EoicWrapper.getVersion() inside
        // wrapperBridge.js.
        bridge.webView.addJavascriptInterface(
            EoicWrapperInterface(BuildConfig.WRAPPER_VERSION),
            "EoicWrapper"
        )
    }
}

class EoicWrapperInterface(private val version: String) {
    @JavascriptInterface
    fun getVersion(): String = version
}
```

- [ ] **Step 3: Add `WRAPPER_VERSION` to `BuildConfig`**

In `android/app/build.gradle`, inside the `android { defaultConfig { } }` block, add:

```gradle
buildConfigField "String", "WRAPPER_VERSION", "\"${project.findProperty('wrapperVersion') ?: 'dev'}\""
```

And inside `android { }` (sibling of `defaultConfig`):

```gradle
buildFeatures {
    buildConfig true
}
```

- [ ] **Step 4: Verify the build still succeeds and BuildConfig is generated**

```bash
cd android && ./gradlew assembleDebug -PwrapperVersion=v0-dev && cd ..
```
Expected: builds successfully. Optionally inspect:
```bash
grep WRAPPER_VERSION android/app/build/generated/source/buildConfig/debug/com/etechgroup/eoic/BuildConfig.java
```
Expected: `public static final String WRAPPER_VERSION = "v0-dev";`

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java android/app/build.gradle android/build.gradle
git commit -m "feat: add EoicWrapper JS interface exposing BuildConfig version"
```

---

## Task 4: Manifest permissions and FileProvider check

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Add `REQUEST_INSTALL_PACKAGES` permission**

Open `android/app/src/main/AndroidManifest.xml`. Inside `<manifest>` (alongside any existing `<uses-permission>` elements), add:

```xml
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

Verify the existing `<uses-permission android:name="android.permission.INTERNET" />` is present (Capacitor adds it by default).

- [ ] **Step 2: Verify FileProvider is configured**

`@capacitor/filesystem` and `@capacitor/share` rely on `androidx.core.content.FileProvider` for `content://` URIs. After `npx cap sync`, the manifest should already include a `<provider>` element under `<application>`. Verify:

```bash
grep -A 8 "FileProvider" android/app/src/main/AndroidManifest.xml
```
Expected: a `<provider>` block referencing `androidx.core.content.FileProvider` with `android:authorities="${applicationId}.fileprovider"` (or similar).

If absent, run `npx cap sync android` again — Capacitor's plugin install should add it.

- [ ] **Step 3: Verify build still succeeds**

```bash
cd android && ./gradlew assembleDebug -PwrapperVersion=v0-dev && cd ..
```
Expected: builds.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml
git commit -m "feat: add REQUEST_INSTALL_PACKAGES permission for in-app updates"
```

---

## Task 5: Generate signing keystore and document the secret setup

**Files:**
- Create: `docs/keystore-setup.md` (committed)
- Generate (NOT committed): `eoic-release.jks`

- [ ] **Step 1: Generate the keystore locally**

```bash
keytool -genkeypair -v \
  -keystore eoic-release.jks \
  -alias eoic \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=e-OIC, O=eTechGroup, C=US"
```
You'll be prompted for keystore and key passwords. Use a single strong password for both (simpler) or two — record them somewhere safe (1Password, etc). They are required for every release build forever.

CRITICAL: This keystore file is NOT committed to git. Losing it means future APKs cannot install over existing installs (signature mismatch); users would have to uninstall first. Back it up to two separate locations.

Verify the file is git-ignored:
```bash
git status
```
Expected: `eoic-release.jks` does NOT appear (covered by `*.jks` in `.gitignore`).

- [ ] **Step 2: Base64-encode the keystore for GitHub Actions**

```bash
base64 -i eoic-release.jks -o eoic-release.jks.b64
cat eoic-release.jks.b64 | pbcopy
```
The contents are now on the clipboard. Verify length:
```bash
wc -c eoic-release.jks.b64
```
Expected: typically 3-4 KB.

- [ ] **Step 3: Create the GitHub repo and add secrets**

The GitHub repo doesn't exist yet — create it now (private if you prefer, but public is the spec choice for unauthenticated APK downloads):

```bash
gh repo create NickCason/e-OIC-android-wrapper --public --source=. --remote=origin --push
```
This pushes the existing commits.

Add four repo secrets via the UI (`https://github.com/NickCason/e-OIC-android-wrapper/settings/secrets/actions`) or CLI:

```bash
gh secret set KEYSTORE_BASE64 < eoic-release.jks.b64
gh secret set KEYSTORE_PASSWORD --body 'your-keystore-password'
gh secret set KEY_ALIAS --body 'eoic'
gh secret set KEY_PASSWORD --body 'your-key-password'
```

- [ ] **Step 4: Write `docs/keystore-setup.md` documenting the recovery story**

```markdown
# Keystore setup

## Files
- `eoic-release.jks` — RSA-2048 signing keystore. Validity ~27 years.
- Backed up to: [LIST YOUR BACKUP LOCATIONS HERE BEFORE COMMITTING]

## Secrets
GitHub Actions reads the keystore from these repo secrets:
- `KEYSTORE_BASE64` — base64-encoded keystore
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS` — `eoic`
- `KEY_PASSWORD`

## Rotation
Same keystore must be used for all releases. Losing it means users have
to uninstall before installing a new version. If rotation becomes
necessary, plan for a coordinated reinstall across all field engineers.

## Local release builds
Set the same env vars and pass `-Psigning=true` to Gradle. Most release
builds happen in CI; local builds are for emergencies.
```

Replace `[LIST YOUR BACKUP LOCATIONS HERE BEFORE COMMITTING]` with the actual list.

- [ ] **Step 5: Clean up the base64 file from disk**

```bash
shred -u eoic-release.jks.b64 2>/dev/null || rm eoic-release.jks.b64
```

- [ ] **Step 6: Commit the docs**

```bash
git add docs/keystore-setup.md
git commit -m "docs: keystore setup and recovery"
```

---

## Task 6: Configure Gradle release signing

**Files:**
- Modify: `android/app/build.gradle`

- [ ] **Step 1: Add signing config that reads from environment variables**

Inside the `android { }` block in `android/app/build.gradle`, add:

```gradle
    signingConfigs {
        release {
            def keystorePath = System.getenv('KEYSTORE_PATH') ?: 'release.jks'
            storeFile file(keystorePath)
            storePassword System.getenv('KEYSTORE_PASSWORD') ?: ''
            keyAlias System.getenv('KEY_ALIAS') ?: ''
            keyPassword System.getenv('KEY_PASSWORD') ?: ''
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
```

If `buildTypes.release` already exists, merge the `signingConfig` line into it instead of duplicating the block. Capacitor's generated `build.gradle` typically defines an empty `release { ... }` — replace it.

- [ ] **Step 2: Verify the debug build still works**

```bash
cd android && ./gradlew assembleDebug -PwrapperVersion=v0-dev && cd ..
```
Expected: succeeds. Release build will fail without the keystore file present — that's expected; CI handles release builds.

- [ ] **Step 3: Commit**

```bash
git add android/app/build.gradle
git commit -m "feat: read release signing config from environment variables"
```

---

## Task 7: PR check workflow (debug build)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  build-debug:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - name: Install npm deps
        run: npm ci

      - name: Cap sync
        run: npx cap sync android

      - name: Assemble debug APK
        working-directory: android
        run: ./gradlew assembleDebug -PwrapperVersion=ci-${{ github.sha }}
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: PR-trigger debug build for breakage detection"
git push origin main
```

- [ ] **Step 3: Verify the workflow runs**

```bash
gh run watch
```
Expected: passes. If it fails, fix and re-commit before proceeding.

---

## Task 8: Release workflow (signed APK on tag push)

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflow**

```yaml
name: Release

on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      version:
        description: 'Version tag (e.g. v1)'
        required: true

jobs:
  build-release:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: write   # needed to upload release assets
    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Android SDK
        uses: android-actions/setup-android@v3

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm

      - name: Install npm deps
        run: npm ci

      - name: Cap sync
        run: npx cap sync android

      - name: Decode keystore
        run: |
          echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 --decode > $RUNNER_TEMP/release.jks
          echo "KEYSTORE_PATH=$RUNNER_TEMP/release.jks" >> $GITHUB_ENV

      - name: Resolve version
        id: ver
        run: |
          VERSION="${GITHUB_REF_NAME:-${{ github.event.inputs.version }}}"
          echo "version=$VERSION" >> $GITHUB_OUTPUT

      - name: Assemble signed release APK
        working-directory: android
        env:
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
        run: ./gradlew assembleRelease -PwrapperVersion=${{ steps.ver.outputs.version }}

      - name: Rename APK
        run: cp android/app/build/outputs/apk/release/app-release.apk e-OIC.apk

      - name: Create or update release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          TAG="${{ steps.ver.outputs.version }}"
          if gh release view "$TAG" >/dev/null 2>&1; then
            gh release upload "$TAG" e-OIC.apk --clobber
          else
            gh release create "$TAG" e-OIC.apk --title "$TAG" --notes "Wrapper APK $TAG"
          fi
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/release.yml
git commit -m "ci: tag-driven signed release APK to GitHub Releases"
git push origin main
```

---

## Task 9: Write `README.md` and `docs/install.md`

**Files:**
- Create: `README.md`
- Create: `docs/install.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# e-OIC Android wrapper

A thin Capacitor Android shell for the e-OIC PWA at https://nickcason.github.io/e-OIC/.

## Why

Chrome Android refuses to share `.zip` and `.xlsx` files via `navigator.share`
due to a hardcoded MIME/extension allowlist in `share_service_impl.cc`. The
wrapper bypasses this by using Android's `Intent.ACTION_SEND` directly via
the `@capacitor/share` plugin.

## What's in here

The WebView points at the live PWA URL; content updates instantly with
each PWA deploy. The APK only needs rebuilding when this wrapper's
native shell changes (Capacitor upgrade, share-bridge bugfix, etc.).

## Build

Local debug build (requires Android SDK + JDK 17):

```bash
npm ci
npx cap sync android
cd android && ./gradlew assembleDebug -PwrapperVersion=v0-dev
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

## Release

Tag a version and push:

```bash
git tag v2 && git push --tags
```

GitHub Actions builds and uploads the signed APK to Releases. The
e-OIC web app fetches `wrapper-version.json` and prompts users to
update when a newer version exists. See `docs/keystore-setup.md` for
secret management.

## Pre-release smoke checklist

1. Sideload the APK to the test emulator (`adb install -r e-OIC.apk`).
2. Launch app — WebView loads live e-OIC.
3. Verify `window.Capacitor.isNativePlatform()` returns `true` (DevTools → console).
4. Export a job → Share → verify Android share sheet appears with `.zip`.
5. Send to Drive (pre-installed); confirm file arrives intact.
6. Manually edit `BuildConfig.WRAPPER_VERSION` to a value behind
   `wrapper-version.json`'s remote version, rebuild, install. Confirm
   the update banner appears in e-OIC.
7. Tap Update → confirm system installer launches → install completes
   without uninstall (same keystore signature).
```

- [ ] **Step 2: Create `docs/install.md`**

This is the page linked from the e-OIC Android-install banner and the "Trouble updating?" link.

```markdown
# Installing e-OIC on Android

The e-OIC Android app is distributed as an APK from GitHub Releases —
not the Play Store. One-time setup:

## First install

1. Open https://github.com/NickCason/e-OIC-android-wrapper/releases/latest
   in Chrome on your phone.
2. Tap **e-OIC.apk** to download.
3. When the download finishes, tap the notification or open Files →
   Downloads and tap `e-OIC.apk`.
4. Android will warn that this is from an "unknown source." Tap
   **Settings**, enable **Allow from this source**, then tap the back
   arrow.
5. Tap **Install**. After a few seconds, **Open**. e-OIC launches.

## Updates

When a new version is available, the app shows an "Update available"
banner. Tap **Update**. The new APK downloads and the system installer
launches automatically; tap **Update** in that dialog. The new version
installs over the existing one — no data loss.

If the system installer doesn't appear, check:
- Settings → Apps → e-OIC → Install unknown apps → toggle **Allow**.

## Uninstall

Long-press the app icon → **App info** → **Uninstall**.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/install.md
git commit -m "docs: add README and field-engineer install guide"
git push origin main
```

---

## Task 10: Cut v1 release

**Files:** none new — this is a release event.

- [ ] **Step 1: Confirm prerequisites**

- The web-side plan has been merged and deployed.
- `https://nickcason.github.io/e-OIC/wrapper-version.json` returns `{ "version": "v1", ... }`.
- All previous tasks in this plan committed and pushed.
- CI workflow on `main` is green.

```bash
curl -s https://nickcason.github.io/e-OIC/wrapper-version.json
gh -R NickCason/e-OIC-android-wrapper run list --limit 1
```

- [ ] **Step 2: Tag and push**

```bash
git tag v1
git push origin v1
```

- [ ] **Step 3: Watch the release workflow**

```bash
gh run watch
```
Expected: succeeds. Time: ~10 min.

- [ ] **Step 4: Confirm release artifact**

```bash
gh release view v1
curl -sLI https://github.com/NickCason/e-OIC-android-wrapper/releases/latest/download/e-OIC.apk | head -1
```
Expected: release exists; the `latest/download` redirect resolves to the v1 APK (HTTP 200 or 302 chain).

---

## Task 11: Sideload and end-to-end test on the node7 emulator

Reference: emulator setup in `~/.claude/projects/-Users-nickcason/memory/reference_android_devspace_node7.md`. Use `swiftshader_indirect`, NOT `swangle_indirect`.

- [ ] **Step 1: Boot the emulator on node7 and connect from Mac**

```bash
ssh nick@inspiron-node7 'nohup ~/Android/Sdk/emulator/emulator \
  -avd eoic_test -no-window -no-audio -no-boot-anim -no-snapshot-save \
  -gpu swiftshader_indirect -cores 3 -memory 4096 -accel on \
  -netdelay none -netspeed full -no-metrics \
  > /tmp/emulator.log 2>&1 & disown'

until adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | grep -q 1; do sleep 4; done
adb devices
```

- [ ] **Step 2: Download the v1 APK and install**

```bash
curl -sL -o /tmp/e-OIC.apk https://github.com/NickCason/e-OIC-android-wrapper/releases/latest/download/e-OIC.apk
adb -s emulator-5554 install -r /tmp/e-OIC.apk
```
Expected: `Success`.

- [ ] **Step 3: Launch via scrcpy on Mac**

```bash
nohup scrcpy -s emulator-5554 --max-size 720 --video-bit-rate 2M --no-audio \
  --window-title "N7 Android 16" > /tmp/scrcpy.log 2>&1 &
```

In scrcpy, tap the e-OIC app icon. Verify:
- The wrapper launches.
- Live PWA loads.
- No "Install Android app" banner appears (because we ARE in the wrapper).

- [ ] **Step 4: Verify Capacitor detection from Chrome DevTools**

Connect Chrome DevTools to the emulator's WebView at `chrome://inspect` on the Mac. Console:

```js
window.Capacitor?.isNativePlatform();
// expected: true

window.EoicWrapper?.getVersion();
// expected: "v1"
```

- [ ] **Step 5: End-to-end share test**

In the wrapper:
1. Create or open a sample job.
2. Trigger Export → Share.
3. Verify the Android share sheet appears.
4. Send to a target app — Drive is pre-installed; alternatively `adb install` Outlook from APK Mirror.
5. Confirm the receiver shows the .zip file with correct name and size.

This is THE critical test — the entire wrapper exists to make this work.

- [ ] **Step 6: Update flow test**

Manually publish a `wrapper-version.json` declaring `v2` is available (without actually building v2). On the e-OIC GitHub Pages branch, temporarily edit `public/wrapper-version.json` to:

```json
{ "version": "v2", "url": "https://github.com/NickCason/e-OIC-android-wrapper/releases/latest/download/e-OIC.apk", "minRequired": "v1" }
```

Commit, push, wait for deploy. Then in the wrapper, force-refresh the WebView (kill and relaunch the app). Verify:
- "Update available" banner appears.
- Tap Update.
- APK downloads.
- System installer launches.
- Install completes (will reinstall the same v1 APK, but the flow is what matters).

After verification, revert `wrapper-version.json` to declare `v1`:
```json
{ "version": "v1", ... }
```

- [ ] **Step 7: Cleanup the emulator**

```bash
ssh nick@inspiron-node7 'pkill -9 -f "qemu-system|crashpad_handler|netsimd"'
pkill -f scrcpy && adb kill-server
```

---

## Self-review summary

- Spec coverage:
  - Architecture diagram → Tasks 1-3.
  - JS↔native contract: `EoicWrapper.getVersion()`, plugins via `Capacitor.Plugins.*` → Task 3 (interface), web side already wired (Plan 1, Task 1 update).
  - Permissions, FileProvider → Task 4.
  - Distribution via Releases → Tasks 5-8, 10.
  - Manual smoke checklist → Task 11.
  - `docs/install.md` linked from web-side update banner → Task 9.
- Open items closed at plan time:
  - Version-injection mechanism: `addJavascriptInterface("EoicWrapper", ...)` reading `BuildConfig.WRAPPER_VERSION`.
  - Banner-stack visual coordination: deferred to a real complaint — both banners reuse `.install-banner` styling and stack vertically, which is acceptable for v1.
  - Install help-page copy: written in Task 9.
- Placeholder scan: clean. Each step has actual code or actual command.
- No cross-task type drift: `EoicWrapper.getVersion()` is the same surface used in web Plan 1.
