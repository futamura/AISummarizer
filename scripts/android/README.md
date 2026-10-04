# Android smoke test

A one-command check of the development build on a real phone with Firefox for Android. It installs `dist/firefox-dev` as a temporary add-on, opens an article, has the extension extract it and open an AI service, and checks that the article reached the service. CI has no Android run: emulators are slow and flaky there.

It covers what the popup does after a tap, not the popup itself: the native UI (⋮ → Extensions → the add-on) is still checked by hand.

## What it does

`pnpm android:smoke` runs these steps and stops at the first failure (exit code 1):

1. Checks the device: one phone connected and allowed for USB debugging, and Firefox listening for a debugger. It warns when the screen is off, the phone is locked or Firefox is not in front: Firefox for Android stops the timers of pages it does not show, and the run then times out
2. Packs `dist/firefox-dev` into an XPI, pushes it to the phone and installs it as a temporary add-on over the remote debugging protocol. This also works when the add-on from AMO is installed, which `web-ext run` refuses (exit 13). The temporary add-on replaces the one from AMO until Firefox restarts
3. Opens the article (`https://en.wikipedia.org/wiki/Newline` by default) and reads the start of its first paragraph
4. Sends `OPEN_AI_SERVICE` from the options page, as the popup does, with the article tab in front
5. Waits for the AI service's tab and for the start of the article to appear there. The extension sends it, so **every run sends one message to the AI service**. When the article stays in the composer (a sign-in wall, a limit of the service), the run passes with a warning, since the injection worked

## Setup

1. On the phone, turn on USB debugging (Settings → Developer options), and in Firefox turn on Settings → Remote debugging via USB
2. Connect the phone, accept the USB debugging prompt, and check that `adb devices` lists it as `device`
3. Build the add-on: `pnpm start:firefox`

## Running it

Unlock the phone and bring Firefox to the front, then:

```bash
# ChatGPT, which accepts a guest
pnpm android:smoke

# Another service, which must be signed in on the phone
pnpm android:smoke --service=CLAUDE

# Another article, and a device of your choice when several are connected
pnpm android:smoke --url=https://example.com/article --serial=<serial from adb devices>

# Only check that the phone is ready: nothing is installed or sent
pnpm android:smoke --check
```

The services are named as in `AIService` (`src/types/AIService.ts`). The tabs the run opens stay open, so the result can be looked at on the phone. Restart Firefox to go back to the add-on from AMO.
