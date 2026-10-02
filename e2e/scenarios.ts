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
} from '../src/constants/Selectors';

/* Scenario data shared by the Chrome specs (e2e/) and the Firefox specs (e2e/firefox/) */

/* The article of e2e/pages/article.html, as a prompt carries it */
export const ARTICLE_TITLE = "The Lighthouse Keeper's Log";
export const ARTICLE_SENTENCE = 'a page that described a ship nobody else had seen';

/* Every AI service is on the menu by default */
export const SERVICE_LABELS = ['ChatGPT', 'Gemini', 'AI Studio', 'Claude', 'Grok', 'Perplexity', 'DeepSeek', 'Kimi', 'Qwen'];

export interface Composer {
  /* Shown in the test title */
  name: string;
  /* The service's button in the popup */
  label: string;
  /* The host the summary opens on */
  host: string;
  /* The editor the injector fills */
  editor: string;
  /* A fixture other than the host's default */
  fixture?: string;
}

export const COMPOSERS: Composer[] = [
  { name: 'ChatGPT', label: 'ChatGPT', host: 'chatgpt.com', editor: CHATGPT_SELECTORS.editor },
  { name: 'ChatGPT signed out', label: 'ChatGPT', host: 'chatgpt.com', editor: CHATGPT_SELECTORS.editor, fixture: 'chatgpt-guest-composer' },
  { name: 'Gemini', label: 'Gemini', host: 'gemini.google.com', editor: GEMINI_SELECTORS.editor },
  { name: 'AI Studio', label: 'AI Studio', host: 'aistudio.google.com', editor: AISTUDIO_SELECTORS.editor },
  { name: 'Claude', label: 'Claude', host: 'claude.ai', editor: CLAUDE_SELECTORS.editor },
  { name: 'Grok', label: 'Grok', host: 'grok.com', editor: GROK_SELECTORS.editor },
  { name: 'Grok signed out', label: 'Grok', host: 'grok.com', editor: GROK_SELECTORS.editor, fixture: 'grok-textarea-composer' },
  { name: 'Perplexity', label: 'Perplexity', host: 'www.perplexity.ai', editor: PERPLEXITY_SELECTORS.editor },
  { name: 'DeepSeek', label: 'DeepSeek', host: 'chat.deepseek.com', editor: DEEPSEEK_SELECTORS.editor },
  { name: 'Kimi', label: 'Kimi', host: 'www.kimi.ai', editor: KIMI_SELECTORS.editor },
  { name: 'Qwen', label: 'Qwen', host: 'chat.qwen.ai', editor: QWEN_SELECTORS.editor },
];
