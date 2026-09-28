/**
 * @jest-environment jsdom
 */
/* Import the module directly: the services barrel pulls in the extractors (pdfjs-dist, Readability) */
import { appendContentStyles } from '@/features/content/services/ContentStyles';

describe('appendContentStyles', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('puts the styles into a closed shadow root, which getElementById(...).shadowRoot cannot reach', () => {
    /* Production builds attach the root closed */
    const host = document.createElement('div');
    host.id = 'free-ai-summarizer-root';
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'closed' });
    shadowRoot.appendChild(document.createElement('div'));
    expect(document.getElementById('free-ai-summarizer-root')?.shadowRoot).toBeNull();

    appendContentStyles(shadowRoot, '.fixed{position:fixed}');

    const style = shadowRoot.firstElementChild;
    expect(style?.tagName).toBe('STYLE');
    expect(style?.textContent).toContain('.fixed{position:fixed}');
    expect(style?.textContent).toContain(':host');
  });
});
