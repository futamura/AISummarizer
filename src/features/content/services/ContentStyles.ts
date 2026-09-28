/* Keep the page's styles out of the shadow root and set the base font of the extension UI */
const HOST_STYLES = `
  :host {
    all: initial;
  }
  #free-ai-summarizer-root {
    all: initial;
    font-family: system-ui, -apple-system, sans-serif;
  }
  #free-ai-summarizer-react-root {
    all: initial;
    font-family: system-ui, -apple-system, sans-serif;
  }
`;

/**
 * Put the extension styles into the content script's shadow root
 * @param shadowRoot - The root itself: production builds attach it closed, so it cannot be looked up from the host element
 * @param globalsCss - The built Tailwind stylesheet
 */
export function appendContentStyles(shadowRoot: ShadowRoot, globalsCss: string): void {
  const style = document.createElement('style');
  style.textContent = `${HOST_STYLES}\n${globalsCss}`;
  shadowRoot.prepend(style);
}
