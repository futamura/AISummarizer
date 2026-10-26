import React from 'react';

/**
 * The props for the ServiceListMenu component.
 *
 * @param service - The service to display.
 * @param onClick - The click handler.
 */
interface ServiceListMenuProps {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

/**
 * The ServiceListMenu component.
 *
 * @param service - The service to display.
 * @param onClick - The click handler.
 * @returns The ServiceListMenu component.
 */
export const ServiceListMenu: React.FC<ServiceListMenuProps> = ({ className, onClick, children }: ServiceListMenuProps) => {
  /**
   * The ServiceListMenu component.
   *
   * @returns The ServiceListMenu component.
   */
  return (
    <button
      onClick={onClick}
      /* Rows without an action are labels: keep them out of the Tab order and the arrow key navigation */
      tabIndex={onClick ? undefined : -1}
      className={`flex items-center gap-2 px-1 py-1 w-full ${onClick ? 'rounded-md hover:bg-zinc-300 dark:hover:bg-zinc-700 focus-visible:outline-none focus-visible:bg-zinc-300 dark:focus-visible:bg-zinc-700 transition-colors' : 'cursor-default'} ${className}`}
    >
      {children}
    </button>
  );
};
