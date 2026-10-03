import {
  getInjectionFailureMessage,
  getModelUnavailableMessage,
  INJECTION_STAGE_MESSAGES,
  INJECTION_SUCCESS_MESSAGE,
} from '../../src/features/content/services/InjectionProgress';
import type { ToastType } from '../../src/features/content/services/ToastQueue';
import { COLOR_SCHEMES, expect, preparePage, test } from './fixtures';

/* The top of the viewport: the toast sits 24px below it, with its shadow */
const TOAST_CLIP = { x: 0, y: 0, width: 800, height: 160 };

/* One toast per type: the look depends on the type, and Jest checks the texts */
const TOASTS: { type: ToastType; text: string }[] = [
  { type: 'loading', text: INJECTION_STAGE_MESSAGES.pasting },
  { type: 'success', text: INJECTION_SUCCESS_MESSAGE },
  { type: 'error', text: getInjectionFailureMessage('pasting') },
  { type: 'warning', text: getModelUnavailableMessage('Gemini 3 Pro') },
];

for (const colorScheme of COLOR_SCHEMES) {
  for (const { type, text } of TOASTS) {
    test(`${type} toast, ${colorScheme}`, async ({ openPage, showToast }) => {
      const page = await openPage('article');
      await preparePage(page, colorScheme);
      await showToast(page, type, text);
      await expect(page).toHaveScreenshot(`${type}-${colorScheme}.png`, { clip: TOAST_CLIP, animations: 'disabled' });
    });
  }
}

/* Sizes in rem would follow the 10px root font size of the page, as on YouTube */
for (const { type, text } of TOASTS.filter(toast => toast.type === 'loading' || toast.type === 'error')) {
  test(`${type} toast on a page with a 10px root font size`, async ({ openPage, showToast }) => {
    const page = await openPage('root-10px');
    await preparePage(page, 'light');
    await showToast(page, type, text);
    await expect(page).toHaveScreenshot(`${type}-root-10px.png`, { clip: TOAST_CLIP, animations: 'disabled' });
  });
}
