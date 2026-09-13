![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/ojofnhnjhhjfpgenkakhpajjeidplidd?style=flat&label=Chrome%20Extension)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open Source](https://img.shields.io/badge/Open%20Source-Yes-blue.svg)](https://github.com/futamura/AISummarizer)

# [Free AI Summarizer](https://github.com/futamura/AISummarizer)

A free and open-source Chrome Extension that uses AI to summarize web articles. Get instant summaries with just a few clicks.

<img src="https://raw.githubusercontent.com/futamura/AISummarizer/refs/heads/main/screenshot.png" alt="Banner">

## Features

### Core Features

- No charge, no API key, no login required
- Extract articles automatically from webpages
- Summarize articles with multiple AI services
- Floating panel for quick access
- Context menu support
- Dark/Light mode support
- Modern and polished design

### Supported Content Types

- Web Content - News articles, blog posts, and general web pages
- YouTube - Video transcripts
- PDF Documents - PDF files

### Supported AI services

- ChatGPT
- Gemini
- Google AI Studio
- Claude
- Grok
- Perplexity
- DeepSeek
- Kimi (kimi.ai)
- Qwen

## Installation

### From Chrome Web Store

1. Visit [Chrome Web Store](https://chromewebstore.google.com/detail/free-ai-summarizer/ojofnhnjhhjfpgenkakhpajjeidplidd)
2. Click "Add to Chrome"
3. Click "Add Extension" in the confirmation dialog

### Install locally

4. Download [release version](https://github.com/futamura/AISummarizer/releases) and unzip
5. Open `chrome://extensions` in Chrome
6. Enable "Developer mode" in the top right
7. Click "Load unpacked"
8. Select the unzipped folder

## For Developers

### Development Setup

1. Install required tools

   - [Node.js](https://nodejs.org/) (v20 or higher)
   - [pnpm](https://pnpm.io/) (v10 or higher)
   - [mise](https://mise.jdx.dev/) (Development environment manager)

2. Clone the repository

   ```bash
   git clone https://github.com/futamura/AISummarizer.git
   cd AISummarizer
   ```

3. Install dependencies

   ```bash
   pnpm install
   ```

4. Start development server

   ```bash
   pnpm dev
   ```

5. Open `chrome://extensions` in Chrome
6. Enable "Developer mode" in the top right
7. Click "Load unpacked"
8. Select the `dist/dev` folder in the downloaded directory

### Using Fastlane

```bash
bundle exec fastlane
```

### Project Structure

For detailed project structure, please refer to [DIRECTORYSTRUCTURE.md](./DIRECTORYSTRUCTURE.md).

### Technology Stack

For detailed technology stack information, please refer to [TECHNOLOGSTACK.md](./TECHNOLOGSTACK.md).

### Development Guidelines

1. Code Style

   - Use ESLint and Prettier
   - Run `pnpm eslint-check` before committing
   - Run `pnpm prettier-fix` before committing

2. Branch Strategy

   - `main`: Production branch (updated only by merging `develop` during a release)
   - `develop`: Development branch
   - Do not commit directly to `main` or `develop`
   - Create working branches from `develop`, named after Conventional Commit types: `feat/<name>`, `fix/<name>`, `docs/<name>`, etc.

3. Pull Requests
   - Clear title and description
   - Reference related issue numbers
   - Self-review before submission

### Building

```bash
# Production build
pnpm build

# Development build
pnpm dev
```

### Firefox

The same codebase also builds a Firefox (desktop) version. Browser-specific code lives in `src/platform/`.

```bash
# Development build for Firefox (watch mode, output: dist/firefox-dev)
pnpm dev:firefox

# Production build for Firefox (output: dist/firefox-prod)
pnpm build:firefox
```

To load the development build:

1. Open `about:debugging#/runtime/this-firefox` in Firefox
2. Click "Load Temporary Add-on..."
3. Select `dist/firefox-dev/manifest.json`

> **Private tabs:** the "New private tab" option only works after allowing the extension in private windows: `about:addons` → Free AI Summarizer → "Run in Private Windows" → Allow.

> **Limitation:** PDF summarization is not supported in the Firefox version. Firefox opens PDFs in its built-in viewer, where extensions cannot inject content scripts.

#### Building for Firefox (AMO reviewers)

The submitted package is built from this repository with webpack. To reproduce it:

1. Install Node.js 20 and pnpm (the exact pnpm version is pinned in the `packageManager` field of `package.json`; `corepack enable` picks it up)
2. Run `pnpm install --frozen-lockfile`
3. Run `pnpm build:firefox`
4. The build output is in `dist/firefox-prod`

#### Releasing to Firefox Add-ons (AMO)

`.github/workflows/release.yml` submits each release to AMO when a `v*.*.*` tag is pushed. The first submission is manual:

1. Create a developer account on [addons.mozilla.org](https://addons.mozilla.org/developers/)
2. On `develop`, run `bundle exec fastlane build_firefox`, `bundle exec fastlane create_firefox_package`, and `bundle exec fastlane create_source_package`
3. In the AMO Developer Hub, submit `free-ai-summarizer-firefox-<version>.zip` as a new add-on ("On this site"), upload `free-ai-summarizer-source-<version>.zip` as the source code, and fill in the listing (description, screenshots, categories, privacy policy); the description must state that PDF files are not supported in the Firefox version
4. Generate API credentials at <https://addons.mozilla.org/developers/addon/api/key/>
5. Add them to the GitHub repository secrets as `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`

Until the secrets are set, the workflow skips the AMO submission with a warning. AMO rejects re-uploads of an existing version, so re-releasing the same version only fails the Firefox steps; the Chrome release is unaffected.

## 🔒 Privacy

We respect your privacy. All data is stored locally on your device. See our [Privacy Policy](./PRIVACY.md) for details.

## 📝 License

This project is licensed under the [MIT License](./LICENSE).
