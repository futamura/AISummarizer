import { chromePlatform } from '@/platform/chrome';

describe('chromePlatform', () => {
  let chromeMock: any;

  beforeEach(() => {
    chromeMock = {
      sidePanel: {
        setOptions: jest.fn(() => Promise.resolve()),
        open: jest.fn(() => Promise.resolve()),
      },
      tabs: {
        query: jest.fn(() => Promise.resolve([{ id: 1, windowId: 42 }])),
      },
      offscreen: {
        hasDocument: jest.fn(() => Promise.resolve(false)),
        closeDocument: jest.fn(() => Promise.resolve()),
        createDocument: jest.fn(() => Promise.resolve()),
      },
    };
    (globalThis as any).chrome = chromeMock;
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it('opens the side panel synchronously when a window id is given', () => {
    const promise = chromePlatform.openSettingsPanel(7);
    /* Context menu callers rely on this staying synchronous to keep the user gesture */
    expect(chromeMock.sidePanel.setOptions).toHaveBeenCalledWith({ path: 'options.html', enabled: true });
    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
    expect(chromeMock.tabs.query).not.toHaveBeenCalled();
    return promise;
  });

  it('resolves the active window when no window id is given', async () => {
    await chromePlatform.openSettingsPanel();
    expect(chromeMock.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(chromeMock.sidePanel.setOptions).toHaveBeenCalledWith({ path: 'options.html', enabled: true });
    expect(chromeMock.sidePanel.open).toHaveBeenCalledWith({ windowId: 42 });
  });

  it('does nothing when no active window is found', async () => {
    chromeMock.tabs.query.mockResolvedValueOnce([]);
    await chromePlatform.openSettingsPanel();
    expect(chromeMock.sidePanel.open).not.toHaveBeenCalled();
  });

  it('disables the side panel on close', async () => {
    await chromePlatform.closeSettingsPanel();
    expect(chromeMock.sidePanel.setOptions).toHaveBeenCalledWith({ enabled: false });
  });

  it('recreates the offscreen document for theme detection', async () => {
    chromeMock.offscreen.hasDocument.mockResolvedValueOnce(true);
    await chromePlatform.initThemeDetection(jest.fn());
    expect(chromeMock.offscreen.closeDocument).toHaveBeenCalledTimes(1);
    expect(chromeMock.offscreen.createDocument).toHaveBeenCalledWith({
      url: 'offscreen.html',
      reasons: ['MATCH_MEDIA'],
      justification: 'Detect system color scheme changes',
    });
  });

  it('creates the offscreen document without closing when none exists', async () => {
    await chromePlatform.initThemeDetection(jest.fn());
    expect(chromeMock.offscreen.closeDocument).not.toHaveBeenCalled();
    expect(chromeMock.offscreen.createDocument).toHaveBeenCalledTimes(1);
  });

  /* Blink turns each line feed into a paragraph break itself, and insertHTML takes far longer on long articles */
  it('types the text through insertText', () => {
    const execCommand = jest.fn(() => true);
    (globalThis as any).document = { execCommand };

    chromePlatform.insertEditorText('First\nSecond');

    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'First\nSecond');
    delete (globalThis as any).document;
  });
});
