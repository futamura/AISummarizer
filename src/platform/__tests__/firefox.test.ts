import { firefoxPlatform } from '@/platform/firefox';

describe('firefoxPlatform', () => {
  const open = jest.fn(() => Promise.resolve());
  const close = jest.fn(() => Promise.resolve());

  beforeEach(() => {
    open.mockClear();
    close.mockClear();
    (globalThis as any).browser = { sidebarAction: { open, close } };
  });

  afterEach(() => {
    delete (globalThis as any).browser;
    delete (globalThis as any).matchMedia;
    delete (globalThis as any).chrome;
  });

  it('opens the sidebar synchronously so the user gesture is kept', () => {
    const promise = firefoxPlatform.openSettingsPanel(123);
    /* Must be called before the returned promise is awaited */
    expect(open).toHaveBeenCalledTimes(1);
    return promise;
  });

  it('closes the sidebar synchronously', () => {
    const promise = firefoxPlatform.closeSettingsPanel();
    expect(close).toHaveBeenCalledTimes(1);
    return promise;
  });

  /* Firefox for Android has no sidebar: settings open in a tab instead */
  it('opens the options page when the sidebar API is missing', async () => {
    const openOptionsPage = jest.fn(() => Promise.resolve());
    (globalThis as any).browser = {};
    (globalThis as any).chrome = { runtime: { openOptionsPage } };

    await firefoxPlatform.openSettingsPanel();

    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });

  it('closes the settings tab when the sidebar API is missing', async () => {
    const remove = jest.fn(() => Promise.resolve());
    (globalThis as any).browser = {};
    (globalThis as any).chrome = { tabs: { getCurrent: jest.fn(() => Promise.resolve({ id: 5 })), remove } };

    await firefoxPlatform.closeSettingsPanel();

    expect(remove).toHaveBeenCalledWith(5);
  });

  it('reports the initial color scheme and later changes', async () => {
    let listener: ((event: { matches: boolean }) => void) | undefined;
    const mediaQuery = {
      matches: true,
      addEventListener: jest.fn((_type: string, callback: (event: { matches: boolean }) => void) => {
        listener = callback;
      }),
    };
    (globalThis as any).matchMedia = jest.fn(() => mediaQuery);
    const onChange = jest.fn();

    await firefoxPlatform.initThemeDetection(onChange);

    expect((globalThis as any).matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(onChange).toHaveBeenLastCalledWith(true);
    listener?.({ matches: false });
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('does not use runtime messaging for theme detection', async () => {
    const sendMessage = jest.fn();
    (globalThis as any).chrome = { runtime: { sendMessage } };
    (globalThis as any).matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn() }));

    await firefoxPlatform.initThemeDetection(jest.fn());

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
