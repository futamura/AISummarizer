/**
 * @jest-environment jsdom
 */
import { loadFixture } from '@/features/content/__fixtures__';

import { extractYoutube, formatTime, groupTranscriptSegments, parseTimestamp } from '../Youtube';

describe('parseTimestamp', () => {
  it('parses MM:SS format', () => {
    expect(parseTimestamp('0:01')).toBe(1);
    expect(parseTimestamp('1:30')).toBe(90);
    expect(parseTimestamp('59:59')).toBe(3599);
  });

  it('parses HH:MM:SS format', () => {
    expect(parseTimestamp('1:00:00')).toBe(3600);
    expect(parseTimestamp('4:26:44')).toBe(16004);
  });

  it('returns 0 for invalid input', () => {
    expect(parseTimestamp('')).toBe(0);
    expect(parseTimestamp('invalid')).toBe(0);
  });
});

describe('formatTime', () => {
  it('formats seconds under an hour as MM:SS', () => {
    expect(formatTime(1)).toBe('0:01');
    expect(formatTime(90)).toBe('1:30');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('formats seconds over an hour as HH:MM:SS', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(16004)).toBe('4:26:44');
  });
});

describe('groupTranscriptSegments', () => {
  it('groups segments into 60 second intervals', () => {
    const segments = [
      { start: 0, text: 'a' },
      { start: 30, text: 'b' },
      { start: 59, text: 'c' },
      { start: 60, text: 'd' },
      { start: 125, text: 'e' },
    ];
    const groups = groupTranscriptSegments(segments);
    expect(groups).toEqual([
      { start: 0, texts: ['a', 'b', 'c'] },
      { start: 60, texts: ['d'] },
      { start: 125, texts: ['e'] },
    ]);
  });

  it('returns an empty array for no segments', () => {
    expect(groupTranscriptSegments([])).toEqual([]);
  });
});

describe('extractYoutube on a captured watch page', () => {
  const run = async () => {
    const result = extractYoutube(meta.source);
    await jest.runAllTimersAsync();
    return result;
  };

  let meta: ReturnType<typeof loadFixture>;

  beforeEach(() => {
    jest.useFakeTimers();
    /* Captured with the transcript panel open, so the button click is a no-op in jsdom */
    meta = loadFixture('youtube-watch');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('extracts the title and the transcript grouped by minute with timestamp links', async () => {
    const result = await run();

    expect(result.isSuccess).toBe(true);
    expect(result.title).toBe('Me at the zoo');
    expect(result.content).toBe(
      '[0:01](https://youtu.be/jNQXAC9IVRw?t=1s) All right, so here we are, in front of the elephants the cool thing about these guys is that they have really... ' +
        "really really long trunks and that's cool (baaaaaaaaaaahhh!!) and that's pretty much all there is to say"
    );
  });

  it('hides the transcript panel after extraction', async () => {
    await run();

    const panel = document.querySelector('transcript-segment-view-model')?.closest('ytd-engagement-panel-section-list-renderer');
    expect(panel?.getAttribute('visibility')).toBe('ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
  });

  it('fails when the transcript button is missing', async () => {
    document.querySelector('ytd-video-description-transcript-section-renderer')?.remove();

    const result = await run();

    expect(result.isSuccess).toBe(false);
    expect(result.error?.message).toBe('Transcript button not found');
  });

  it('fails when no transcript segment is rendered', async () => {
    document.querySelectorAll('transcript-segment-view-model').forEach(segment => segment.remove());

    const result = await run();

    expect(result.isSuccess).toBe(false);
    expect(result.error?.message).toBe('Transcript segments not found');
  });
});
