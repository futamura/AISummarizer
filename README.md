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
- Deekseek

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

   - `main`: Production branch
   - `develop`: Development branch
   - Feature development: `feature/feature-name`
   - Bug fixes: `fix/bug-description`

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

## 🔒 Privacy

We respect your privacy. All data is stored locally on your device. See our [Privacy Policy](./PRIVACY.md) for details.

## 📝 License

This project is licensed under the [MIT License](./LICENSE).
