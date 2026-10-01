/**
 * @jest-environment jsdom
 */
/* Import the module directly: the services barrel pulls in the extractors (pdfjs-dist, Readability) */
import { requestInjectionOnLoad } from '@/features/content/services/InjectionRequest';

const AI_SERVICE_URL = 'https://chatgpt.com/?aismid=article-id';

const setReadyState = (readyState: DocumentReadyState) => Object.defineProperty(document, 'readyState', { value: readyState, configurable: true });

describe('requestInjectionOnLoad', () => {
  let sendMessage: jest.Mock;

  beforeEach(() => {
    sendMessage = jest.fn(() => Promise.resolve(undefined));
    (globalThis as any).chrome = { runtime: { sendMessage } };
    setReadyState('complete');
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it('asks the service worker for the article on a loaded AI service page', () => {
    requestInjectionOnLoad(AI_SERVICE_URL);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ action: 'REQUEST_INJECTION' });
  });

  /* The injectors start from the loaded page, as they do when the service worker sends the article on 'complete' */
  it('waits for the AI service page to load before asking', () => {
    setReadyState('loading');
    requestInjectionOnLoad(AI_SERVICE_URL);
    expect(sendMessage).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));
    window.dispatchEvent(new Event('load'));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('does not ask on a page that is not an AI service', () => {
    requestInjectionOnLoad('https://example.com/article?aismid=article-id');
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
