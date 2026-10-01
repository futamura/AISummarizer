import { openProfileForSignIn } from './browser';
import { LOGIN_URLS, PROFILE_DIR } from './config';

/**
 * Open the canary profile with a tab for every service, so that the sessions can be signed in by
 * hand. Sign in with the canary accounts, never with personal ones. The script ends when the
 * browser is quit.
 */
const main = async (): Promise<void> => {
  console.log(`Profile: ${PROFILE_DIR}`);
  console.log('Sign in on each tab, then quit the browser (Cmd+Q).');
  await openProfileForSignIn(LOGIN_URLS);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
