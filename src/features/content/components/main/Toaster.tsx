import clsx from 'clsx';

import React, { useEffect, useState } from 'react';

import { IoCheckmarkCircle, IoCloseCircle, IoInformationCircle, IoWarning } from 'react-icons/io5';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  visible: boolean;
}

interface ToasterProps {
  position?: 'top-center' | 'top-left' | 'top-right' | 'bottom-center' | 'bottom-left' | 'bottom-right';
  duration?: number;
}

export interface ToastOptions {
  /* Keep the toast until toast.dismiss() is called with the id it returned */
  persistent?: boolean;
}

interface ToastEventDetail {
  id: string;
  type: ToastType;
  message: string;
  persistent: boolean;
}

/* A counter rather than crypto.randomUUID(), which is missing on non-secure (http) pages */
let lastToastId = 0;

export const Toaster: React.FC<ToasterProps> = ({ position = 'top-center', duration = 2000 }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const hideToast = (id: string) => {
      setToasts(prev => prev.map(toast => (toast.id === id ? { ...toast, visible: false } : toast)));
      setTimeout(() => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
      }, 300);
    };

    const handleToast = (event: CustomEvent<ToastEventDetail>) => {
      const { id, type, message, persistent } = event.detail;
      setToasts(prev => [...prev, { id, type, message, visible: false }]);

      /* Delay for the fade-in */
      requestAnimationFrame(() => {
        setToasts(prev => prev.map(toast => (toast.id === id ? { ...toast, visible: true } : toast)));
      });

      /* A persistent toast stays until toast.dismiss() */
      if (!persistent) setTimeout(() => hideToast(id), duration);
    };

    const handleDismiss = (event: CustomEvent<{ id: string }>) => hideToast(event.detail.id);

    window.addEventListener('toast' as any, handleToast as EventListener);
    window.addEventListener('toast-dismiss' as any, handleDismiss as EventListener);
    return () => {
      window.removeEventListener('toast' as any, handleToast as EventListener);
      window.removeEventListener('toast-dismiss' as any, handleDismiss as EventListener);
    };
  }, [duration]);

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <IoCheckmarkCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <IoCloseCircle className="w-5 h-5 text-red-500" />;
      case 'info':
        return <IoInformationCircle className="w-5 h-5 text-blue-500" />;
      case 'warning':
        return <IoWarning className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'top-center':
        return 'top-4 left-1/2 -translate-x-1/2';
      case 'top-left':
        return 'top-4 left-4';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-center':
        return 'bottom-4 left-1/2 -translate-x-1/2';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
    }
  };

  return (
    <div className={clsx('fixed z-[777777777777]', getPositionClasses())}>
      <div className="flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={clsx(
              'flex items-center gap-2 ps-3 pe-4 py-2 rounded-full',
              'text-zinc-900 dark:text-zinc-100',
              'bg-white dark:bg-zinc-700',
              'shadow-lg shadow-zinc-300 dark:shadow-zinc-900',
              'transition-all duration-300 ease-in-out',
              toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            )}
          >
            {getIcon(toast.type)}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const showToast = (type: ToastType, message: string, options: ToastOptions = {}): string => {
  const id = String(++lastToastId);
  window.dispatchEvent(new CustomEvent<ToastEventDetail>('toast', { detail: { id, type, message, persistent: options.persistent ?? false } }));
  return id;
};

export const toast = {
  success: (message: string, options?: ToastOptions) => showToast('success', message, options),
  error: (message: string, options?: ToastOptions) => showToast('error', message, options),
  info: (message: string, options?: ToastOptions) => showToast('info', message, options),
  warning: (message: string, options?: ToastOptions) => showToast('warning', message, options),
  dismiss: (id: string) => {
    window.dispatchEvent(new CustomEvent('toast-dismiss', { detail: { id } }));
  },
};
