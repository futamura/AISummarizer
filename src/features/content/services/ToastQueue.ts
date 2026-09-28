export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';

/* entering: the enter animation runs; visible: at rest; exiting: the exit animation runs, then the toast is removed */
export type ToastPhase = 'entering' | 'visible' | 'exiting';

export interface ToastOptions {
  /* Toasts of one group replace each other, and each stays at least MIN_GROUP_DISPLAY_MS */
  group?: string;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  group?: string;
  phase: ToastPhase;
}

export const TOAST_ANIMATION_MS = 400;
/* Long enough to read a stage even when the work behind it finishes at once */
export const MIN_GROUP_DISPLAY_MS = 600;
export const TIMED_TOAST_MS = 3000;
export const MAX_VISIBLE_TOASTS = 3;
export const TOAST_GAP_PX = 14;

/* loading waits for the next stage and error for the user, so neither times out */
const TIMED_TYPES: ReadonlySet<ToastType> = new Set<ToastType>(['success', 'info', 'warning']);

/**
 * The toasts on screen and the ones waiting for their group, without React,
 * so that the timing can be tested with fake timers
 */
export class ToastQueue {
  /* Newest first; replaced on every change so that it can serve as a useSyncExternalStore snapshot */
  private toasts: ToastItem[] = [];
  private readonly pending = new Map<string, ToastItem[]>();
  private readonly groupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly enteredAt = new Map<string, number>();
  private readonly exitAfterEnter = new Set<string>();
  private readonly listeners = new Set<() => void>();
  /* A counter rather than crypto.randomUUID(), which is missing on non-secure (http) pages */
  private lastId = 0;

  getToasts = (): ToastItem[] => this.toasts;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Show a toast, or queue it behind the current toast of its group
   * @param type - The kind of toast
   * @param message - The text to show
   * @param options - The group to show it in
   * @returns The id to pass to dismiss()
   */
  show(type: ToastType, message: string, options: ToastOptions = {}): string {
    const item: ToastItem = { id: String(++this.lastId), type, message, group: options.group, phase: 'entering' };
    if (item.group === undefined) {
      this.enter(item);
      return item.id;
    }

    const queue = this.pending.get(item.group) ?? [];
    if (queue.length === 0 && this.remainingGroupWait(item.group) === 0) {
      this.enter(item);
      return item.id;
    }
    queue.push(item);
    this.pending.set(item.group, queue);
    this.scheduleGroup(item.group);
    return item.id;
  }

  /**
   * Remove a toast: a queued one is dropped, one on screen fades out
   * @param id - The id show() returned
   */
  dismiss(id: string): void {
    for (const [group, queue] of this.pending) {
      const index = queue.findIndex(item => item.id === id);
      if (index < 0) continue;
      queue.splice(index, 1);
      if (queue.length === 0) this.pending.delete(group);
      return;
    }

    const item = this.toasts.find(toast => toast.id === id);
    this.exit(id);
    /* The next toast of the group need not wait out the rest of the minimum display */
    if (item?.group !== undefined && this.pending.has(item.group) && !this.exitAfterEnter.has(id)) {
      this.rescheduleGroup(item.group);
    }
  }

  /* How long the current toast of a group still has to stay before the next one may enter */
  private remainingGroupWait(group: string): number {
    const current = this.toasts.find(item => item.group === group && item.phase !== 'exiting');
    if (!current) return 0;
    return Math.max(0, MIN_GROUP_DISPLAY_MS - (Date.now() - (this.enteredAt.get(current.id) ?? 0)));
  }

  private scheduleGroup(group: string): void {
    if (this.groupTimers.has(group)) return;
    const timer = setTimeout(() => {
      this.groupTimers.delete(group);
      const queue = this.pending.get(group);
      const next = queue?.shift();
      if (queue && queue.length === 0) this.pending.delete(group);
      if (next) this.enter(next);
      if (this.pending.has(group)) this.scheduleGroup(group);
    }, this.remainingGroupWait(group));
    this.groupTimers.set(group, timer);
  }

  private rescheduleGroup(group: string): void {
    const timer = this.groupTimers.get(group);
    if (timer !== undefined) clearTimeout(timer);
    this.groupTimers.delete(group);
    this.scheduleGroup(group);
  }

  private enter(item: ToastItem): void {
    if (item.group !== undefined) {
      const previous = this.toasts.find(toast => toast.group === item.group && toast.phase !== 'exiting');
      if (previous) this.exit(previous.id);
    }

    this.toasts = [item, ...this.toasts];
    this.enteredAt.set(item.id, Date.now());
    this.toasts
      .filter(toast => toast.phase !== 'exiting')
      .slice(MAX_VISIBLE_TOASTS)
      .forEach(toast => this.exit(toast.id));
    this.emit();

    setTimeout(() => this.settle(item.id), TOAST_ANIMATION_MS);
  }

  /* End of the enter animation: run a dismiss that came in meanwhile, or start the timeout */
  private settle(id: string): void {
    const item = this.toasts.find(toast => toast.id === id);
    if (!item || item.phase !== 'entering') return;
    this.setPhase(id, 'visible');

    if (this.exitAfterEnter.delete(id)) {
      this.exit(id);
      if (item.group !== undefined && this.pending.has(item.group)) this.rescheduleGroup(item.group);
      return;
    }
    if (TIMED_TYPES.has(item.type)) setTimeout(() => this.exit(id), TIMED_TOAST_MS);
  }

  private exit(id: string): void {
    const item = this.toasts.find(toast => toast.id === id);
    if (!item || item.phase === 'exiting') return;
    /* Cutting the enter animation short made the toast vanish without fading */
    if (item.phase === 'entering') {
      this.exitAfterEnter.add(id);
      return;
    }

    this.setPhase(id, 'exiting');
    setTimeout(() => {
      this.toasts = this.toasts.filter(toast => toast.id !== id);
      this.enteredAt.delete(id);
      this.emit();
    }, TOAST_ANIMATION_MS);
  }

  private setPhase(id: string, phase: ToastPhase): void {
    this.toasts = this.toasts.map(toast => (toast.id === id ? { ...toast, phase } : toast));
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach(listener => listener());
  }
}

/**
 * Where each toast sits below the top of the stack
 * @param toasts - The toasts on screen, newest first
 * @param heights - The measured height of each toast
 * @param previous - The offsets of the last render, which exiting toasts keep
 * @returns The offset in px of each toast
 */
export function computeToastOffsets(toasts: ToastItem[], heights: Record<string, number>, previous: Record<string, number>): Record<string, number> {
  const offsets: Record<string, number> = {};
  let offset = 0;
  for (const item of toasts) {
    if (item.phase === 'exiting') {
      offsets[item.id] = previous[item.id] ?? offset;
      continue;
    }
    offsets[item.id] = offset;
    offset += (heights[item.id] ?? 0) + TOAST_GAP_PX;
  }
  return offsets;
}
