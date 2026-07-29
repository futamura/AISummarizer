import { formatTime, groupTranscriptSegments, parseTimestamp } from '../Youtube';

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
