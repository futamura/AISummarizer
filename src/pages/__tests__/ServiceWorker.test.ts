/*
 * Mock the stores so importing the service worker does not pull in the real
 * zustand persist store (its rehydrate reads chrome.storage on import) or
 * IndexedDB, which does not exist in the node test environment.
 */
jest.mock('@/stores', () => ({
  useArticleStore: { getState: () => ({}) },
  useSettingsStore: { getState: () => ({}) },
}));
jest.mock('@/stores/SettingsStore', () => ({ DEFAULT_SETTINGS: {} }));
/* A recent last-cleanup date makes the initial cleanup skip the database */
jest.mock('@/stores/ArticleStore', () => ({
  useArticleStore: { getState: () => ({ getLastCleanupDate: jest.fn(() => Promise.resolve(new Date())) }) },
}));

const listenerStub = () => ({ addListener: jest.fn(), removeListener: jest.fn() });

/* The active tab is a chrome:// page, where no content script runs */
const NEW_TAB = { id: 1, windowId: 1, url: 'chrome://newtab/' };

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
