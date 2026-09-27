import { STORAGE_KEYS } from '@/constants';
/* The store hydrates at module load, before the chrome mock below exists; persist swallows that first read and
   the assertion targets the write path instead */
import { DEFAULT_SETTINGS, useSettingsStore } from '@/stores/SettingsStore';
import { TabBehavior } from '@/types';

/* Firefox stores extension data with the structured clone algorithm, so a value holding functions throws DataCloneError.
   Chrome serializes to JSON instead and silently drops them, which is why the bug only shows up on Firefox. */
const geckoStorage: Record<string, any> = {};

const set = jest.fn(async (items: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(items)) {
    geckoStorage[key] = structuredClone(value);
  }
});

const get = jest.fn(async (name: string) => (name in geckoStorage ? { [name]: geckoStorage[name] } : {}));

const remove = jest.fn(async (name: string) => {
  delete geckoStorage[name];
});

(globalThis as any).chrome = {
  storage: { local: { get, set, remove } },
  runtime: { sendMessage: jest.fn(async () => undefined) },
};

/* zustand persist writes with `void setItem()`, so a rejected write surfaces as an unhandled rejection instead of a throw */
const swallowStorageRejection = () => undefined;
process.on('unhandledRejection', swallowStorageRejection);

/* Let the persisted write settle */
const flushStorage = () => new Promise(resolve => setTimeout(resolve, 0));

describe('SettingsStore persistence on Firefox', () => {
  afterAll(() => {
    process.off('unhandledRejection', swallowStorageRejection);
    delete (globalThis as any).chrome;
  });

  it('persists a changed setting', async () => {
    await flushStorage();

    await useSettingsStore.getState().setTabBehavior(TabBehavior.CURRENT_TAB);
    await flushStorage();

    expect(geckoStorage[STORAGE_KEYS.SETTINGS]?.state?.tabBehavior).toBe(TabBehavior.CURRENT_TAB);
  });

  it('persists the clipboard prompt and reads it back', async () => {
    await flushStorage();

    await useSettingsStore.getState().setClipboardPrompt('Summarize in Japanese.\n{content}');
    await flushStorage();

    expect(geckoStorage[STORAGE_KEYS.SETTINGS]?.state?.clipboardPrompt).toBe('Summarize in Japanese.\n{content}');
    await expect(useSettingsStore.getState().getClipboardPrompt()).resolves.toBe('Summarize in Japanese.\n{content}');
  });

  /* Backups exported before the extraction settings were removed still hold them */
  it('imports a backup that still holds the removed extraction settings', async () => {
    await flushStorage();
    const backup = {
      version: '0.3.3',
      settings: {
        prompt: DEFAULT_SETTINGS.prompts,
        clipboardPrompt: 'Backup prompt {content}',
        tabBehavior: 'NEW_TAB',
        contentExtractionTiming: 'AUTOMATIC',
        extractionDenylist: 'example\\.com',
        saveArticleOnClipboard: true,
        isShowMessage: true,
        isShowBadge: true,
      },
    };
    const file = { text: async () => JSON.stringify(backup) } as unknown as File;

    await expect(useSettingsStore.getState().importSettings(file)).resolves.toEqual({ success: true });
    await flushStorage();

    const stored = geckoStorage[STORAGE_KEYS.SETTINGS]?.state;
    expect(stored?.clipboardPrompt).toBe('Backup prompt {content}');
    for (const key of ['contentExtractionTiming', 'extractionDenylist', 'saveArticleOnClipboard', 'isShowMessage', 'isShowBadge']) {
      expect(stored).not.toHaveProperty(key);
    }
  });
});
