import { useEffect } from 'react';

/**
 * The selector of the menu items that keyboard navigation moves between.
 * Rows without an action carry tabIndex -1 and are skipped.
 */
export const MENU_ITEM_SELECTOR = 'button:not([tabindex="-1"]):not([disabled])';

/**
 * Moves the focus between the menu items for a navigation key.
 * Nothing is focused when the popup opens, so ArrowDown starts at the first item and ArrowUp at the last one.
 *
 * @param key - The key of the keyboard event.
 * @param root - The element that holds the menu items.
 * @returns True if the key was handled.
 */
export const moveMenuFocus = (key: string, root: ParentNode): boolean => {
  const items = Array.from(root.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));
  if (items.length === 0) return false;

  const current = items.indexOf(document.activeElement as HTMLElement);
  let next: number;
  switch (key) {
    case 'ArrowDown':
      next = current === -1 ? 0 : (current + 1) % items.length;
      break;
    case 'ArrowUp':
      next = current === -1 ? items.length - 1 : (current - 1 + items.length) % items.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = items.length - 1;
      break;
    default:
      return false;
  }

  items[next].focus();
  return true;
};

/**
 * Hook for moving between the popup menu items with the arrow keys, Home and End.
 * Enter and Space then run the focused item, as for any button.
 */
export const useMenuKeyNavigation = () => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      /* Prevent the default so the arrow keys do not also scroll the popup */
      if (moveMenuFocus(event.key, document)) event.preventDefault();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
};
