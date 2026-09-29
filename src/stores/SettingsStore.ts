import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/constants';
import { AIService, resolveModelFor, TabBehavior } from '@/types';
import { logger } from '@/utils';
/* Import directly: DEFAULT_PROMPT calls it at module load, when the @/utils barrel may still be loading (utils/Text imports this store) */
import { getBrowserLanguage } from '@/utils/i18n';

export interface SettingsState {
  prompts: {
    [key in AIService]: string;
  };
  /* Model override per service. Empty string means "use the service's own default" */
  models: {
    [key in AIService]: string;
  };
  serviceOnMenu: {
    [key in AIService]: boolean;
  };
  /* Prompt for "Copy to clipboard", which has no AI service to take a prompt from */
  clipboardPrompt: string;
  tabBehavior: TabBehavior;
}

const DEFAULT_PROMPT = `Extract each theme from the following text without omission and summarize the main points in ${getBrowserLanguage()}.

# Title
{title}

# URL
{url}

# Content
{content}`;

export const DEFAULT_SETTINGS: SettingsState = {
  prompts: {
    [AIService.CHATGPT]: DEFAULT_PROMPT,
    [AIService.GEMINI]: DEFAULT_PROMPT,
    [AIService.AI_STUDIO]: DEFAULT_PROMPT,
    [AIService.CLAUDE]: DEFAULT_PROMPT,
    [AIService.GROK]: DEFAULT_PROMPT,
    [AIService.PERPLEXITY]: DEFAULT_PROMPT,
    [AIService.DEEPSEEK]: DEFAULT_PROMPT,
    [AIService.KIMI]: DEFAULT_PROMPT,
    [AIService.QWEN]: DEFAULT_PROMPT,
  },
  models: {
    [AIService.CHATGPT]: '',
    [AIService.GEMINI]: '',
    [AIService.AI_STUDIO]: '',
    [AIService.CLAUDE]: '',
    [AIService.GROK]: '',
    [AIService.PERPLEXITY]: '',
    [AIService.DEEPSEEK]: '',
    [AIService.KIMI]: '',
    [AIService.QWEN]: '',
  },
  serviceOnMenu: {
    [AIService.CHATGPT]: true,
    [AIService.GEMINI]: true,
    [AIService.AI_STUDIO]: true,
    [AIService.CLAUDE]: true,
    [AIService.GROK]: true,
    [AIService.PERPLEXITY]: true,
    [AIService.DEEPSEEK]: true,
    [AIService.KIMI]: true,
    [AIService.QWEN]: true,
  },
  clipboardPrompt: DEFAULT_PROMPT,
  tabBehavior: TabBehavior.NEW_TAB,
};

export interface SettingsStore extends SettingsState {
  updateSettings: (settings: Partial<SettingsState>) => Promise<void>;
  setPromptFor: (service: AIService, prompt: string) => Promise<void>;
  getPromptFor: (service: AIService) => Promise<string>;
  setModelFor: (service: AIService, model: string) => Promise<void>;
  getModelFor: (service: AIService) => Promise<string>;
  setServiceOnMenu: (service: AIService, status: boolean) => Promise<void>;
  getServiceOnMenu: (service: AIService) => Promise<boolean>;
  setClipboardPrompt: (clipboardPrompt: string) => Promise<void>;
  getClipboardPrompt: () => Promise<string>;
  setTabBehavior: (tabBehavior: TabBehavior) => Promise<void>;
  getTabBehavior: () => Promise<TabBehavior>;
  exportSettings: () => Promise<{ success: boolean; error?: Error }>;
  importSettings: (file: File) => Promise<{ success: boolean; error?: Error }>;
  restoreSettings: () => Promise<{ success: boolean; error?: Error }>;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      updateSettings: async (settings: Partial<SettingsState>) => {
        set((state: SettingsState) => ({
          ...state,
          ...settings,
        }));
      },
      setPromptFor: async (service: AIService, prompt: string) => {
        await get().updateSettings({
          prompts: {
            ...get().prompts,
            [service]: prompt,
          },
        });
      },
      getPromptFor: async (service: AIService) => {
        const settings = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        return settings[STORAGE_KEYS.SETTINGS]?.state?.prompts?.[service] ?? DEFAULT_SETTINGS.prompts[service];
      },
      setModelFor: async (service: AIService, model: string) => {
        await get().updateSettings({
          models: {
            ...get().models,
            [service]: model,
          },
        });
      },
      getModelFor: async (service: AIService) => {
        const settings = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        /* A model dropped from the options is read as the default but left in storage, so that adding it back restores it */
        return resolveModelFor(service, settings[STORAGE_KEYS.SETTINGS]?.state?.models?.[service] ?? DEFAULT_SETTINGS.models[service]);
      },
      setServiceOnMenu: async (service: AIService, status: boolean) => {
        await get().updateSettings({
          serviceOnMenu: {
            ...get().serviceOnMenu,
            [service]: status,
          },
        });
      },
      getServiceOnMenu: async (service: AIService) => {
        const settings = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        return settings[STORAGE_KEYS.SETTINGS]?.state?.serviceOnMenu?.[service] ?? DEFAULT_SETTINGS.serviceOnMenu[service];
      },
      setClipboardPrompt: async (clipboardPrompt: string) => {
        await get().updateSettings({ clipboardPrompt });
      },
      getClipboardPrompt: async () => {
        const settings = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        return settings[STORAGE_KEYS.SETTINGS]?.state?.clipboardPrompt ?? DEFAULT_SETTINGS.clipboardPrompt;
      },
      setTabBehavior: async (tabBehavior: TabBehavior) => {
        await get().updateSettings({ tabBehavior });
      },
      getTabBehavior: async () => {
        const settings = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
        return settings[STORAGE_KEYS.SETTINGS]?.state?.tabBehavior ?? DEFAULT_SETTINGS.tabBehavior;
      },
      exportSettings: async (): Promise<{ success: boolean; error?: Error }> => {
        try {
          /** Get the extension version */
          const manifestData = chrome.runtime.getManifest();
          const extensionVersion = manifestData.version;

          /** Get the settings */
          const settings = get();

          /** Create the backup data */
          const backupData = {
            version: extensionVersion,
            settings: {
              prompt: settings.prompts || {},
              models: settings.models || {},
              clipboardPrompt: settings.clipboardPrompt || DEFAULT_SETTINGS.clipboardPrompt,
              tabBehavior: settings.tabBehavior || '',
            },
          };

          /** Create the backup file */
          const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;

          /** Create the download file name */
          const now = new Date();
          const dateStr =
            now.getFullYear().toString() +
            (now.getMonth() + 1).toString().padStart(2, '0') +
            now.getDate().toString().padStart(2, '0') +
            '-' +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0') +
            now.getSeconds().toString().padStart(2, '0');
          a.download = `free-ai-summarizer-settings-${dateStr}.json`;

          /** Download the backup file */
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          return { success: true };
        } catch (error) {
          logger.error('🏪⚙️', '[SettingsStore.ts]', '[exportSettings]', 'Failed to export settings:', error);
          return { success: false, error: error as Error };
        }
      },
      importSettings: async (file: File): Promise<{ success: boolean; error?: Error }> => {
        try {
          /** Read the backup file */
          const text = await file.text();
          const backupData = JSON.parse(text);

          /** Check if the backup file is valid */
          if (!backupData || typeof backupData !== 'object' || !backupData.settings) {
            throw new Error('Invalid backup file format');
          }

          /** Import settings */
          await get().updateSettings({
            prompts: backupData.settings.prompt,
            models: backupData.settings.models ?? DEFAULT_SETTINGS.models,
            clipboardPrompt: backupData.settings.clipboardPrompt ?? DEFAULT_SETTINGS.clipboardPrompt,
            tabBehavior: backupData.settings.tabBehavior as TabBehavior,
          });

          return { success: true };
        } catch (error) {
          logger.error('🏪⚙️', '[SettingsStore.ts]', '[importSettings]', 'Failed to import settings:', error);
          return { success: false, error: error as Error };
        }
      },
      restoreSettings: async (): Promise<{ success: boolean; error?: Error }> => {
        try {
          /** Restore settings */
          await get().updateSettings({
            prompts: DEFAULT_SETTINGS.prompts,
            models: DEFAULT_SETTINGS.models,
            clipboardPrompt: DEFAULT_SETTINGS.clipboardPrompt,
            tabBehavior: DEFAULT_SETTINGS.tabBehavior,
          });

          return { success: true };
        } catch (error) {
          logger.error('🏪⚙️', '[SettingsStore.ts]', '[restoreSettings]', 'Failed to reset settings:', error);
          return { success: false, error: error as Error };
        }
      },
    }),
    {
      name: STORAGE_KEYS.SETTINGS,
      /* Persist the state only: Firefox stores extension data with the structured clone algorithm, which throws
         DataCloneError on the store actions, so an unpartitioned write silently saves nothing */
      partialize: (state): SettingsState => ({
        prompts: state.prompts,
        models: state.models,
        serviceOnMenu: state.serviceOnMenu,
        clipboardPrompt: state.clipboardPrompt,
        tabBehavior: state.tabBehavior,
      }),
      storage: {
        getItem: async (name: string) => {
          const result = await chrome.storage.local.get(name);
          if (!result[name]) {
            // Initialize with DEFAULT_SETTINGS if storage is empty
            await chrome.storage.local.set({
              [name]: {
                state: DEFAULT_SETTINGS,
                version: 0,
              },
            });
            return {
              state: DEFAULT_SETTINGS,
              version: 0,
            };
          }
          return result[name];
        },
        setItem: async (name: string, value: any) => {
          await chrome.storage.local.set({ [name]: value });
        },
        removeItem: async (name: string) => {
          await chrome.storage.local.remove(name);
        },
      },
    }
  )
);
