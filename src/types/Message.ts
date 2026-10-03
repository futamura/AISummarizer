/**
 * The message type for Chrome extension messaging.
 */
export enum MessageAction {
  PING_SERVICE_WORKER = 'PING_SERVICE_WORKER',
  COLOR_SCHEME_CHANGED = 'COLOR_SCHEME_CHANGED',
  EXTRACT_ARTICLE = 'EXTRACT_ARTICLE',
  OPEN_AI_SERVICE = 'OPEN_AI_SERVICE',
  INJECT_ARTICLE = 'INJECT_ARTICLE',
  REQUEST_INJECTION = 'REQUEST_INJECTION',
  READ_ARTICLE_FOR_CLIPBOARD = 'READ_ARTICLE_FOR_CLIPBOARD',
  WRITE_ARTICLE_TO_CLIPBOARD = 'WRITE_ARTICLE_TO_CLIPBOARD',
  OPEN_SETTINGS = 'OPEN_SETTINGS',
  /* Test hook of development builds and dist/prod-e2e: show a toast that stays (e2e/visual/) */
  E2E_SHOW_TOAST = 'E2E_SHOW_TOAST',
}

/**
 * The message interface for Chrome extension messaging.
 *
 * @property type - The type of the message.
 * @property payload - The payload of the message.
 */
export type Message<T = any> = {
  action: MessageAction;
  payload?: T;
};

/**
 * The message response interface for Chrome extension messaging.
 *
 * @property success - Whether the message was processed successfully.
 * @property data - The response data.
 * @property error - The error message if the message processing failed.
 */
export type MessageResponse<T = any> = {
  success: boolean;
  payload?: T;
  error?: Error;
};
