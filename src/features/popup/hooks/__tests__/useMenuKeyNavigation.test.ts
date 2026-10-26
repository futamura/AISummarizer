/**
 * @jest-environment jsdom
 */
import { moveMenuFocus } from '@/features/popup/hooks/useMenuKeyNavigation';

describe('moveMenuFocus', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button tabindex="-1">Summarize this page</button>
      <button>ChatGPT</button>
      <button>Gemini</button>
      <button>Settings</button>
    `;
    (document.activeElement as HTMLElement | null)?.blur();
  });

  const focused = () => document.activeElement?.textContent;
  const focusItem = (label: string) =>
    Array.from(document.querySelectorAll('button'))
      .find(button => button.textContent === label)!
      .focus();

  it('starts at the first item on ArrowDown and the last one on ArrowUp when nothing is focused', () => {
    expect(moveMenuFocus('ArrowDown', document)).toBe(true);
    expect(focused()).toBe('ChatGPT');

    (document.activeElement as HTMLElement).blur();
    expect(moveMenuFocus('ArrowUp', document)).toBe(true);
    expect(focused()).toBe('Settings');
  });

  it('moves to the next and previous items and wraps around the ends', () => {
    focusItem('ChatGPT');
    moveMenuFocus('ArrowDown', document);
    expect(focused()).toBe('Gemini');

    moveMenuFocus('ArrowUp', document);
    moveMenuFocus('ArrowUp', document);
    expect(focused()).toBe('Settings');

    moveMenuFocus('ArrowDown', document);
    expect(focused()).toBe('ChatGPT');
  });

  it('jumps to the first and last items on Home and End', () => {
    focusItem('Gemini');
    moveMenuFocus('End', document);
    expect(focused()).toBe('Settings');

    moveMenuFocus('Home', document);
    expect(focused()).toBe('ChatGPT');
  });

  it('skips the label rows', () => {
    focusItem('ChatGPT');
    moveMenuFocus('ArrowUp', document);
    expect(focused()).not.toBe('Summarize this page');
  });

  it('leaves other keys and empty menus alone', () => {
    focusItem('Gemini');
    expect(moveMenuFocus('Enter', document)).toBe(false);
    expect(focused()).toBe('Gemini');

    document.body.innerHTML = '';
    expect(moveMenuFocus('ArrowDown', document)).toBe(false);
  });
});
