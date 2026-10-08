# Local canary

A daily check, run on a local Mac, that the live pages still match the selectors the injectors and extractors use (`src/constants/Selectors.ts`). It finds out when YouTube, X or an AI service changes its DOM, before a user reports a broken summary.

It runs locally rather than on GitHub Actions: YouTube turns away cloud IP addresses, most AI services need a signed-in session, and the artifacts of a public repository can be downloaded by anyone, which would expose the signed-in pages.

## What it does

`probe.ts` opens each page in `PROBE_PAGES` (`config.ts`) in the canary's own Chromium profile and counts the elements matching each selector. It only loads the pages: nothing is typed or sent, since the services forbid automated use. The one interaction is opening the YouTube transcript panel, the way the extractor does. Send buttons are not checked, because most composers render theirs only once text is entered.

Each page ends with one of these statuses:

| Status       | Meaning                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------- |
| `ok`         | Every required selector matched                                                              |
| `missing`    | A required selector matched nothing: the DOM probably changed                                |
| `signed-out` | The page went to its sign-in page, or shows its guest page (the page's `signedIn` marker is missing): sign in again with `pnpm canary:login` |
| `blocked`    | The site's bot protection answered (an HTTP error or a Cloudflare challenge): says nothing about the selectors. Pass the check with `pnpm canary:login`, then quit the browser with Cmd+Q |
| `error`      | The page did not load                                                                        |

When a page is not `ok`, a macOS notification says what to do for each status, and the page's DOM and a screenshot are saved next to `result.json`. For each `blocked` page, the probe also files a Linear issue with these steps in project AISummarizer, unless one for the page is still open (`--no-notify` skips both). It uses a Linear API key of its own, allowed only to read and create issues in team Futamura, read at run time from the login Keychain item `linear-api-fut-canary`. When the key cannot be read or Linear refuses, the notification says so and the run's result is unchanged. `result.json` also records, per page, whether the signed-in marker was found, which shows how long each session lasts.

## Where the data lives

Everything is kept outside the repository, in `~/Library/Application Support/ai-summarizer-canary/` (override with `CANARY_HOME`), readable only by the owner:

- `profile/`: the Chromium profile with the signed-in sessions. Playwright's Chromium encrypts cookies with a fixed key rather than the macOS keychain, so anyone who can read this folder can take over the sessions. Sign in with accounts made for the canary only, never personal ones
- `runs/<time>/`: `result.json`, and the DOM and screenshot of each failed page. Runs older than 30 days are removed
- `launchd.log`: the output of the scheduled runs
- `repo/` and `run.sh`: the clone of the repository and the copy of `run.sh` that the scheduled runs use (see below)

Never commit or upload any of it.

## Setup

1. Install the browser once: `pnpm exec playwright install chromium`
2. Sign in: `pnpm canary:login` opens the profile with a tab per service, in the same Chromium started as a plain browser (Google refuses to sign in to a browser under automation, and Cloudflare challenges it). Sign in on each with the canary accounts, then quit the browser with Cmd+Q
3. Try a run: `pnpm canary:probe` (`--only=claude,x-post` for some pages, `--no-notify` to skip the notification)
4. Schedule it: `scripts/canary/install-launchd.sh` runs it every day at 9:00 (`CANARY_HOUR` / `CANARY_MINUTE` to change it; `--uninstall` to remove it)

The scheduled runs do not use your working copy. macOS does not let a launchd job read `~/Documents` (the job fails with `Operation not permitted`), and the working copy may be on any branch. So `install-launchd.sh` clones the repository into `repo/` and copies `run.sh` next to it; each run pulls `develop` and installs its dependencies before probing. Run `install-launchd.sh` again after changing `run.sh`. If anything before the probe fails, a notification points to `launchd.log`.

The probe opens a browser window: headless Chromium is turned away by the bot protection of ChatGPT, Claude, Perplexity, DeepSeek and X (`--headless` to try it anyway).
