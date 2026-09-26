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
jest.mock('@/stores/SettingsStore', () => ({ DEFAULT_SETTINGS: { models: {} } }));
/* The service worker reaches the database through this wrapper, which opens IndexedDB on import */
jest.mock('@/db', () => ({
  db: {
    getArticleByUrl: jest.fn(() => Promise.resolve({ id: 'article-id', is_success: true })),
    addArticle: jest.fn(() => Promise.resolve()),
  },
}));
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
    create: jest.fn(() => Promise.resolve(NEW_TAB)),
    update: jest.fn(() => Promise.resolve(NEW_TAB)),
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

describe('ServiceWorker summarizing a mobile YouTube video', () => {
  let chromeMock: Omit<ReturnType<typeof createChromeMock>, 'contextMenus'> & { contextMenus?: unknown; storage: { session?: unknown } };

  const MOBILE_URL = 'https://m.youtube.com/watch?v=arj7oStGLkU';
  const DESKTOP_URL = 'https://www.youtube.com/watch?v=arj7oStGLkU&app=desktop';
  const YOUTUBE_TAB_ID = 5;
  const SETTINGS = { 'free-ai-summarizer-settings': { state: { tabBehavior: 'NEW_TAB', extractionDenylist: '' } } };

  const handleMessage = (message: unknown) => {
    /* The theme service registers its own listener from a class field, so the service worker's is the last one */
    const listener = chromeMock.runtime.onMessage.addListener.mock.calls.at(-1)![0] as (
      message: unknown,
      sender: unknown,
      sendResponse: unknown
    ) => Promise<void>;
    return listener(message, {}, jest.fn());
  };

  const openAIService = async () => {
    await handleMessage({ action: 'OPEN_AI_SERVICE', payload: { service: 'CHATGPT', tabId: YOUTUBE_TAB_ID, tabUrl: MOBILE_URL } });
    await flushPromises();
  };

  /* Replay a finished page load whose extraction ends with the given result */
  const loadTab = async (url: string, isSuccess: boolean) => {
    const tab = { id: YOUTUBE_TAB_ID, windowId: 1, url };
    chromeMock.tabs.get.mockImplementation(() => Promise.resolve(tab) as any);
    chromeMock.tabs.query.mockImplementation(() => Promise.resolve([tab]) as any);
    chromeMock.tabs.sendMessage.mockImplementation(((_: number, message: { action: string }) =>
      Promise.resolve(
        message.action === 'EXTRACT_ARTICLE'
          ? { success: true, payload: { tabId: tab.id, tabUrl: url, result: { isSuccess, url, title: 'title', content: 'content', error: null } } }
          : undefined
      )) as any);
    const handleTabUpdated = chromeMock.tabs.onUpdated.addListener.mock.calls[0][0] as (
      tabId: number,
      changeInfo: { status: string },
      tab: unknown
    ) => Promise<void>;
    await handleTabUpdated(tab.id, { status: 'complete' }, tab);
    for (let i = 0; i < 5; i++) await flushPromises();
  };

  const aiServiceTabs = () => chromeMock.tabs.create.mock.calls.filter(([options]: any[]) => String(options?.url).includes('chatgpt.com'));

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    chromeMock.storage.local.get.mockImplementation(() => Promise.resolve(SETTINGS) as any);
    /* Firefox for Android has no contextMenus API, which also keeps the menu rebuild from waiting on the fake timers */
    delete chromeMock.contextMenus;
    /* An in-memory storage.session, which keeps the pending summary across the page load */
    const session: Record<string, unknown> = {};
    chromeMock.storage.session = {
      get: jest.fn((key: string) => Promise.resolve(key in session ? { [key]: session[key] } : {})),
      set: jest.fn((items: Record<string, unknown>) => Promise.resolve(void Object.assign(session, items))),
      remove: jest.fn((key: string) => Promise.resolve(void delete session[key])),
    };
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    await import('@/pages/ServiceWorker');
    await flushPromises();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('reloads the video in the desktop layout instead of opening the AI service', async () => {
    await openAIService();
    expect(chromeMock.tabs.update).toHaveBeenCalledWith(YOUTUBE_TAB_ID, { url: DESKTOP_URL });
    expect(aiServiceTabs()).toHaveLength(0);
  });

  it('opens the AI service once the transcript is extracted in the desktop layout', async () => {
    await openAIService();
    await loadTab(DESKTOP_URL, true);
    expect(aiServiceTabs()).toHaveLength(1);
  });

  it('opens the AI service only once', async () => {
    await openAIService();
    await loadTab(DESKTOP_URL, true);
    await loadTab(DESKTOP_URL, true);
    expect(aiServiceTabs()).toHaveLength(1);
  });

  it('does not open the AI service when the extraction fails', async () => {
    await openAIService();
    await loadTab(DESKTOP_URL, false);
    await loadTab(DESKTOP_URL, true);
    expect(aiServiceTabs()).toHaveLength(0);
  });

  it('does not open the AI service for another page loaded in the tab', async () => {
    await openAIService();
    await loadTab('https://www.youtube.com/watch?v=dQw4w9WgXcQ', true);
    expect(aiServiceTabs()).toHaveLength(0);
  });
});

describe('ServiceWorker opening an AI service in a private tab', () => {
  let chromeMock: ReturnType<typeof createChromeMock> & { windows?: unknown };

  /* The private tab is the stored behavior in every test here */
  const SETTINGS = { 'free-ai-summarizer-settings': { state: { tabBehavior: 'NEW_PRIVATE_TAB', extractionDenylist: '' } } };

  const openAIService = async () => {
    /* The theme service registers its own listener from a class field, so the service worker's is the last one */
    const handleMessage = chromeMock.runtime.onMessage.addListener.mock.calls.at(-1)![0] as (
      message: unknown,
      sender: unknown,
      sendResponse: unknown
    ) => Promise<void>;
    await handleMessage({ action: 'OPEN_AI_SERVICE', payload: { service: 'CHATGPT', tabId: ARTICLE_TAB.id, tabUrl: ARTICLE_TAB.url } }, {}, jest.fn());
    await flushPromises();
  };

  const startServiceWorker = async (windows?: unknown) => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    chromeMock.storage.local.get.mockImplementation(() => Promise.resolve(SETTINGS) as any);
    if (windows) chromeMock.windows = windows;
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    await import('@/pages/ServiceWorker');
    await flushPromises();
  };

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('opens an ordinary tab where the windows API is missing', async () => {
    await startServiceWorker();
    await openAIService();
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: expect.stringContaining('chatgpt.com') });
  });

  it('opens a private window where the windows API exists', async () => {
    const windows = { getAll: jest.fn(() => Promise.resolve([])), create: jest.fn(() => Promise.resolve({})) };
    await startServiceWorker(windows);
    await openAIService();
    expect(windows.create).toHaveBeenCalledWith({ url: expect.stringContaining('chatgpt.com'), incognito: true });
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });
});
