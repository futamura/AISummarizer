import clsx from 'clsx';

import React, { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { IoCheckmarkCircle, IoCloseCircle, IoInformationCircle, IoWarning } from 'react-icons/io5';

import { computeToastOffsets, ToastItem, ToastOptions, ToastQueue, ToastType } from '@/features/content/services/ToastQueue';

export type { ToastOptions, ToastType };

/* One queue per extension context: the content script of a page, or the options page */
const toastQueue = new ToastQueue();

export const toast = {
  success: (message: string, options?: ToastOptions) => toastQueue.show('success', message, options),
  error: (message: string, options?: ToastOptions) => toastQueue.show('error', message, options),
  info: (message: string, options?: ToastOptions) => toastQueue.show('info', message, options),
  warning: (message: string, options?: ToastOptions) => toastQueue.show('warning', message, options),
  loading: (message: string, options?: ToastOptions) => toastQueue.show('loading', message, options),
  dismiss: (id: string) => toastQueue.dismiss(id),
};

/* sonner richColors; sizes in px so that neither the page root font size nor the 12px Chromium injects into extension pages scales them */
const TYPE_CLASSES: Record<ToastType, string> = {
  success:
    'bg-[hsl(143,85%,96%)] border-[hsl(145,92%,87%)] text-[hsl(140,100%,27%)] dark:bg-[hsl(150,100%,6%)] dark:border-[hsl(147,100%,12%)] dark:text-[hsl(150,86%,65%)]',
  info: 'bg-[hsl(208,100%,97%)] border-[hsl(221,91%,93%)] text-[hsl(210,92%,45%)] dark:bg-[hsl(215,100%,6%)] dark:border-[hsl(223,43%,17%)] dark:text-[hsl(216,87%,65%)]',
  loading:
    'bg-[hsl(208,100%,97%)] border-[hsl(221,91%,93%)] text-[hsl(210,92%,45%)] dark:bg-[hsl(215,100%,6%)] dark:border-[hsl(223,43%,17%)] dark:text-[hsl(216,87%,65%)]',
  warning:
    'bg-[hsl(49,100%,97%)] border-[hsl(49,91%,84%)] text-[hsl(31,92%,45%)] dark:bg-[hsl(64,100%,6%)] dark:border-[hsl(60,100%,9%)] dark:text-[hsl(46,87%,65%)]',
  error:
    'bg-[hsl(359,100%,97%)] border-[hsl(359,100%,94%)] text-[hsl(360,100%,45%)] dark:bg-[hsl(358,76%,10%)] dark:border-[hsl(357,89%,16%)] dark:text-[hsl(358,100%,81%)]',
};

const ToastIcon: React.FC<{ type: ToastType }> = ({ type }) => {
  switch (type) {
    case 'success':
      return <IoCheckmarkCircle className="w-[20px] h-[20px]" />;
    case 'error':
      return <IoCloseCircle className="w-[20px] h-[20px]" />;
    case 'info':
      return <IoInformationCircle className="w-[20px] h-[20px]" />;
    case 'warning':
      return <IoWarning className="w-[20px] h-[20px]" />;
    case 'loading':
      return <span className="block w-[16px] h-[16px] rounded-full border-[2px] border-solid border-current border-r-transparent opacity-60 animate-spin" />;
  }
};

interface ToastCardProps {
  item: ToastItem;
  offset: number;
  onMeasure: (id: string, height: number) => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ item, offset, onMeasure }) => {
  const ref = useRef<HTMLDivElement>(null);

  /* The text never changes, so one measurement before the first paint is enough */
  useLayoutEffect(() => {
    if (ref.current) onMeasure(item.id, ref.current.offsetHeight);
  }, [item.id, onMeasure]);

  return (
    <div
      className="absolute inset-x-0 top-0 transition-transform duration-[400ms] ease-out motion-reduce:transition-none"
      style={{ transform: `translateY(${offset}px)` }}
    >
      <div
        ref={ref}
        role={item.type === 'error' ? 'alert' : 'status'}
        className={clsx(
          'relative flex items-center gap-[10px] box-border w-full p-[18px] rounded-[8px] border border-solid',
          'shadow-[0_4px_12px_rgba(0,0,0,0.1)] text-[15px] font-medium leading-[1.5] font-[system-ui,-apple-system,sans-serif] break-words',
          'pointer-events-auto transition-[opacity,transform] duration-[400ms] motion-reduce:transition-none motion-reduce:animate-none',
          TYPE_CLASSES[item.type],
          item.phase === 'exiting' ? 'opacity-0 translate-y-[14px] scale-[0.96]' : 'opacity-100 animate-toast-enter'
        )}
      >
        {item.type === 'error' && (
          <button
            type="button"
            aria-label="Close"
            onClick={() => toast.dismiss(item.id)}
            className={clsx(
              'absolute -left-[7px] -top-[7px] flex items-center justify-center w-[20px] h-[20px] p-0 rounded-full border border-solid cursor-pointer',
              TYPE_CLASSES[item.type]
            )}
          >
            {/* The thin stroked cross of sonner; the filled IoClose looked heavier and pushed out of the button */}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
        <span className="flex items-center justify-center shrink-0 w-[20px] h-[20px]">
          <ToastIcon type={item.type} />
        </span>
        <span>{item.message}</span>
      </div>
    </div>
  );
};

export const Toaster: React.FC = () => {
  const toasts = useSyncExternalStore(toastQueue.subscribe, toastQueue.getToasts);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const previousOffsets = useRef<Record<string, number>>({});

  const handleMeasure = useCallback((id: string, height: number) => {
    setHeights(prev => (prev[id] === height ? prev : { ...prev, [id]: height }));
  }, []);

  const offsets = computeToastOffsets(toasts, heights, previousOffsets.current);
  previousOffsets.current = offsets;

  return (
    <div aria-live="polite" className="fixed top-[24px] left-1/2 -translate-x-1/2 w-[356px] max-w-[calc(100vw-32px)] z-[777777777777] pointer-events-none">
      {toasts.map(item => (
        <ToastCard key={item.id} item={item} offset={offsets[item.id] ?? 0} onMeasure={handleMeasure} />
      ))}
    </div>
  );
};
