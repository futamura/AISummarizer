/**
 * Build target injected by webpack DefinePlugin (jest sets it to 'chrome' via globals)
 */
declare const __TARGET__: 'chrome' | 'firefox';

/* True only in dist/prod-e2e (E2E_HOOKS=1 pnpm build:e2e): a production build that keeps the test hooks */
declare const __E2E_HOOKS__: boolean;
