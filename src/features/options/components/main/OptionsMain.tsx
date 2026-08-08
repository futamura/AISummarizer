import clsx from 'clsx';

import React, { Fragment, useCallback, useEffect, useState } from 'react';

import { IoClose } from 'react-icons/io5';

import { Field, Input, Switch, Tab, TabGroup, TabList, TabPanel, TabPanels, Textarea } from '@headlessui/react';

import { toast, Toaster } from '@/features/content/components/main/Toaster';
import { ConfirmDialog, OptionCard } from '@/features/options/components/main';
import { DEFAULT_SETTINGS, useGlobalContext } from '@/stores';
import {
  AIService,
  ContentExtractionTiming,
  getAIServiceLabel,
  getContentExtractionTimingFromIndex,
  getContentExtractionTimingIndex,
  getContentExtractionTimingLabel,
  getModelOptionsFor,
  getTabBehaviorFromIndex,
  getTabBehaviorIndex,
  getTabBehaviorLabel,
  supportsModelParam,
  supportsModelSelection,
  TabBehavior,
} from '@/types';
import { logger } from '@/utils';

/**
 * The main component for the options page.
 * @returns
 */
export const OptionsMain: React.FC = () => {
  /*******************************************************
   * State
   *******************************************************/

  const {
    /** updateSettings */
    updateSettings,
    /** prompts */
    prompts: storedPrompts,
    getPromptFor: storedPromptFor,
    setPromptFor: setStoredPromptFor,
    /** models */
    models: storedModels,
    setModelFor: setStoredModelFor,
    getModelFor: getStoredModelFor,
    /** serviceOnMenu */
    serviceOnMenu: storedServiceStatus,
    setServiceOnMenu: setStoredServiceStatus,
    getServiceOnMenu: getStoredServiceStatus,
    /** tabBehavior */
    tabBehavior: storedTabBehavior,
    setTabBehavior: setStoredTabBehavior,
    /** contentExtractionTiming */
    contentExtractionTiming: storedContentExtractionTiming,
    setContentExtractionTiming: setStoredContentExtractionTiming,
    /** extractionDenylist */
    extractionDenylist: storedExtractionDenylist,
    setExtractionDenylist: setStoredExtractionDenylist,
    /** saveArticleOnClipboard */
    saveArticleOnClipboard: storedSaveArticleOnClipboard,
    setSaveArticleOnClipboard: setStoredSaveArticleOnClipboard,
    /** isShowMessage */
    isShowMessage: storedIsShowMessage,
    setIsShowMessage: setStoredIsShowMessage,
    /** isShowBadge */
    isShowBadge: storedIsShowBadge,
    setIsShowBadge: setStoredIsShowBadge,
    /** manage settings */
    exportSettings,
    importSettings,
    restoreSettings,
    resetDatabase,
  } = useGlobalContext();

  const [inputPromptsIndex, setInputPromptsIndex] = useState<number>(0);
  const [inputPrompts, setInputPrompts] = useState<{ [key in AIService]?: string } | undefined>(undefined);
  const [inputModels, setInputModels] = useState<{ [key in AIService]?: string } | undefined>(undefined);

  const [inputServiceStatus, setInputServiceStatus] = useState<{ [key in AIService]: boolean } | undefined>(undefined);

  const [inputTabBehavior, setInputTabBehavior] = useState<number | undefined>(undefined);
  const [inputContentExtractionTiming, setInputContentExtractionTiming] = useState<number | undefined>(undefined);
  const [inputIsSaveArticleOnClipboard, setInputIsSaveArticleOnClipboard] = useState<boolean | undefined>(undefined);
  const [inputIsShowMessage, setInputIsShowMessage] = useState<boolean | undefined>(undefined);
  const [inputIsShowBadge, setInputIsShowBadge] = useState<boolean | undefined>(undefined);

  const [inputExtractionDenylist, setInputExtractionDenylist] = useState<string | undefined>(undefined);

  const [isDeleteCacheDialogOpen, setIsDeleteCacheDialogOpen] = useState<boolean>(false);
  const [isResetSettingsDialogOpen, setIsResetSettingsDialogOpen] = useState<boolean>(false);

  /*******************************************************
   * Initialize input values based on stored values
   *******************************************************/

  useEffect(() => {
    if (inputPrompts === undefined) {
      const loadPrompts = async () => {
        const values: [AIService, string][] = await Promise.all(
          Object.values(AIService).map(async (service: AIService) => [service, await storedPromptFor(service)] as const)
        );
        setInputPrompts(Object.fromEntries(values));
      };
      loadPrompts();
    }
  }, [inputPrompts, storedPrompts]);

  useEffect(() => {
    if (inputModels === undefined) {
      const loadModels = async () => {
        const values: [AIService, string][] = await Promise.all(
          Object.values(AIService).map(async (service: AIService) => [service, await getStoredModelFor(service)] as const)
        );
        setInputModels(Object.fromEntries(values));
      };
      loadModels();
    }
  }, [inputModels, storedModels]);

  useEffect(() => {
    if (inputServiceStatus === undefined) {
      const loadServiceStatus = async () => {
        const values: [AIService, boolean][] = await Promise.all(
          Object.values(AIService).map(async (service: AIService) => [service, await getStoredServiceStatus(service)] as const)
        );
        setInputServiceStatus(Object.fromEntries(values) as { [key in AIService]: boolean });
      };
      loadServiceStatus();
    }
  }, [inputServiceStatus, storedServiceStatus]);

  useEffect(() => {
    if (inputTabBehavior === undefined) setInputTabBehavior(getTabBehaviorIndex(storedTabBehavior));
  }, [inputTabBehavior, storedTabBehavior]);

  useEffect(() => {
    if (inputContentExtractionTiming === undefined) setInputContentExtractionTiming(getContentExtractionTimingIndex(storedContentExtractionTiming));
  }, [inputContentExtractionTiming, storedContentExtractionTiming]);

  useEffect(() => {
    if (inputExtractionDenylist === undefined) setInputExtractionDenylist(storedExtractionDenylist);
  }, [inputExtractionDenylist, storedExtractionDenylist]);

  useEffect(() => {
    if (inputIsSaveArticleOnClipboard === undefined) setInputIsSaveArticleOnClipboard(storedSaveArticleOnClipboard);
  }, [inputIsSaveArticleOnClipboard, storedSaveArticleOnClipboard]);

  useEffect(() => {
    if (inputIsShowMessage === undefined) setInputIsShowMessage(storedIsShowMessage);
  }, [inputIsShowMessage, storedIsShowMessage]);

  useEffect(() => {
    if (inputIsShowBadge === undefined) setInputIsShowBadge(storedIsShowBadge);
  }, [inputIsShowBadge, storedIsShowBadge]);

  /*******************************************************
   * Handlers
   *******************************************************/

  /**
   * Save Settings
   */
  const saveStoredSettings = useCallback(async () => {
    await updateSettings({
      prompts: Object.fromEntries(Object.values(AIService).map(service => [service, inputPrompts?.[service] ?? DEFAULT_SETTINGS.prompts[service]])) as {
        [key in AIService]: string;
      },
      models: Object.fromEntries(Object.values(AIService).map(service => [service, inputModels?.[service] ?? DEFAULT_SETTINGS.models[service]])) as {
        [key in AIService]: string;
      },
      serviceOnMenu: Object.fromEntries(
        Object.values(AIService).map(service => [service, inputServiceStatus?.[service] ?? DEFAULT_SETTINGS.serviceOnMenu[service]])
      ) as {
        [key in AIService]: boolean;
      },
      tabBehavior: getTabBehaviorFromIndex(inputTabBehavior ?? getTabBehaviorIndex(DEFAULT_SETTINGS.tabBehavior)),
      contentExtractionTiming: getContentExtractionTimingFromIndex(
        inputContentExtractionTiming ?? getContentExtractionTimingIndex(DEFAULT_SETTINGS.contentExtractionTiming)
      ),
      extractionDenylist: inputExtractionDenylist ?? DEFAULT_SETTINGS.extractionDenylist,
      saveArticleOnClipboard: inputIsSaveArticleOnClipboard ?? DEFAULT_SETTINGS.saveArticleOnClipboard,
      isShowMessage: inputIsShowMessage ?? DEFAULT_SETTINGS.isShowMessage,
      isShowBadge: inputIsShowBadge ?? DEFAULT_SETTINGS.isShowBadge,
    });
  }, [inputPrompts, inputModels, inputTabBehavior, inputContentExtractionTiming, inputIsSaveArticleOnClipboard]);

  /**
   * Unset Input Settings
   */
  const unsetInputValues = useCallback(async () => {
    await setInputPromptsIndex(0);
    await setInputPrompts(undefined);
    await setInputModels(undefined);
    await setInputServiceStatus(undefined);
    await setInputTabBehavior(undefined);
    await setInputContentExtractionTiming(undefined);
    await setInputExtractionDenylist(undefined);
    await setInputIsSaveArticleOnClipboard(undefined);
    await setInputIsShowMessage(undefined);
    await setInputIsShowBadge(undefined);
  }, []);

  /**
   * Export Settings
   */
  const handleExport = useCallback(async () => {
    const result = await exportSettings();
    if (result.success) toast.success('Settings exported successfully');
    else toast.error(result.error?.message ?? 'Failed to export settings');
  }, [exportSettings]);

  /**
   * Import Settings
   */
  const handleImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      /** Get the file */
      const file = event.target.files?.[0];
      if (!file) return;

      /** Import the settings */
      const result = await importSettings(file);
      if (result.success) toast.success('Settings imported successfully');
      else toast.error(result.error?.message ?? 'Failed to import settings');

      /** Unset input settings */
      await unsetInputValues();
    },
    [importSettings, unsetInputValues]
  );

  /**
   * Restore Default Settings
   */
  const handleResetSettings = useCallback(async () => {
    /** Restore settings */
    const result = await restoreSettings();
    if (result.success) toast.success('Settings restored successfully');
    else toast.error(result.error?.message ?? 'Failed to restore settings');

    /** Unset input settings */
    await unsetInputValues();
  }, [restoreSettings, unsetInputValues]);

  /**
   * Clear Article Cache
   */
  const handleDeleteCache = useCallback(async () => {
    /** Unset input settings */
    await unsetInputValues();

    /** Reset database */
    const result = await resetDatabase();
    if (result.success) toast.success('Database cleanup completed');
    else toast.error(result.error?.message ?? 'Failed to cleanup database');
  }, [resetDatabase, unsetInputValues]);

  /*******************************************************
   * Render
   *******************************************************/

  return (
    <>
      <Toaster position="top-center" duration={3000} />
      <div className="min-h-screen p-4 bg-white dark:bg-zinc-900">
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 ps-2">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Settings</h1>
            <button
              onClick={async () => {
                try {
                  await chrome.sidePanel.setOptions({ enabled: false });
                } catch (error) {
                  logger.error('📦⌥', '[OptionsMain.tsx]', '[render]', 'Failed to close side panel', error);
                }
              }}
              className="rounded-full p-2 text-lg text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <IoClose className="h-6 w-6" />
            </button>
          </div>

          {/* AI Service */}
          <OptionCard title="AI Service">
            <TabGroup selectedIndex={inputPromptsIndex} onChange={setInputPromptsIndex}>
              <TabList className="flex flex-wrap gap-2">
                {Object.entries(AIService).map(([name, service]: [string, AIService], index) => (
                  <Tab
                    key={name}
                    className={clsx(
                      'rounded-full px-3 py-1 font-semibold',
                      'text-zinc-900 dark:text-zinc-50',
                      'bg-zinc-300 dark:bg-zinc-700',
                      'opacity-30 dark:opacity-30',
                      'hover:opacity-100',
                      inputPromptsIndex === index && '!bg-blue-600 !opacity-100',
                      'focus:outline-none',
                      'transition-opacity'
                    )}
                  >
                    {getAIServiceLabel(service)}
                  </Tab>
                ))}
              </TabList>
              <TabPanels className="mt-3">
                {Object.entries(AIService).map(([name, service]: [string, AIService]) => (
                  <TabPanel key={name} className="flex flex-col gap-2">
                    {supportsModelSelection(service) && (
                      <div className="flex flex-col gap-2">
                        <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Model</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            className={clsx(
                              'rounded-full px-3 py-1 font-semibold',
                              'text-zinc-900 dark:text-zinc-50',
                              'bg-zinc-300 dark:bg-zinc-700',
                              'opacity-30 dark:opacity-30',
                              'hover:opacity-100',
                              (inputModels?.[service] ?? '') === '' && '!bg-blue-600 !opacity-100',
                              'focus:outline-none',
                              'transition-opacity'
                            )}
                            onClick={async () => {
                              setInputModels(prev => ({ ...(prev ?? {}), [service]: '' }));
                              await setStoredModelFor(service, '');
                            }}
                          >
                            Default
                          </button>
                          {getModelOptionsFor(service).map(option => (
                            <button
                              key={option.value}
                              className={clsx(
                                'rounded-full px-3 py-1 font-semibold',
                                'text-zinc-900 dark:text-zinc-50',
                                'bg-zinc-300 dark:bg-zinc-700',
                                'opacity-30 dark:opacity-30',
                                'hover:opacity-100',
                                inputModels?.[service] === option.value && '!bg-blue-600 !opacity-100',
                                'focus:outline-none',
                                'transition-opacity'
                              )}
                              onClick={async () => {
                                setInputModels(prev => ({ ...(prev ?? {}), [service]: option.value }));
                                await setStoredModelFor(service, option.value);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                          {supportsModelParam(service) && (
                            <Input
                              name="custom-model"
                              placeholder="custom model id"
                              className={clsx(
                                'rounded-full px-3 py-1',
                                'text-zinc-700 dark:text-zinc-300',
                                'bg-zinc-50 dark:bg-zinc-800',
                                'border border-zinc-300 dark:border-none',
                                'focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700'
                              )}
                              value={getModelOptionsFor(service).some(o => o.value === (inputModels?.[service] ?? '')) ? '' : (inputModels?.[service] ?? '')}
                              onChange={e => {
                                const newValue = e.target.value;
                                setInputModels(prev => ({ ...(prev ?? {}), [service]: newValue }));
                              }}
                              onBlur={async () => {
                                await setStoredModelFor(service, inputModels?.[service] ?? '');
                              }}
                            />
                          )}
                        </div>
                      </div>
                    )}
                    <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Prompt</span>
                    <Field>
                      <Textarea
                        name="prompt"
                        className={clsx(
                          'block w-full rounded-lg',
                          'px-3 py-1.5 text-base/6',
                          'text-zinc-700 dark:text-zinc-300',
                          'bg-zinc-50 dark:bg-zinc-800',
                          'border border-zinc-300 dark:border-none',
                          'focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700',
                          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-700'
                        )}
                        rows={12}
                        value={inputPrompts?.[service] ?? ''}
                        onChange={e => {
                          const newValue = e.target.value;
                          setInputPrompts(prev => {
                            const newPrompts = { ...(prev ?? {}) };
                            newPrompts[service] = newValue;
                            return newPrompts;
                          });
                        }}
                        onBlur={async () => {
                          logger.debug('📦⌥', '[OptionsMain.tsx]', '[render]', 'onBlur', inputPrompts?.[service]);
                          await setStoredPromptFor(service, inputPrompts?.[service] ?? '');
                        }}
                      />
                    </Field>
                    {/* <div className="flex flex-wrap gap-2 items-center">
                      <label htmlFor={`service-status-${service}`} className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        Display on menu
                      </label>
                      <Switch
                        key={name}
                        checked={inputServiceStatus?.[service] ?? false}
                        onChange={async () => {
                          const newStatus = !(inputServiceStatus?.[service] ?? false);
                          setInputServiceStatus(prev => {
                            const newServiceStatus = { ...(prev ?? DEFAULT_SETTINGS.serviceOnMenu) };
                            newServiceStatus[service] = newStatus;
                            return newServiceStatus;
                          });
                          await setStoredServiceStatus(service, newStatus);
                        }}
                        className={clsx(
                          'group inline-flex h-6 w-11 items-center rounded-full',
                          (inputServiceStatus?.[service] ?? false) ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700'
                        )}
                      >
                        <span className="sr-only">Display on menu</span>
                        <span
                          className={clsx(
                            'size-4 rounded-full transition',
                            'bg-white',
                            (inputServiceStatus?.[service] ?? false) ? 'translate-x-6' : 'translate-x-1'
                          )}
                        />
                      </Switch>
                    </div> */}
                  </TabPanel>
                ))}
              </TabPanels>
            </TabGroup>
          </OptionCard>

          {/* Menu */}
          <div className="flex flex-col gap-2">
            <OptionCard title="Display on Menu" className="flex flex-wrap gap-2">
              {Object.entries(AIService).map(([name, service]: [string, AIService], index) => (
                <button
                  key={name}
                  className={clsx(
                    'rounded-full px-3 py-1 font-semibold',
                    'text-zinc-900 dark:text-zinc-50',
                    'bg-zinc-300 dark:bg-zinc-700',
                    'opacity-30 dark:opacity-30',
                    'hover:opacity-100',
                    inputServiceStatus?.[service] && '!bg-blue-600 !opacity-100',
                    'focus:outline-none',
                    'transition-opacity'
                  )}
                  onClick={async () => {
                    const newStatus = !(inputServiceStatus?.[service] ?? false);
                    setInputServiceStatus(prev => {
                      const newServiceStatus = { ...(prev ?? DEFAULT_SETTINGS.serviceOnMenu) };
                      newServiceStatus[service] = newStatus;
                      return newServiceStatus;
                    });
                    await setStoredServiceStatus(service, newStatus);
                  }}
                >
                  {getAIServiceLabel(service)}
                </button>
              ))}
            </OptionCard>
          </div>

          {/* Open AI Service in */}
          <OptionCard title="Open AI Service in">
            <TabGroup selectedIndex={inputTabBehavior} onChange={setInputTabBehavior}>
              <TabList className="flex flex-wrap gap-2">
                {Object.entries(TabBehavior).map(([name, behavior]: [string, TabBehavior], index) => (
                  <Tab
                    key={name}
                    className={clsx(
                      'rounded-full px-3 py-1 font-semibold',
                      'text-zinc-900 dark:text-zinc-50',
                      'bg-zinc-300 dark:bg-zinc-700',
                      'opacity-30 dark:opacity-30',
                      'hover:opacity-100',
                      inputTabBehavior === index && '!bg-blue-600 !opacity-100',
                      'focus:outline-none',
                      'transition-opacity'
                    )}
                    onClick={async () => await setStoredTabBehavior(behavior)}
                  >
                    {getTabBehaviorLabel(behavior)}
                  </Tab>
                ))}
              </TabList>
            </TabGroup>
          </OptionCard>

          {/* Content Extraction */}
          <OptionCard title="Content Extraction">
            <TabGroup selectedIndex={inputContentExtractionTiming} onChange={setInputContentExtractionTiming}>
              <TabList className="flex flex-wrap gap-2">
                {Object.entries(ContentExtractionTiming).map(([name, method]: [string, ContentExtractionTiming], index) => (
                  <Tab
                    key={name}
                    className={clsx(
                      'rounded-full px-3 py-1 font-semibold',
                      'text-zinc-900 dark:text-zinc-50',
                      'bg-zinc-300 dark:bg-zinc-700',
                      'opacity-30 dark:opacity-30',
                      'hover:opacity-100',
                      inputContentExtractionTiming === index && '!bg-blue-600 !opacity-100',
                      'focus:outline-none',
                      'transition-opacity'
                    )}
                    onClick={async () => await setStoredContentExtractionTiming(method)}
                  >
                    {getContentExtractionTimingLabel(method)}
                  </Tab>
                ))}
              </TabList>
            </TabGroup>
          </OptionCard>
          {storedContentExtractionTiming === ContentExtractionTiming.AUTOMATIC && (
            <div className="p-2">
              <h3 className="mb-4 text-default font-semibold text-zinc-900 dark:text-zinc-100">Denylist</h3>
              <Textarea
                name="denylist"
                className={`
                  block w-full
                  rounded-lg
                  px-3 py-1.5
                  text-base/6
                  text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-none
                  focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700
                  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-700
                `}
                rows={12}
                value={inputExtractionDenylist}
                onChange={e => {
                  const newValue = e.target.value;
                  setInputExtractionDenylist(newValue);
                  setStoredExtractionDenylist(newValue);
                }}
              />
            </div>
          )}

          {/* Copy Article to Clipboard */}
          <OptionCard title="Copy Article to Clipboard When Extraction Completes">
            <Switch checked={inputIsSaveArticleOnClipboard ?? false} onChange={setInputIsSaveArticleOnClipboard} as={Fragment}>
              {({ checked, disabled }) => (
                <button
                  className={clsx(
                    'group inline-flex h-6 w-11 items-center rounded-full',
                    checked ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                  onClick={async () => await setStoredSaveArticleOnClipboard(!checked)}
                >
                  <span className="sr-only">Copy Article to Clipboard</span>
                  <span className={clsx('size-4 rounded-full transition', 'bg-white', checked ? 'translate-x-6' : 'translate-x-1')} />
                </button>
              )}
            </Switch>
          </OptionCard>

          {/* Show Message on Extraction Complete */}
          <OptionCard title="Show Message When Extraction Completes">
            <Switch checked={inputIsShowMessage ?? false} onChange={setInputIsShowMessage} as={Fragment}>
              {({ checked, disabled }) => (
                <button
                  className={clsx(
                    'group inline-flex h-6 w-11 items-center rounded-full',
                    checked ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                  onClick={async () => await setStoredIsShowMessage(!checked)}
                >
                  <span className="sr-only">Show Message on Extraction Complete</span>
                  <span className={clsx('size-4 rounded-full transition', 'bg-white', checked ? 'translate-x-6' : 'translate-x-1')} />
                </button>
              )}
            </Switch>
          </OptionCard>

          {/* Show Badge on Extraction Complete */}
          <OptionCard title="Show Badge When Extraction Completes">
            <Switch checked={inputIsShowBadge ?? false} onChange={setInputIsShowBadge} as={Fragment}>
              {({ checked, disabled }) => (
                <button
                  className={clsx(
                    'group inline-flex h-6 w-11 items-center rounded-full',
                    checked ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700',
                    disabled && 'cursor-not-allowed opacity-50'
                  )}
                  onClick={async () => await setStoredIsShowBadge(!checked)}
                >
                  <span className="sr-only">Show Message on Extraction Complete</span>
                  <span className={clsx('size-4 rounded-full transition', 'bg-white', checked ? 'translate-x-6' : 'translate-x-1')} />
                </button>
              )}
            </Switch>
          </OptionCard>

          {/* Manage Settings */}
          <OptionCard title="Manage Settings" className="flex flex-wrap gap-2">
            <button
              className={clsx(
                'rounded-full w-60 px-6 py-4 text-lg',
                'font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors',
                'focus:outline-none whitespace-nowrap'
              )}
              onClick={handleExport}
            >
              Export Settings
            </button>
            <div className="relative">
              <input type="file" accept=".json" onChange={handleImport} className="hidden" id="import-settings" />
              <label
                htmlFor="import-settings"
                className={clsx(
                  'rounded-full w-60 px-6 py-4 text-lg',
                  'font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors',
                  'focus:outline-none whitespace-nowrap',
                  'cursor-pointer block text-center'
                )}
              >
                Import Settings
              </label>
            </div>
            <button
              className={clsx(
                'rounded-full w-60 px-6 py-4 text-lg',
                'font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors',
                'focus:outline-none whitespace-nowrap'
              )}
              onClick={() => setIsResetSettingsDialogOpen(true)}
            >
              Restore Default Settings
            </button>
          </OptionCard>
          <OptionCard title="Manage Cache" className="flex flex-col gap-2">
            <button
              className={`
                rounded-full w-60 px-6 py-4 text-lg
                font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors
                focus:outline-none whitespace-nowrap
              `}
              onClick={() => setIsDeleteCacheDialogOpen(true)}
            >
              Clear Article Cache
            </button>
          </OptionCard>
        </div>

        {/* Reset Settings Dialog */}
        <ConfirmDialog
          isOpen={isResetSettingsDialogOpen}
          onClose={() => setIsResetSettingsDialogOpen(false)}
          title="Restore Default Settings"
          description="Are you sure you want to restore default settings?"
          confirmText="Restore"
          onConfirm={async () => {
            await handleResetSettings();
            setIsResetSettingsDialogOpen(false);
          }}
        />

        {/* Delete Cache Dialog */}
        <ConfirmDialog
          isOpen={isDeleteCacheDialogOpen}
          onClose={() => setIsDeleteCacheDialogOpen(false)}
          title="Clear Article Cache"
          description="Are you sure you want to clear all cached articles?"
          confirmText="Clear"
          onConfirm={async () => {
            await handleDeleteCache();
            setIsDeleteCacheDialogOpen(false);
          }}
        />
      </div>
    </>
  );
};
