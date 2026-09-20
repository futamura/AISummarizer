/**
 * The message type for Chrome extension messaging.
 */
export enum MessageAction {
  PING_SERVICE_WORKER = 'PING_SERVICE_WORKER',
  COLOR_SCHEME_CHANGED = 'COLOR_SCHEME_CHANGED',
  TAB_UPDATED = 'TAB_UPDATED',
  EXTRACT_ARTICLE = 'EXTRACT_ARTICLE',
  OPEN_AI_SERVICE = 'OPEN_AI_SERVICE',
  INJECT_ARTICLE = 'INJECT_ARTICLE',
  READ_ARTICLE_FOR_CLIPBOARD = 'READ_ARTICLE_FOR_CLIPBOARD',
  WRITE_ARTICLE_TO_CLIPBOARD = 'WRITE_ARTICLE_TO_CLIPBOARD',
  OPEN_SETTINGS = 'OPEN_SETTINGS',
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
