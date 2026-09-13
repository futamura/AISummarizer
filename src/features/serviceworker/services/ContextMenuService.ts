import { MENU_ITEMS } from '@/models';
import { useSettingsStore } from '@/stores';
import { getAIServiceFromString } from '@/types';
import { isInvalidUrl, logger } from '@/utils';

/* Firefox for Android ignores the contextMenus permission and leaves chrome.contextMenus undefined */
const isContextMenuSupported = (): boolean => chrome.contextMenus !== undefined;

export class ContextMenuService {
  constructor(onClick: (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => void) {
    if (!isContextMenuSupported()) {
      logger.debug('🧑‍🍳📃', '[ContextMenuService.tsx]', '[constructor]', 'Context menus are not supported on this browser');
      return;
    }
    chrome.contextMenus.onClicked.addListener(onClick.bind(this));
  }

  private async _removeMenu(): Promise<{ result: boolean; error: Error | null }> {
    return new Promise(resolve => {
      try {
        chrome.contextMenus.removeAll(() => {
          logger.debug('🧑‍🍳📃', '[ContextMenuService.tsx]', '[removeMenu]', '🗑️ Context menu removed');
          this._checkRuntimeError();
          resolve({ result: true, error: null });
        });
        this._checkRuntimeError();
      } catch (error) {
        logger.error('🧑‍🍳📃', '[ContextMenuService.tsx]', '[removeMenu]', '🗑️ Failed to remove context menu:', error);
        resolve({ result: false, error: error as Error });
      }
    });
  }

  private async _createContextMenu(
    createProperties: chrome.contextMenus.CreateProperties
  ): Promise<{ result: number | string | undefined; error: Error | null }> {
    return new Promise(resolve => {
      try {
        const id = chrome.contextMenus.create(createProperties, () => {
          this._checkRuntimeError();
          resolve({ result: id, error: null });
        });
        this._checkRuntimeError();
      } catch (error) {
        logger.error('🧑‍🍳📃', '[ContextMenuService.tsx]', '[createContextMenu]', '+ Failed to create context menu:', error);
        resolve({ result: undefined, error: error as Error });
      }
    });
  }

  private _checkRuntimeError() {
    if (chrome.runtime.lastError) {
      logger.warn('🧑‍🍳📃', '[ContextMenuService.tsx]', '[createBasicMenu]', 'Runtime error:', chrome.runtime.lastError);
    }
  }

  async createMenu(isExtracted: boolean, tabUrl?: string) {
    if (!isContextMenuSupported()) return;

    const { result, error } = await this._removeMenu();

    if (error) {
      logger.error('🧑‍🍳📃', '[ContextMenuService.tsx]', '[createMenu]', 'Failed to remove context menu:', error);
      return;
    }

    const isInvalid = await isInvalidUrl(tabUrl);
    if (!tabUrl || isInvalid) {
      await this.createBasicMenu();
    } else {
      await this.createFullMenu(tabUrl, isExtracted);
    }
  }

  private async createFullMenu(tabUrl: string, isExtracted: boolean) {
    try {
      logger.debug('🧑‍🍳📃', '[ContextMenuService.tsx]', '[createFullMenu]', '+ Creating full menu');
      const { result: root, error: rootError } = await this._createContextMenu({
        id: MENU_ITEMS.ROOT_ACTIVE.id,
        title: MENU_ITEMS.ROOT_ACTIVE.title,
        contexts: ['page' as chrome.contextMenus.ContextType],
      });

      /** Create AI service menu items */
      for (const service of MENU_ITEMS.AI_SERVICES) {
        const isServiceOnMenu = await useSettingsStore.getState().getServiceOnMenu(getAIServiceFromString(service.id));
        if (isServiceOnMenu) {
          await this._createContextMenu({
            id: service.id,
            title: service.title,
            contexts: ['page' as chrome.contextMenus.ContextType],
            parentId: root,
          });
        }
      }

      /** Create first divider */
      await this._createContextMenu({
        type: 'separator',
        contexts: ['page' as chrome.contextMenus.ContextType],
        parentId: root,
        id: 'divider1',
      });

      /** Create copy option */
      if (tabUrl && isExtracted) {
        await this._createContextMenu({
          id: MENU_ITEMS.COPY.id,
          title: MENU_ITEMS.COPY.title,
          contexts: ['page' as chrome.contextMenus.ContextType],
          parentId: root,
        });
      }

      /** Create extract option */
      await this._createContextMenu({
        id: MENU_ITEMS.EXTRACT.id,
        title: MENU_ITEMS.EXTRACT.title,
        contexts: ['page' as chrome.contextMenus.ContextType],
        parentId: root,
      });

      /** Create second divider */
      await this._createContextMenu({
        type: 'separator',
        contexts: ['page' as chrome.contextMenus.ContextType],
        parentId: root,
        id: 'divider2',
      });

      /** Create settings option */
      await this._createContextMenu({
        id: MENU_ITEMS.SETTINGS.id,
        title: MENU_ITEMS.SETTINGS.title,
        contexts: ['page' as chrome.contextMenus.ContextType],
        parentId: root,
      });
    } catch (error) {
      logger.error('🧑‍🍳📃', '[ContextMenuService.tsx]', '[createFullMenu]', '+ Failed to create full menu:', error);
    }
  }

  private async createBasicMenu() {
    try {
      logger.debug('🧑‍🍳📃', '[ContextMenuService.tsx]', '[createBasicMenu]', '+ Creating basic menu');
      const { result: root, error: rootError } = await this._createContextMenu({
        id: MENU_ITEMS.ROOT_INACTIVE.id,
        title: MENU_ITEMS.ROOT_INACTIVE.title,
        contexts: ['page' as chrome.contextMenus.ContextType],
      });
      await this._createContextMenu({
        id: MENU_ITEMS.SETTINGS.id,
        title: MENU_ITEMS.SETTINGS.title,
        contexts: ['page' as chrome.contextMenus.ContextType],
        parentId: root,
      });
    } catch (error) {
      logger.error('🧑‍🍳📃', '[ContextMenuService.tsx]', '[createBasicMenu]', '+ Failed to create basic menu:', error);
    }
  }
}
