/**
 * DOM selectors of the pages the extension reads from and writes into.
 * The injectors and extractors use them, and so does the local canary (scripts/canary/), which
 * checks every day that the live pages still match. This file must not import anything, so that
 * the canary can load it outside the extension.
 */

export const CHATGPT_SELECTORS = {
  /*
   * The logged-in composer is a ProseMirror contenteditable div (#prompt-textarea); the logged-out
   * guest composer is a plain React-controlled textarea (verified live 2026-08-13)
   */
  editor: '#prompt-textarea, form textarea[name="prompt"]',
  /*
   * The logged-in composer exposes #composer-submit-button / data-testid="send-button";
   * the guest composer has neither and is only reachable via its aria-label, which stays
   * English regardless of browser locale (verified live 2026-08-13)
   */
  submit: '#composer-submit-button, button[data-testid="send-button"], form button[aria-label="Send message"]',
} as const;

export const CLAUDE_SELECTORS = {
  editor: 'div.ProseMirror[contenteditable="true"]',
  /* Located by its locale-independent data-testid */
  submit: 'button[data-testid="chat-input-send"]',
} as const;

export const GEMINI_SELECTORS = {
  /* Structural, because the aria-label text changes with UI updates and locale */
  editor: 'rich-textarea div.ql-editor[contenteditable="true"]',
  submit: 'button[aria-label="Send message"]',
  /* Menu items carry data-test-id="bard-mode-option-<hash>"; the prefix is stable, the hash is not (verified live 2026-08-08) */
  modelPicker: 'bard-mode-switcher button',
  modelOption: '[data-test-id^="bard-mode-option"]',
} as const;

export const GROK_SELECTORS = {
  /*
   * Grok serves either a textarea in the composer form or a Tiptap (ProseMirror) contenteditable;
   * the aria-hidden autosize textarea outside the form is not matched
   */
  editor: 'form textarea, div.tiptap.ProseMirror[contenteditable="true"]',
  submit: 'button[aria-label="Submit"]',
} as const;

export const PERPLEXITY_SELECTORS = {
  /* A Lexical contenteditable */
  editor: '#ask-input',
  submit: 'button[aria-label="Submit"]',
} as const;

export const DEEPSEEK_SELECTORS = {
  /* DeepSeek removed the #chat-input id; the chat box is now the sole textarea on the page */
  editor: '#chat-input, textarea',
  /* Disabled state is expressed via the ds-button--disabled class */
  submit: 'div[role="button"].ds-button--primary.ds-button--filled.ds-button--circle:not(.ds-button--disabled)',
} as const;

export const KIMI_SELECTORS = {
  /* A Lexical contenteditable div (verified live 2026-08-08) */
  editor: 'div[contenteditable="true"][data-lexical-editor="true"]',
  /* Disabled state is expressed via the disabled class (verified live 2026-08-08) */
  submit: 'div.send-button-container:not(.disabled)',
  /* The picker opens from the chip next to the send button (verified live 2026-08-08) */
  modelPicker: '.current-model',
  modelItem: '.model-item',
  modelName: '.model-name',
} as const;

export const QWEN_SELECTORS = {
  /* The chat box is the sole textarea on the page (verified live 2026-08-08) */
  editor: 'textarea.message-input-textarea, textarea',
  /* The button replaces the voice-mode button once text is entered (verified live 2026-08-08) */
  submit: 'button.send-button:not([disabled])',
  /* Module class names are hashed, so the picker is located by aria-label and role (verified live 2026-08-08) */
  modelPicker: '[aria-label="Select Model"]',
  modelOption: '[role="option"]',
} as const;

export const YOUTUBE_SELECTORS = {
  transcriptButton: '#description-inline-expander ytd-video-description-transcript-section-renderer button',
  /*
   * Transcript segments of both the legacy transcript panel (ytd-transcript-segment-renderer)
   * and the new view-model based panel (transcript-segment-view-model) that YouTube is gradually rolling out
   */
  segment: 'ytd-transcript-segment-renderer, transcript-segment-view-model',
  legacySegmentTimestamp: '.segment-timestamp',
  legacySegmentText: '.segment-text',
  segmentTimestamp: '.ytwTranscriptSegmentViewModelTimestamp',
  segmentText: '.ytAttributedStringHost',
  title: '#above-the-fold #title',
  transcriptPanel: 'ytd-engagement-panel-section-list-renderer',
} as const;

export const X_SELECTORS = {
  /* Long-form posts ("articles") are rendered by a dedicated view instead of the post timeline */
  articleView: '[data-testid="twitterArticleReadView"]',
  articleTitle: '[data-testid="twitter-article-title"]',
  articleBody: '[data-testid="twitterArticleRichTextView"]',
  post: 'article[data-testid="tweet"]',
  /* The post the URL points at is the only one taken out of the tab order */
  mainPost: 'article[data-testid="tweet"][tabindex="-1"]',
  postText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  /* A quoted post is nested inside its quoting post as a link-role container */
  quote: 'div[role="link"]',
  time: 'time[datetime]',
  /* Signed out, X serves other markup: a bare article per post, without data-testid or time elements */
  signedOutPost: 'article:not([data-testid])',
  signedOutPostText: 'div[dir="auto"]',
  signedOutArticleTitle: 'h1',
  signedOutArticleBody: '.x-article-body',
} as const;
