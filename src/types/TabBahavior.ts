export enum TabBehavior {
  CURRENT_TAB = 'CURRENT_TAB',
  NEW_TAB = 'NEW_TAB',
  NEW_PRIVATE_TAB = 'NEW_PRIVATE_TAB',
  // NEW_INCOGNITO_TAB = 'NEW_INCOGNITO_TAB',
}

export const getTabBehaviorLabel = (behavior: TabBehavior): string => {
  const labels: Record<TabBehavior, string> = {
    [TabBehavior.CURRENT_TAB]: 'Current Tab',
    [TabBehavior.NEW_TAB]: 'New Tab',
    [TabBehavior.NEW_PRIVATE_TAB]: 'New Private Tab',
    // [TabBehavior.NEW_INCOGNITO_TAB]: 'New Incognito Tab',
  };
  return labels[behavior];
};

/*
 * Firefox for Android has no windows API, so a private window cannot be opened there.
 * Checked at runtime rather than through __TARGET__, the same way the sidebar is
 * (see src/platform/firefox.ts); the desktop and the Android builds are the same bundle
 */
export const isPrivateTabSupported = (): boolean => typeof chrome !== 'undefined' && chrome.windows !== undefined;

/** The behaviors the current browser can actually carry out */
export const getAvailableTabBehaviors = (): TabBehavior[] => {
  return Object.values(TabBehavior).filter(behavior => behavior !== TabBehavior.NEW_PRIVATE_TAB || isPrivateTabSupported());
};

export const getTabBehaviorIndex = (behavior: TabBehavior): number => {
  const behaviors = getAvailableTabBehaviors();
  const index = behaviors.indexOf(behavior);
  /** A stored behavior this browser cannot carry out falls back to a new tab */
  return index !== -1 ? index : behaviors.indexOf(TabBehavior.NEW_TAB);
};

export const getTabBehaviorFromIndex = (index: number): TabBehavior => {
  return getAvailableTabBehaviors()[index];
};

export const getTabBehaviorTypeFromString = (str: string): TabBehavior => {
  switch (str) {
    case 'CURRENT_TAB':
      return TabBehavior.CURRENT_TAB;
    case 'NEW_TAB':
      return TabBehavior.NEW_TAB;
    case 'NEW_PRIVATE_TAB':
      return TabBehavior.NEW_PRIVATE_TAB;
    default:
      return TabBehavior.CURRENT_TAB;
  }
};
