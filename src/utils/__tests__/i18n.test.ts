import { getBrowserLanguage } from '@/utils';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

const setNavigator = (value: unknown) => {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
};

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  } else {
    delete (globalThis as { navigator?: unknown }).navigator;
  }
});

describe('getBrowserLanguage', () => {
  it.each([
    ['ja-JP', 'Japanese'],
    ['en-US', 'English'],
    ['pt-BR', 'Portuguese'],
    ['fr', 'French'],
  ])('maps %s to %s', (languageCode, expected) => {
    setNavigator({ language: languageCode });
    expect(getBrowserLanguage()).toBe(expected);
  });

  it('falls back to English for an unknown language code', () => {
    setNavigator({ language: 'xx-YY' });
    expect(getBrowserLanguage()).toBe('English');
  });

  it('falls back to English when navigator is unavailable', () => {
    setNavigator(undefined);
    expect(getBrowserLanguage()).toBe('English');
  });

  it('falls back to English when navigator.language is unavailable', () => {
    setNavigator({});
    expect(getBrowserLanguage()).toBe('English');
  });
});

describe('DEFAULT_SETTINGS', () => {
  it('asks for the summary in the browser language in every default prompt', () => {
    setNavigator({ language: 'fr-FR' });
    /* The settings store hydrates from chrome.storage.local as soon as it is created */
    Object.assign(globalThis, {
      chrome: {
        storage: {
          local: {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue(undefined),
            remove: jest.fn().mockResolvedValue(undefined),
          },
        },
        runtime: {
          sendMessage: jest.fn(),
        },
      },
    });

    let prompts: Record<string, string> = {};
    /* Re-evaluate the store module so DEFAULT_PROMPT picks up the mocked navigator */
    jest.isolateModules(() => {
      /* eslint-disable-next-line @typescript-eslint/no-require-imports */
      prompts = require('@/stores/SettingsStore').DEFAULT_SETTINGS.prompts;
    });

    const values = Object.values(prompts);
    expect(values.length).toBeGreaterThan(0);
    values.forEach(prompt => {
      expect(prompt).toContain('summarize the main points in French.');
      expect(prompt).not.toContain('Japanese');
    });
  });
});
