import { MENU_ITEMS } from '@/models';
import { AIService, getAIServiceForUrl, getAIServiceFromString } from '@/types';

/*
 * Mock the stores so importing the service worker does not pull in the real
 * zustand persist store (its rehydrate reads chrome.storage on import) or
 * IndexedDB, which does not exist in the node test environment.
 */
jest.mock('@/stores', () => ({
  useSettingsStore: {
    getState: () => ({
      getServiceOnMenu: jest.fn(() => Promise.resolve(true)),
      getClipboardPrompt: jest.fn(() => Promise.resolve('{title}\n{content}')),
      getModelFor: jest.fn(() => Promise.resolve('')),
    }),
  },
}));
jest.mock('@/stores/SettingsStore', () => ({ DEFAULT_SETTINGS: { models: {} } }));
/* The service worker reaches the database through this wrapper, which opens IndexedDB on import; addArticle upserts by URL like the real one */
jest.mock('@/db', () => {
  const articles = new Map<string, any>();
  return {
    db: {
      addArticle: jest.fn(async (article: any) => {
        articles.set('article-id', { ...article, id: 'article-id' });
        return 'article-id';
      }),
      getArticleById: jest.fn(async (id: string) => articles.get(id)),
      getArticleByUrl: jest.fn(async () => undefined),
    },
  };
});
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

/* An ordinary page */
const ARTICLE_TAB = { id: 4, windowId: 1, url: 'https://example.com/article' };

/* An in-memory storage.session, which keeps a pending mobile YouTube summary across the page load */
const createSessionStorage = () => {
  const session: Record<string, unknown> = {};
  return {
    get: jest.fn((key: string) => Promise.resolve(key in session ? { [key]: session[key] } : {})),
    set: jest.fn((items: Record<string, unknown>) => Promise.resolve(void Object.assign(session, items))),
    remove: jest.fn((key: string) => Promise.resolve(void delete session[key])),
  };
};

const createChromeMock = () => ({
  tabs: {
    query: jest.fn(() => Promise.resolve([NEW_TAB])),
    get: jest.fn(() => Promise.resolve(NEW_TAB)),
    create: jest.fn(() => Promise.resolve(NEW_TAB)),
    update: jest.fn(() => Promise.resolve(NEW_TAB)),
    /* No content script answers by default, as on a page open before the extension was installed */
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
    session: createSessionStorage(),
  },
});

type ChromeMock = ReturnType<typeof createChromeMock>;

/* Let the promise chains started by the module-level ServiceWorker settle */
const flushPromises = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => {
  for (let i = 0; i < 5; i++) await flushPromises();
};

/* Make the content script answer EXTRACT_ARTICLE with the given results in turn (the last one repeats), and acknowledge every other message */
const answerExtraction = (chromeMock: Pick<ChromeMock, 'tabs'>, ...results: Array<{ isSuccess: boolean; content?: string }>) => {
  chromeMock.tabs.sendMessage.mockImplementation(((tabId: number, message: { action: string; payload: { tabUrl: string } }) => {
    if (message.action !== 'EXTRACT_ARTICLE') return Promise.resolve({ success: true });
    const { isSuccess, content = 'content' } = results.length > 1 ? results.shift()! : results[0];
    const url = message.payload.tabUrl;
    return Promise.resolve({ success: true, payload: { tabId, tabUrl: url, result: { isSuccess, url, title: 'title', content, error: null } } });
  }) as any);
};

/* The theme service registers its own listener from a class field, so the service worker's is the last one */
const sendToServiceWorker = async (chromeMock: Pick<ChromeMock, 'runtime'>, message: unknown) => {
  const listener = chromeMock.runtime.onMessage.addListener.mock.calls.at(-1)![0] as (
    message: unknown,
    sender: unknown,
    sendResponse: unknown
  ) => Promise<void>;
  await listener(message, {}, jest.fn());
  await settle();
};

/* Replay a finished page load through the listener the service worker registered */
const loadTab = async (chromeMock: Pick<ChromeMock, 'tabs'>, tab: { id: number; windowId: number; url: string }) => {
  chromeMock.tabs.get.mockImplementation(() => Promise.resolve(tab) as any);
  chromeMock.tabs.query.mockImplementation(() => Promise.resolve([tab]) as any);
  const handleTabUpdated = chromeMock.tabs.onUpdated.addListener.mock.calls[0][0] as (
    tabId: number,
    changeInfo: { status: string },
    tab: unknown
  ) => Promise<void>;
  await handleTabUpdated(tab.id, { status: 'complete' }, tab);
  await settle();
};

const extractionRequests = (chromeMock: Pick<ChromeMock, 'tabs'>) =>
  chromeMock.tabs.sendMessage.mock.calls.filter(([, message]: any[]) => message?.action === 'EXTRACT_ARTICLE');

const aiServiceTabs = (chromeMock: Pick<ChromeMock, 'tabs'>) =>
  chromeMock.tabs.create.mock.calls.filter(([options]: any[]) => String(options?.url).includes('chatgpt.com'));

describe('ServiceWorker startup', () => {
  let chromeMock: ChromeMock;

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
  let chromeMock: ChromeMock;

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    await import('@/pages/ServiceWorker');
    await flushPromises();
    answerExtraction(chromeMock, { isSuccess: true });
    chromeMock.tabs.sendMessage.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('does not ask the content script to extract on the Chrome extension pages', async () => {
    await loadTab(chromeMock, CHROME_OPTIONS_TAB);
    expect(extractionRequests(chromeMock)).toHaveLength(0);
  });

  it('does not ask the content script to extract on the Firefox extension pages', async () => {
    await loadTab(chromeMock, FIREFOX_OPTIONS_TAB);
    expect(extractionRequests(chromeMock)).toHaveLength(0);
  });

  it('does not ask the content script to extract when an ordinary page finishes loading', async () => {
    await loadTab(chromeMock, ARTICLE_TAB);
    expect(extractionRequests(chromeMock)).toHaveLength(0);
  });
});

describe('ServiceWorker summarizing a page', () => {
  let chromeMock: ChromeMock;
  let db: { addArticle: jest.Mock; getArticleById: jest.Mock };

  const SETTINGS = { 'free-ai-summarizer-settings': { state: { tabBehavior: 'NEW_TAB' } } };

  const summarize = () =>
    sendToServiceWorker(chromeMock, { action: 'OPEN_AI_SERVICE', payload: { service: 'CHATGPT', tabId: ARTICLE_TAB.id, tabUrl: ARTICLE_TAB.url } });

  const copyToClipboard = () =>
    sendToServiceWorker(chromeMock, { action: 'READ_ARTICLE_FOR_CLIPBOARD', payload: { tabId: ARTICLE_TAB.id, tabUrl: ARTICLE_TAB.url } });

  const clipboardWrites = () => chromeMock.tabs.sendMessage.mock.calls.filter(([, message]: any[]) => message?.action === 'WRITE_ARTICLE_TO_CLIPBOARD');

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    chromeMock.storage.local.get.mockImplementation(() => Promise.resolve(SETTINGS) as any);
    chromeMock.tabs.get.mockImplementation(() => Promise.resolve(ARTICLE_TAB) as any);
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    await import('@/pages/ServiceWorker');
    await flushPromises();
    /* The same module instance the service worker imported, since the registry was reset above */
    db = (await import('@/db')).db as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('extracts the page and opens the AI service with the stored article', async () => {
    answerExtraction(chromeMock, { isSuccess: true });
    await summarize();
    expect(extractionRequests(chromeMock)).toHaveLength(1);
    expect(db.addArticle).toHaveBeenCalledWith(expect.objectContaining({ url: ARTICLE_TAB.url, content: 'content', is_success: true }));
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: expect.stringContaining('article-id') });
  });

  it('does not open the AI service when the extraction fails', async () => {
    answerExtraction(chromeMock, { isSuccess: false });
    await summarize();
    expect(db.addArticle).not.toHaveBeenCalled();
    expect(aiServiceTabs(chromeMock)).toHaveLength(0);
  });

  it('does not open the AI service when the page has no content script', async () => {
    await expect(summarize()).resolves.toBeUndefined();
    expect(aiServiceTabs(chromeMock)).toHaveLength(0);
  });

  /* A page that renders its body after the load event (jp.wsj.com) must not be summarized from a stale extraction */
  it('extracts the page again for every summary', async () => {
    answerExtraction(chromeMock, { isSuccess: true, content: 'Only the copyright notice' }, { isSuccess: true, content: 'The full article' });
    await summarize();
    await summarize();
    expect(extractionRequests(chromeMock)).toHaveLength(2);
    expect(db.addArticle).toHaveBeenLastCalledWith(expect.objectContaining({ content: 'The full article' }));
  });

  it('extracts the page and writes it to the clipboard', async () => {
    answerExtraction(chromeMock, { isSuccess: true, content: 'The full article' });
    await copyToClipboard();
    expect(extractionRequests(chromeMock)).toHaveLength(1);
    expect(clipboardWrites()).toHaveLength(1);
    expect((clipboardWrites()[0] as any[])[1].payload.text).toBe('title\nThe full article');
  });

  it('does not write to the clipboard when the extraction fails', async () => {
    answerExtraction(chromeMock, { isSuccess: false });
    await copyToClipboard();
    expect(clipboardWrites()).toHaveLength(0);
  });

  /* Firefox resolves the popup's sendMessage only when the listener's promise settles, and the popup closes after it */
  it('answers the clipboard message without waiting for the extraction', async () => {
    chromeMock.tabs.sendMessage.mockImplementation((() => new Promise(() => undefined)) as any);
    const listener = chromeMock.runtime.onMessage.addListener.mock.calls.at(-1)![0] as (
      message: unknown,
      sender: unknown,
      sendResponse: unknown
    ) => Promise<void>;
    let isAnswered = false;
    listener({ action: 'READ_ARTICLE_FOR_CLIPBOARD', payload: { tabId: ARTICLE_TAB.id, tabUrl: ARTICLE_TAB.url } }, {}, jest.fn()).then(() => {
      isAnswered = true;
    });
    await settle();
    expect(isAnswered).toBe(true);
  });
});

describe('ServiceWorker summarizing a mobile YouTube video', () => {
  let chromeMock: Omit<ChromeMock, 'contextMenus'> & { contextMenus?: unknown };

  const MOBILE_URL = 'https://m.youtube.com/watch?v=arj7oStGLkU';
  const DESKTOP_URL = 'https://www.youtube.com/watch?v=arj7oStGLkU&app=desktop';
  const YOUTUBE_TAB_ID = 5;
  const SETTINGS = { 'free-ai-summarizer-settings': { state: { tabBehavior: 'NEW_TAB' } } };

  const openAIService = () =>
    sendToServiceWorker(chromeMock, { action: 'OPEN_AI_SERVICE', payload: { service: 'CHATGPT', tabId: YOUTUBE_TAB_ID, tabUrl: MOBILE_URL } });

  /* Replay a finished page load in the YouTube tab, whose extraction ends with the given result */
  const loadYoutubeTab = async (url: string, isSuccess: boolean) => {
    answerExtraction(chromeMock, { isSuccess });
    await loadTab(chromeMock, { id: YOUTUBE_TAB_ID, windowId: 1, url });
  };

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    chromeMock.storage.local.get.mockImplementation(() => Promise.resolve(SETTINGS) as any);
    /* Firefox for Android has no contextMenus API, which also keeps the menu rebuild from waiting on the fake timers */
    delete chromeMock.contextMenus;
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
    expect(extractionRequests(chromeMock)).toHaveLength(0);
    expect(aiServiceTabs(chromeMock)).toHaveLength(0);
  });

  it('opens the AI service once the transcript is extracted in the desktop layout', async () => {
    await openAIService();
    await loadYoutubeTab(DESKTOP_URL, true);
    expect(aiServiceTabs(chromeMock)).toHaveLength(1);
  });

  it('opens the AI service only once', async () => {
    await openAIService();
    await loadYoutubeTab(DESKTOP_URL, true);
    await loadYoutubeTab(DESKTOP_URL, true);
    expect(aiServiceTabs(chromeMock)).toHaveLength(1);
  });

  it('does not open the AI service when the extraction fails', async () => {
    await openAIService();
    await loadYoutubeTab(DESKTOP_URL, false);
    await loadYoutubeTab(DESKTOP_URL, true);
    expect(aiServiceTabs(chromeMock)).toHaveLength(0);
  });

  it('does not open the AI service for another page loaded in the tab', async () => {
    await openAIService();
    await loadYoutubeTab('https://www.youtube.com/watch?v=dQw4w9WgXcQ', true);
    expect(aiServiceTabs(chromeMock)).toHaveLength(0);
  });
});

describe('ServiceWorker opening an AI service in a private tab', () => {
  let chromeMock: ChromeMock & { windows?: unknown };

  /* The private tab is the stored behavior in every test here */
  const SETTINGS = { 'free-ai-summarizer-settings': { state: { tabBehavior: 'NEW_PRIVATE_TAB' } } };

  const openAIService = () =>
    sendToServiceWorker(chromeMock, { action: 'OPEN_AI_SERVICE', payload: { service: 'CHATGPT', tabId: ARTICLE_TAB.id, tabUrl: ARTICLE_TAB.url } });

  const startServiceWorker = async (windows?: unknown) => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    chromeMock.storage.local.get.mockImplementation(() => Promise.resolve(SETTINGS) as any);
    chromeMock.tabs.get.mockImplementation(() => Promise.resolve(ARTICLE_TAB) as any);
    if (windows) chromeMock.windows = windows;
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    await import('@/pages/ServiceWorker');
    await flushPromises();
    answerExtraction(chromeMock, { isSuccess: true });
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

describe('ServiceWorker context menu', () => {
  let chromeMock: ChromeMock;

  const SETTINGS = { 'free-ai-summarizer-settings': { state: { tabBehavior: 'NEW_TAB' } } };

  /* Click a menu item on the article tab through the listener the service worker registered */
  const clickMenuItem = async (menuItemId: string) => {
    const handleContextMenuClicked = chromeMock.contextMenus.onClicked.addListener.mock.calls[0][0] as (
      info: { menuItemId: string },
      tab: unknown
    ) => Promise<void>;
    await handleContextMenuClicked({ menuItemId }, ARTICLE_TAB);
    await settle();
  };

  const openedServices = () => chromeMock.tabs.create.mock.calls.map(([options]: any[]) => getAIServiceForUrl(String(options?.url)));

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    chromeMock = createChromeMock();
    chromeMock.storage.local.get.mockImplementation(() => Promise.resolve(SETTINGS) as any);
    chromeMock.tabs.get.mockImplementation(() => Promise.resolve(ARTICLE_TAB) as any);
    (globalThis as any).chrome = chromeMock;
    jest.resetModules();

    await import('@/pages/ServiceWorker');
    await flushPromises();
    answerExtraction(chromeMock, { isSuccess: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).chrome;
  });

  it('offers every AI service', () => {
    expect(MENU_ITEMS.AI_SERVICES.map(item => getAIServiceFromString(item.id))).toEqual(Object.values(AIService));
  });

  it.each(MENU_ITEMS.AI_SERVICES.map(item => item.id))('opens the AI service of the %s menu item', async menuItemId => {
    await clickMenuItem(menuItemId);
    expect(openedServices()).toEqual([getAIServiceFromString(menuItemId)]);
  });

  it('opens AI Studio with the free Flash model for the Default choice', async () => {
    await clickMenuItem('aistudio');
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({ url: expect.stringContaining('&model=gemini-flash-latest') });
  });

  it('writes the article to the clipboard from the copy menu item', async () => {
    await clickMenuItem(MENU_ITEMS.COPY.id);
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(ARTICLE_TAB.id, expect.objectContaining({ action: 'WRITE_ARTICLE_TO_CLIPBOARD' }));
    expect(chromeMock.tabs.create).not.toHaveBeenCalled();
  });
});
