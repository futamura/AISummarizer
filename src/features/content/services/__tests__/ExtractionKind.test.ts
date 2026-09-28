/* Import the module directly: the services barrel pulls in the extractors (pdfjs-dist, Readability) */
import { EXTRACTION_MESSAGES, getExtractionKind } from '@/features/content/services/ExtractionKind';

describe('getExtractionKind', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'youtube'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    /* Copy reaches the mobile layout; summarize reloads the desktop layout first */
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://example.com/paper.pdf', 'pdf'],
    ['https://x.com/jack/status/20', 'x'],
    ['https://twitter.com/jack/status/20', 'x'],
    ['https://x.com/jack', 'webpage'],
    ['https://en.wikipedia.org/wiki/Newline', 'webpage'],
  ])('%s is %s', (url, kind) => {
    expect(getExtractionKind(url)).toBe(kind);
  });
});

describe('EXTRACTION_MESSAGES', () => {
  it('has the agreed wording', () => {
    expect(EXTRACTION_MESSAGES).toEqual({
      webpage: { progress: 'Extracting article…', failure: "Couldn't extract this article" },
      youtube: { progress: 'Extracting transcript…', failure: "Couldn't get this transcript" },
      pdf: { progress: 'Extracting PDF…', failure: "Couldn't read this PDF" },
      x: { progress: 'Extracting post…', failure: "Couldn't extract this post" },
    });
  });
});
