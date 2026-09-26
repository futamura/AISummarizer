import { chromePlatform } from '@/platform/chrome';
import { firefoxPlatform } from '@/platform/firefox';
import { Platform } from '@/platform/types';

/* __TARGET__ is replaced at build time, so the unused implementation is dropped by the minifier */
const platform: Platform = __TARGET__ === 'firefox' ? firefoxPlatform : chromePlatform;

/* Plain wrappers keep each call synchronous up to the underlying browser API */
export const openSettingsPanel = (windowId?: number): Promise<void> => platform.openSettingsPanel(windowId);
export const closeSettingsPanel = (): Promise<void> => platform.closeSettingsPanel();
export const initThemeDetection = (onColorSchemeChange: (isDarkMode: boolean) => void): Promise<void> => platform.initThemeDetection(onColorSchemeChange);
export const insertEditorText = (text: string): void => platform.insertEditorText(text);

export type { Platform };
