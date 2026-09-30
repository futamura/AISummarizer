import { launchProfile } from './browser';
import { LOGIN_URLS, PROFILE_DIR } from './config';

/**
 * Open the canary profile with a tab for every service, so that the sessions can be signed in by
 * hand. Sign in with the canary accounts, never with personal ones. The script ends when the
 * browser window is closed.
 */
const main = async (): Promise<void> => {
  console.log(`Profile: ${PROFILE_DIR}`);
  const context = await launchProfile(false);
  const [first] = context.pages();
  for (const [index, url] of LOGIN_URLS.entries()) {
    const page = index === 0 && first ? first : await context.newPage();
    await page.goto(url).catch((error: unknown) => console.warn(`Could not open ${url}:`, error));
  }
  console.log('Sign in on each tab, then close the browser window.');
  await new Promise<void>(resolve => context.on('close', () => resolve()));
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
