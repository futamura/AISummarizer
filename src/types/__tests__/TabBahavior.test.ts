import { getAvailableTabBehaviors, getTabBehaviorFromIndex, getTabBehaviorIndex, isPrivateTabSupported, TabBehavior } from '@/types/TabBahavior';

/* Firefox for Android leaves the windows API undefined; every other target provides it */
const setWindowsApi = (isAvailable: boolean) => {
  (globalThis as any).chrome = isAvailable ? { windows: { getAll: jest.fn(), create: jest.fn() } } : {};
};

describe('TabBehavior', () => {
  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  describe('where the windows API exists', () => {
    beforeEach(() => setWindowsApi(true));

    it('reports the private tab as supported', () => {
      expect(isPrivateTabSupported()).toBe(true);
    });

    it('offers every behavior', () => {
      expect(getAvailableTabBehaviors()).toEqual([TabBehavior.CURRENT_TAB, TabBehavior.NEW_TAB, TabBehavior.NEW_PRIVATE_TAB]);
    });

    it('maps the private tab to its own index', () => {
      expect(getTabBehaviorIndex(TabBehavior.NEW_PRIVATE_TAB)).toBe(2);
      expect(getTabBehaviorFromIndex(2)).toBe(TabBehavior.NEW_PRIVATE_TAB);
    });
  });

  describe('where the windows API is missing', () => {
    beforeEach(() => setWindowsApi(false));

    it('reports the private tab as unsupported', () => {
      expect(isPrivateTabSupported()).toBe(false);
    });

    it('leaves the private tab out of the offered behaviors', () => {
      expect(getAvailableTabBehaviors()).toEqual([TabBehavior.CURRENT_TAB, TabBehavior.NEW_TAB]);
    });

    it('falls back to the new tab for a stored private tab', () => {
      expect(getTabBehaviorIndex(TabBehavior.NEW_PRIVATE_TAB)).toBe(getTabBehaviorIndex(TabBehavior.NEW_TAB));
    });

    it('keeps the remaining behaviors on their own indexes', () => {
      expect(getTabBehaviorFromIndex(0)).toBe(TabBehavior.CURRENT_TAB);
      expect(getTabBehaviorFromIndex(1)).toBe(TabBehavior.NEW_TAB);
    });
  });
});
