/* Import the module directly: the services barrel pulls in the extractors (pdfjs-dist, Readability) */
import {
  computeToastOffsets,
  MAX_VISIBLE_TOASTS,
  MIN_GROUP_DISPLAY_MS,
  TIMED_TOAST_MS,
  TOAST_ANIMATION_MS,
  TOAST_GAP_PX,
  ToastItem,
  ToastQueue,
} from '@/features/content/services/ToastQueue';

/* The toasts on screen as "message:phase", newest first */
const screen = (queue: ToastQueue) => queue.getToasts().map(item => `${item.message}:${item.phase}`);

describe('ToastQueue', () => {
  let queue: ToastQueue;

  beforeEach(() => {
    jest.useFakeTimers();
    queue = new ToastQueue();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('enters a toast and settles it after the animation', () => {
    queue.show('info', 'Hello');
    expect(screen(queue)).toEqual(['Hello:entering']);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual(['Hello:visible']);
  });

  it('times out a success toast 3 s after it became visible, then removes it', () => {
    queue.show('success', 'Done');

    jest.advanceTimersByTime(TOAST_ANIMATION_MS + TIMED_TOAST_MS - 1);
    expect(screen(queue)).toEqual(['Done:visible']);

    jest.advanceTimersByTime(1);
    expect(screen(queue)).toEqual(['Done:exiting']);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual([]);
  });

  it.each(['info', 'warning'] as const)('times out a %s toast', type => {
    queue.show(type, 'Note');
    jest.advanceTimersByTime(TOAST_ANIMATION_MS + TIMED_TOAST_MS + TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual([]);
  });

  it.each(['error', 'loading'] as const)('keeps a %s toast until it is dismissed', type => {
    const id = queue.show(type, 'Stay');

    jest.advanceTimersByTime(60000);
    expect(screen(queue)).toEqual(['Stay:visible']);

    queue.dismiss(id);
    expect(screen(queue)).toEqual(['Stay:exiting']);
    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual([]);
  });

  it('stacks toasts without a group, newest first', () => {
    queue.show('error', 'First');
    queue.show('error', 'Second');
    expect(screen(queue)).toEqual(['Second:entering', 'First:entering']);
  });

  it('keeps at most three toasts without a group on screen', () => {
    queue.show('error', 'One');
    queue.show('error', 'Two');
    queue.show('error', 'Three');
    jest.advanceTimersByTime(TOAST_ANIMATION_MS);

    queue.show('error', 'Four');
    expect(screen(queue)).toEqual(['Four:entering', 'Three:visible', 'Two:visible', 'One:exiting']);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual(['Four:visible', 'Three:visible', 'Two:visible']);
    expect(MAX_VISIBLE_TOASTS).toBe(3);
  });

  it('holds the next toast of a group until the current one has been shown for 600 ms', () => {
    queue.show('loading', 'Pasting', { group: 'inject' });
    queue.show('loading', 'Sending', { group: 'inject' });
    expect(screen(queue)).toEqual(['Pasting:entering']);

    jest.advanceTimersByTime(MIN_GROUP_DISPLAY_MS - 1);
    expect(screen(queue)).toEqual(['Pasting:visible']);

    jest.advanceTimersByTime(1);
    expect(screen(queue)).toEqual(['Sending:entering', 'Pasting:exiting']);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(screen(queue)).toEqual(['Sending:visible']);
  });

  it('plays several queued toasts of a group one after another', () => {
    queue.show('loading', 'Selecting', { group: 'inject' });
    queue.show('loading', 'Pasting', { group: 'inject' });
    queue.show('loading', 'Sending', { group: 'inject' });
    queue.show('success', 'Sent', { group: 'inject' });

    const front = () => screen(queue)[0];
    expect(front()).toBe('Selecting:entering');
    jest.advanceTimersByTime(MIN_GROUP_DISPLAY_MS);
    expect(front()).toBe('Pasting:entering');
    jest.advanceTimersByTime(MIN_GROUP_DISPLAY_MS);
    expect(front()).toBe('Sending:entering');
    jest.advanceTimersByTime(MIN_GROUP_DISPLAY_MS);
    expect(front()).toBe('Sent:entering');
  });

  it('enters a group toast at once when the current one has been shown long enough', () => {
    queue.show('loading', 'Pasting', { group: 'inject' });
    jest.advanceTimersByTime(1000);

    queue.show('loading', 'Sending', { group: 'inject' });
    expect(screen(queue)).toEqual(['Sending:entering', 'Pasting:exiting']);
  });

  it('keeps groups independent of each other and of ungrouped toasts', () => {
    queue.show('loading', 'Extracting', { group: 'extract' });
    queue.show('loading', 'Pasting', { group: 'inject' });
    queue.show('success', 'Copied');
    expect(screen(queue)).toEqual(['Copied:entering', 'Pasting:entering', 'Extracting:entering']);
  });

  it('drops a queued toast that is dismissed before it enters', () => {
    queue.show('loading', 'Pasting', { group: 'inject' });
    const queued = queue.show('loading', 'Sending', { group: 'inject' });

    queue.dismiss(queued);
    jest.advanceTimersByTime(5000);
    expect(screen(queue)).toEqual(['Pasting:visible']);
  });

  it('lets a toast dismissed while entering finish its enter animation before it exits', () => {
    const id = queue.show('loading', 'Extracting');
    jest.advanceTimersByTime(100);

    queue.dismiss(id);
    expect(screen(queue)).toEqual(['Extracting:entering']);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS - 100);
    expect(screen(queue)).toEqual(['Extracting:exiting']);
  });

  it('still shows the failure when the progress toast is dismissed during its fade-in', () => {
    const progress = queue.show('loading', 'Extracting', { group: 'extract' });
    jest.advanceTimersByTime(10);
    queue.dismiss(progress);
    queue.show('error', 'Failed', { group: 'extract' });

    jest.advanceTimersByTime(MIN_GROUP_DISPLAY_MS + TOAST_ANIMATION_MS * 2);
    expect(screen(queue)).toEqual(['Failed:visible']);
  });

  it('enters the next toast of a group at once when the current one is closed', () => {
    const current = queue.show('error', 'Failed', { group: 'inject' });
    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    queue.show('loading', 'Pasting', { group: 'inject' });

    queue.dismiss(current);
    jest.advanceTimersByTime(0);
    expect(screen(queue)).toEqual(['Pasting:entering', 'Failed:exiting']);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = queue.subscribe(listener);

    queue.show('info', 'Hello');
    expect(listener).toHaveBeenCalled();

    listener.mockClear();
    unsubscribe();
    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns the same snapshot until something changes', () => {
    queue.show('info', 'Hello');
    const snapshot = queue.getToasts();
    expect(queue.getToasts()).toBe(snapshot);

    jest.advanceTimersByTime(TOAST_ANIMATION_MS);
    expect(queue.getToasts()).not.toBe(snapshot);
  });
});

describe('computeToastOffsets', () => {
  const item = (id: string, phase: ToastItem['phase']): ToastItem => ({ id, type: 'info', message: id, phase });

  it('stacks the toasts by their heights plus the gap', () => {
    const offsets = computeToastOffsets([item('c', 'visible'), item('b', 'visible'), item('a', 'visible')], { a: 50, b: 60, c: 70 }, {});
    expect(offsets).toEqual({ c: 0, b: 70 + TOAST_GAP_PX, a: 70 + 60 + TOAST_GAP_PX * 2 });
  });

  it('leaves an exiting toast where it was and closes the gap behind it', () => {
    const offsets = computeToastOffsets([item('c', 'entering'), item('b', 'exiting'), item('a', 'visible')], { a: 50, b: 60, c: 70 }, { b: 0 });
    expect(offsets).toEqual({ c: 0, b: 0, a: 70 + TOAST_GAP_PX });
  });

  it('treats a toast not measured yet as zero high', () => {
    expect(computeToastOffsets([item('b', 'entering'), item('a', 'visible')], { a: 50 }, {})).toEqual({ b: 0, a: TOAST_GAP_PX });
  });
});
