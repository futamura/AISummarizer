/*
 * Mock the stores so importing the service worker does not pull in the real
 * zustand persist store (its rehydrate reads chrome.storage on import) or
 * IndexedDB, which does not exist in the node test environment.
 */
jest.mock('@/stores', () => ({
  useArticleStore: { getState: () => ({ getArticleByUrl: jest.fn(() => Promise.resolve(undefined)) }) },
  useSettingsStore: { getState: () => ({}) },
  /* Regex.ts falls back to this when the stored settings hold no denylist */
  DEFAULT_SETTINGS: { extractionDenylist: '' },
}));
jest.mock('@/stores/SettingsStore', () => ({ DEFAULT_SETTINGS: {} }));
/* A recent last-cleanup date makes the initial cleanup skip the database */
jest.mock('@/stores/ArticleStore', () => ({
  useArticleStore: { getState: () => ({ getLastCleanupDate: jest.fn(() => Promise.resolve(new Date())) }) },
}));

const listenerStub = () => ({ addListener: jest.fn(), removeListener: jest.fn() });

/* The active tab is a chrome:// page, where no content script runs */
const NEW_TAB = { id: 1, windowId: 1, url: 'chrome://newtab/' };

/* Extension pages are outside the <all_urls> content script match, on both browsers */
const CHROME_OPTIONS_TAB = { id: 2, windowId: 1, url: 'chrome-extension://abcdefghijklmnop/options.html' };
const FIREFOX_OPTIONS_TAB = { id: 3, windowId: 1, url: 'moz-extension://abcdefghijklmnop/options.html' };

/* An ordinary page, where the extraction is supposed to run */
const ARTICLE_TAB = { id: 4, windowId: 1, url: 'https://example.com/article' };

const createChromeMock = () => ({
  tabs: {
    query: jest.fn(() => Promise.resolve([NEW_TAB])),
    get: jest.fn(() => Promise.resolve(NEW_TAB)),
    sendMessage: jest.fn(() => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'))),
    onActivated: listenerStub(),
    onUpdated: listenerStub(),
  },
  runtime: {
    onMessage: listenerStub(),
    sendMessage: jest.fn(() => Promise.resolve(undefined)),
  },
  contextMenus: {
    create: jest.fn(),
    removeAll: jest.fn(),
    onClicked: listenerStub(),
  },
  offscreen: {
    hasDocument: jest.fn(() => Promise.resolve(false)),
    closeDocument: jest.fn(() => Promise.resolve()),
    createDocument: jest.fn(() => Promise.resolve()),
  },
  alarms: {
    clear: jest.fn(() => Promise.resolve(true)),
    create: jest.fn(() => Promise.resolve()),
    onAlarm: listenerStub(),
  },
  action: {
    setIcon: jest.fn(() => Promise.resolve()),
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
  storage: {
    local: { get: jest.fn(() => Promise.resolve({})) },
  },
});

/* Let the promise chains started by the module-level ServiceWorker settle */
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

describe('ServiceWorker startup', () => {
  let chromeMock: ReturnType<typeof createChromeMock>;

  beforeEach(async () => {
    /* Fake timers stop a retry loop from running on; setImmediate stays real to flush promises */
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    /* The module instantiates ServiceWorker on import */
    await import('@/pages/ServiceWorker');
    await flushPromises();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('starts theme detection without waiting for a content script', () => {
    expect(chromeMock.offscreen.createDocument).toHaveBeenCalledWith(expect.objectContaining({ url: 'offscreen.html' }));
  });

  it('registers the database cleanup alarm without waiting for a content script', () => {
    expect(chromeMock.alarms.create).toHaveBeenCalledWith('cleanup-db', expect.anything());
  });
});

describe('ServiceWorker tab updates', () => {
  let chromeMock: ReturnType<typeof createChromeMock>;

  /* Replay a finished page load through the listener the service worker registered */
  const loadTab = async (tab: { id: number; windowId: number; url: string }) => {
    chromeMock.tabs.get.mockImplementation(() => Promise.resolve(tab) as any);
    chromeMock.tabs.query.mockImplementation(() => Promise.resolve([tab]) as any);
    const handleTabUpdated = chromeMock.tabs.onUpdated.addListener.mock.calls[0][0] as (
      tabId: number,
      changeInfo: { status: string },
      tab: unknown
    ) => Promise<void>;
    await handleTabUpdated(tab.id, { status: 'complete' }, tab);
    await flushPromises();
  };

  const extractionRequests = () => chromeMock.tabs.sendMessage.mock.calls.filter(([, message]: any[]) => message?.action === 'EXTRACT_ARTICLE');

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    await import('@/pages/ServiceWorker');
    await flushPromises();
    chromeMock.tabs.sendMessage.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('does not ask the content script to extract on the Chrome extension pages', async () => {
    await loadTab(CHROME_OPTIONS_TAB);
    expect(extractionRequests()).toHaveLength(0);
  });

  it('does not ask the content script to extract on the Firefox extension pages', async () => {
    await loadTab(FIREFOX_OPTIONS_TAB);
    expect(extractionRequests()).toHaveLength(0);
  });

  it('asks the content script to extract on an ordinary page', async () => {
    await loadTab(ARTICLE_TAB);
    expect(extractionRequests()).toHaveLength(1);
  });
});
