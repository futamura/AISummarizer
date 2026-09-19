import { STORAGE_KEYS } from '@/constants';
/* The store hydrates at module load, before the chrome mock below exists; persist swallows that first read and
   the assertion targets the write path instead */
import { useSettingsStore } from '@/stores/SettingsStore';

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

    await useSettingsStore.getState().setIsShowBadge(false);
    await flushStorage();

    expect(geckoStorage[STORAGE_KEYS.SETTINGS]?.state?.isShowBadge).toBe(false);
  });
});
