# Privacy Policy

Last updated: Sunday, September 13, 2026

## Overview

Free AI Summarizer ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we handle information when you use our browser extension for Chrome and Firefox.

## Information We Collect

We do not collect any personal information. The extension has no server of its own, and we never receive your data. Article extraction and storage happen locally on your device.

## Data Storage

The extension uses Chrome's local storage to save your preferences, settings and cache data, including:

- Article extraction settings and preferences
- AI service configurations
- Theme preferences
- Extraction denylist settings
- Clipboard copy settings
- Extracted articles to cache data

All of this data is stored locally on your device. Apart from the content you choose to send to an AI service (see below), it is not shared with any third parties.

## Data Sent to AI Services

When you choose an AI service (such as ChatGPT, Claude, or Gemini) from the popup or the context menu, the extension opens that service's website in a new tab, enters the following into its chat box together with your summarize prompt, and submits it:

- The page title
- The page URL
- The extracted page content (article text, YouTube transcript, or PDF text)

This content is sent directly to the AI service you selected, under your own account on that service, and is handled according to that service's privacy policy. Nothing is sent until you choose an AI service.

## Permissions Used

The extension requires the following permissions to function:

- `storage`: To save your preferences, settings, and extracted articles locally on the device. No data is transmitted to external servers.
- `tabs`: To access tab information, create new tabs for AI services, and communicate with content scripts for article extraction and injection.
<!-- - `scripting`: To inject content scripts into web pages for article extraction and to communicate between different parts of the extension. -->
- `activeTab`: To access the current active tab for article extraction, clipboard operations, and UI state management.
- `offscreen`: To detect system color scheme changes for theme synchronization, ensuring the extension's appearance matches the user's system preferences.
- `contextMenus`: To create right-click context menus that allow users to extract articles, copy to clipboard, and access AI services directly from web pages.
- `sidePanel`: To display the settings panel in Chrome's side panel interface, providing easy access to extension configuration.
- `alarms`: To schedule periodic database cleanup tasks that remove old articles to maintain optimal performance.
- `clipboardWrite`: To copy extracted articles to the user's clipboard when requested, enabling easy sharing and note-taking.
- `host_permissions`: To allow the extension to access and extract content from any website you visit. This is necessary for article extraction, content script injection, and providing AI summarization features on a wide range of web pages. Page content leaves your device only when you send it to an AI service you choose.

## Third-Party Services

We do not use any analytics or tracking tools. The only third parties that receive data are the AI services you choose to send content to, as described in "Data Sent to AI Services".

## Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.

## Contact Us

If you have any questions about this Privacy Policy, please contact us through our GitHub repository.
