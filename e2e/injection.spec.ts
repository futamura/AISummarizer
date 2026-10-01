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
import { expectArticleInjected, test } from './fixtures';

interface Composer {
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

const COMPOSERS: Composer[] = [
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

for (const composer of COMPOSERS) {
  test(`injects the article into ${composer.name}`, async ({ openPage, openPopupFor, serveFixture, waitForServicePage }) => {
    if (composer.fixture) await serveFixture(composer.host, composer.fixture);
    const article = await openPage('article');
    const popup = await openPopupFor(article);

    await popup.getByText(composer.label, { exact: true }).click();

    const service = await waitForServicePage(composer.host);
    await expectArticleInjected(service, composer.editor);
  });
}
