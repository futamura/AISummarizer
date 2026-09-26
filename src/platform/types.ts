/**
 * Browser-specific operations. Everything else keeps using the chrome.* namespace,
 * which Firefox also provides.
 */
export interface Platform {
  /**
   * Open the settings panel (Chrome side panel / Firefox sidebar).
   * Call it before any await in a user gesture handler.
   */
  openSettingsPanel(windowId?: number): Promise<void>;

  /**
   * Close the settings panel
   */
  closeSettingsPanel(): Promise<void>;

  /**
   * Start detecting the OS color scheme
   * @param onColorSchemeChange - Called with the current scheme when the platform reports it directly
   * Rejects when the platform setup fails (e.g. the offscreen document cannot be checked or closed); callers must catch.
   */
  initThemeDetection(onColorSchemeChange: (isDarkMode: boolean) => void): Promise<void>;

  /**
   * Type text into the focused rich text editor (ProseMirror) at the selection, keeping its line breaks.
   * Goes through execCommand so the editor state follows the DOM.
   * @param text - The text to type in
   */
  insertEditorText(text: string): void;
}
