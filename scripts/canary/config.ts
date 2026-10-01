import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  AISTUDIO_SELECTORS,
  CHATGPT_SELECTORS,
  CLAUDE_SELECTORS,
  DEEPSEEK_SELECTORS,
  GEMINI_SELECTORS,
  GROK_SELECTORS,
  KIMI_SELECTORS,
  PERPLEXITY_SELECTORS,
  QWEN_SELECTORS,
  X_SELECTORS,
  YOUTUBE_SELECTORS,
} from '../../src/constants/Selectors';

/**
 * Everything the canary keeps lives outside the repository: the signed-in browser profile and the
 * results with their DOM snapshots. None of it may be committed or uploaded, since the profile holds
 * the session cookies and the snapshots show the signed-in pages.
 */
export const CANARY_HOME = process.env.CANARY_HOME ?? join(homedir(), 'Library', 'Application Support', 'ai-summarizer-canary');
export const PROFILE_DIR = join(CANARY_HOME, 'profile');
export const RUNS_DIR = join(CANARY_HOME, 'runs');

export interface ProbePage {
  name: string;
  url: string;
  /* Selectors that must match once the page has loaded; a miss fails the run */
  required: Record<string, string>;
  /* Selectors that are reported but may be missing, such as controls that depend on the account or model */
  optional?: Record<string, string>;
  /* The YouTube transcript panel is opened with this button and its segments counted; the only click the canary makes */
  transcript?: { button: string; segment: string };
  /* A final URL matching this means the session was lost */
  loginUrl?: RegExp;
  /*
   * An element shown only while signed in. Several services fall back to a guest page instead of
   * redirecting to a sign-in page, so a lost session would otherwise go unnoticed
   */
  signedIn?: string;
}

/* Signed out, X serves a different page without the data-testid attributes the extractor reads */
const X_SIGNED_IN = '[data-testid="SideNav_AccountSwitcher_Button"]';

/*
 * The pages the canary opens once a day. It only loads them and counts the selectors: nothing is typed
 * or sent, because the services forbid automated use. Send buttons are therefore not checked, since
 * most composers render theirs only once text is entered. The YouTube and X pages are the fixture
 * sources (see the first line of each fixture in src/features/content/__fixtures__/). The signed-in
 * markers were checked to be absent from the guest pages (2026-10-01).
 */
export const PROBE_PAGES: ProbePage[] = [
  {
    name: 'youtube-watch',
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    required: { title: YOUTUBE_SELECTORS.title, transcriptButton: YOUTUBE_SELECTORS.transcriptButton },
    transcript: { button: YOUTUBE_SELECTORS.transcriptButton, segment: YOUTUBE_SELECTORS.segment },
  },
  {
    name: 'x-post',
    url: 'https://x.com/XDevelopers/status/2102535041532186709',
    required: { mainPost: X_SELECTORS.mainPost, postText: X_SELECTORS.postText, userName: X_SELECTORS.userName },
    loginUrl: /\/i\/flow\/login/,
    signedIn: X_SIGNED_IN,
  },
  {
    name: 'x-article',
    url: 'https://x.com/Safety/status/1801282137921871887',
    required: { articleView: X_SELECTORS.articleView, articleTitle: X_SELECTORS.articleTitle, articleBody: X_SELECTORS.articleBody },
    loginUrl: /\/i\/flow\/login/,
    signedIn: X_SIGNED_IN,
  },
  {
    name: 'chatgpt',
    url: 'https://chatgpt.com/',
    required: { editor: CHATGPT_SELECTORS.editor },
    loginUrl: /\/auth\/login/,
    signedIn: '[data-testid="accounts-profile-button"]',
  },
  {
    name: 'claude',
    url: 'https://claude.ai/new',
    required: { editor: CLAUDE_SELECTORS.editor },
    loginUrl: /claude\.ai\/login/,
    signedIn: '[data-testid="user-menu-button"]',
  },
  {
    name: 'gemini',
    url: 'https://gemini.google.com/app',
    required: { editor: GEMINI_SELECTORS.editor, modelPicker: GEMINI_SELECTORS.modelPicker },
    loginUrl: /accounts\.google\.com/,
    signedIn: 'a[href*="accounts.google.com/SignOutOptions"]',
  },
  {
    name: 'aistudio',
    url: 'https://aistudio.google.com/prompts/new_chat',
    required: { editor: AISTUDIO_SELECTORS.editor, submit: AISTUDIO_SELECTORS.submit },
    optional: { thinkingLevel: AISTUDIO_SELECTORS.thinkingLevel, urlContextToggle: AISTUDIO_SELECTORS.urlContextToggle },
    loginUrl: /accounts\.google\.com/,
    signedIn: '#account-switcher-button',
  },
  {
    name: 'grok',
    url: 'https://grok.com/',
    required: { editor: GROK_SELECTORS.editor },
    signedIn: 'img[alt="pfp"]',
  },
  {
    name: 'perplexity',
    url: 'https://www.perplexity.ai/',
    required: { editor: PERPLEXITY_SELECTORS.editor },
    optional: { submit: PERPLEXITY_SELECTORS.submit },
    signedIn: 'img[alt="Profile avatar"]',
  },
  {
    name: 'deepseek',
    url: 'https://chat.deepseek.com/',
    required: { editor: DEEPSEEK_SELECTORS.editor },
    loginUrl: /\/sign_in/,
  },
  {
    name: 'kimi',
    url: 'https://www.kimi.ai/',
    required: { editor: KIMI_SELECTORS.editor, modelPicker: KIMI_SELECTORS.modelPicker },
    signedIn: '[data-testid="sidebar-user-menu-trigger"]',
  },
  {
    name: 'qwen',
    url: 'https://chat.qwen.ai/',
    required: { editor: QWEN_SELECTORS.editor, modelPicker: QWEN_SELECTORS.modelPicker },
    signedIn: '.user-menu-btn',
  },
];

/* The pages to sign in to when the profile is set up: every service that has an account */
export const LOGIN_URLS = [
  'https://accounts.google.com/',
  'https://x.com/login',
  'https://chatgpt.com/',
  'https://claude.ai/login',
  'https://grok.com/',
  'https://www.perplexity.ai/',
  'https://chat.deepseek.com/',
  'https://www.kimi.ai/',
  'https://chat.qwen.ai/',
];
