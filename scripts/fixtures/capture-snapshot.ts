import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/*
 * Capture a fixture from a saved DOM snapshot instead of the live page, by running capture.js on
 * it in jsdom. For pages the Claude in Chrome tools cannot reach, such as signed-out X, whose
 * markup the canary saves (runs/<time>/x-post.html). See README.md next to this file.
 *
 * Usage: node --loader ts-node/esm scripts/fixtures/capture-snapshot.ts <snapshot.html> <page URL> <fixture name>
 */

interface CaptureReport {
  name: string;
  keep: Record<string, number>;
  textChars: number;
  bytes: number;
}

interface CaptureWindow {
  eval: (code: string) => unknown;
  captureFixture: (name: string) => Promise<CaptureReport>;
  lastFixture: string;
}

interface JsdomModule {
  JSDOM: new (html: string, options: { url: string; runScripts: 'outside-only'; virtualConsole: object }) => { window: CaptureWindow };
  VirtualConsole: new () => object;
}

/* jsdom comes with jest-environment-jsdom rather than as a dependency of its own, so it is resolved from there */
const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom') as JsdomModule;

const FIXTURE_DIR = new URL('../../src/features/content/__fixtures__/', import.meta.url);
const CAPTURE_SCRIPT = new URL('./capture.js', import.meta.url);

const main = async (): Promise<void> => {
  const [snapshot, url, name] = process.argv.slice(2);
  if (!snapshot || !url || !name) {
    console.error('Usage: node --loader ts-node/esm scripts/fixtures/capture-snapshot.ts <snapshot.html> <page URL> <fixture name>');
    process.exitCode = 1;
    return;
  }

  /* The silent console keeps out the errors jsdom reports on the page's stylesheets */
  const { window } = new JSDOM(readFileSync(snapshot, 'utf8'), { url, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  window.eval(readFileSync(CAPTURE_SCRIPT, 'utf8'));

  const report = await window.captureFixture(name);

  /* The fixture records when the snapshot was taken, not when it was sanitized */
  const captured = statSync(snapshot).mtime.toLocaleDateString('sv-SE');
  const html = window.lastFixture.replace(/captured: \d{4}-\d{2}-\d{2}/, `captured: ${captured}`);
  writeFileSync(new URL(`${name}.html`, FIXTURE_DIR), html);

  /* The report is an object of the jsdom window, which prints as an empty one */
  console.log(JSON.stringify(report));
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
