import { execFile } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { launchProfile } from './browser';
import { PROBE_PAGES, type ProbePage, RUNS_DIR } from './config';
import { fileBlockedIssues, type FileOutcome } from './linear';

/* How long a page gets for its required selectors to appear */
const REQUIRED_TIMEOUT_MS = 30000;
/* Optional selectors are looked up once the required ones settled, so they need less */
const OPTIONAL_TIMEOUT_MS = 5000;
/* Runs older than this are removed, so that snapshots of signed-in pages do not pile up */
const RETENTION_DAYS = 30;

/*
 * ok: every required selector matched. missing: a selector matched nothing, the sign of a DOM change.
 * signed-out: the page went to its sign-in page, or shows the guest page without the signed-in marker. blocked: the site's bot protection answered instead
 * of the page (an HTTP error or a Cloudflare challenge), which says nothing about the selectors
 */
type PageStatus = 'ok' | 'missing' | 'signed-out' | 'blocked' | 'error';

interface PageResult {
  name: string;
  url: string;
  finalUrl: string;
  httpStatus: number | null;
  /* Whether the signed-in marker was found; null for pages that have none */
  signedIn: boolean | null;
  status: PageStatus;
  counts: Record<string, number>;
  optionalCounts: Record<string, number>;
  missing: string[];
  error?: string;
}

interface Options {
  headless: boolean;
  only: string[] | null;
  /* Whether to tell a person: the macOS notification and the Linear issues for blocked pages */
  notify: boolean;
}

const parseOptions = (args: string[]): Options => {
  const only = args.find(arg => arg.startsWith('--only='));
  return {
    /* Headless Chromium is turned away by the bot protection of several sites, so a window is the default */
    headless: args.includes('--headless'),
    only: only ? only.slice('--only='.length).split(',') : null,
    notify: !args.includes('--no-notify'),
  };
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Count the elements matching a selector, waiting up to the timeout for the first one
 * @param page - The page to look in
 * @param selector - The selector to count
 * @param timeout - How long to wait for the first match
 * @returns The number of matching elements, 0 when none appeared in time
 */
const countAfterWait = async (page: Page, selector: string, timeout: number): Promise<number> => {
  await page.waitForSelector(selector, { state: 'attached', timeout }).catch(() => undefined);
  return page.locator(selector).count();
};

const countAll = async (page: Page, selectors: Record<string, string>, timeout: number): Promise<Record<string, number>> => {
  const entries = await Promise.all(Object.entries(selectors).map(async ([key, selector]) => [key, await countAfterWait(page, selector, timeout)] as const));
  return Object.fromEntries(entries);
};

/**
 * Open the transcript panel the way the YouTube extractor does, with a DOM click that works while
 * the description is collapsed, and count its segments
 * @param page - The watch page
 * @param transcript - The selectors of the transcript button and segments
 * @returns The number of transcript segments
 */
const countTranscriptSegments = async (page: Page, transcript: NonNullable<ProbePage['transcript']>): Promise<number> => {
  await page
    .locator(transcript.button)
    .first()
    .evaluate(button => (button as HTMLElement).click());
  return countAfterWait(page, transcript.segment, REQUIRED_TIMEOUT_MS);
};

/**
 * Tell whether the site's bot protection answered instead of the page
 * @param page - The loaded page
 * @param httpStatus - The status of the main document
 * @returns Whether the page is a block or a challenge
 */
const isBlocked = (page: Page, httpStatus: number | null): boolean =>
  (httpStatus !== null && httpStatus >= 400) ||
  page.url().includes('/api/challenge_redirect') ||
  page.frames().some(frame => frame.url().includes('challenges.cloudflare.com'));

const probePage = async (page: Page, config: ProbePage): Promise<PageResult> => {
  const result: PageResult = {
    name: config.name,
    url: config.url,
    finalUrl: config.url,
    httpStatus: null,
    status: 'ok',
    counts: {},
    optionalCounts: {},
    missing: [],
    signedIn: null,
  };
  try {
    const response = await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: REQUIRED_TIMEOUT_MS });
    result.httpStatus = response?.status() ?? null;
    result.counts = await countAll(page, config.required, REQUIRED_TIMEOUT_MS);
    if (config.transcript && result.counts.transcriptButton > 0) {
      result.counts.segment = await countTranscriptSegments(page, config.transcript);
    }
    result.optionalCounts = config.optional ? await countAll(page, config.optional, OPTIONAL_TIMEOUT_MS) : {};
    if (config.signedIn) result.signedIn = (await countAfterWait(page, config.signedIn, OPTIONAL_TIMEOUT_MS)) > 0;
    result.finalUrl = page.url();
    result.missing = Object.entries(result.counts)
      .filter(([, count]) => count === 0)
      .map(([key]) => key);
    if (isBlocked(page, result.httpStatus)) result.status = 'blocked';
    else if (config.loginUrl?.test(result.finalUrl) || result.signedIn === false) result.status = 'signed-out';
    else if (result.missing.length > 0) result.status = 'missing';
  } catch (error: unknown) {
    result.finalUrl = page.url();
    /* Chromium fails the navigation itself when the document comes back with an error status */
    result.status = String(error).includes('ERR_HTTP_RESPONSE_CODE_FAILURE') ? 'blocked' : 'error';
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
};

/**
 * Keep the DOM and a screenshot of a failed page, for comparing against the selectors by hand.
 * They stay in the run directory and are never uploaded.
 */
const saveSnapshot = async (page: Page, runDir: string, name: string): Promise<void> => {
  /* A page still redirecting (to a sign-in page, say) has no content yet */
  const html = await page.content().catch(() => page.waitForTimeout(3000).then(() => page.content()));
  await writeFile(join(runDir, `${name}.html`), html, { mode: 0o600 }).catch(() => undefined);
  await page.screenshot({ path: join(runDir, `${name}.png`), fullPage: false }).catch(() => undefined);
};

const removeOldRuns = async (): Promise<void> => {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const entry of await readdir(RUNS_DIR).catch(() => [])) {
    const started = Date.parse(entry.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3'));
    if (!Number.isNaN(started) && started < cutoff) await rm(join(RUNS_DIR, entry), { recursive: true, force: true });
  }
};

const notify = (message: string): Promise<void> =>
  new Promise(resolve => {
    const script = `display notification ${JSON.stringify(message)} with title "AI Summarizer canary"`;
    execFile('osascript', ['-e', script], () => resolve());
  });

const ADVICE: Record<Exclude<PageStatus, 'ok'>, string> = {
  missing: 'Selectors missing, the DOM may have changed',
  'signed-out': 'Signed out, run pnpm canary:login',
  blocked: 'Blocked by Cloudflare: run pnpm canary:login, pass the check, quit with Cmd+Q',
  error: 'Did not load',
};

/**
 * Word the notification by what to do about each kind of failure
 * @param failed - The pages that were not ok
 * @returns One line per status, naming its pages
 */
const describeFailures = (failed: PageResult[]): string =>
  (Object.keys(ADVICE) as (keyof typeof ADVICE)[])
    .map(status => [status, failed.filter(result => result.status === status).map(result => result.name)] as const)
    .filter(([, names]) => names.length > 0)
    .map(([status, names]) => `${ADVICE[status]}: ${names.join(', ')}`)
    .join('\n');

const describeFiling = (outcome: FileOutcome): string => {
  if (outcome.status === 'failed') return `Linear: could not file an issue for ${outcome.page}: ${outcome.error}`;
  if (outcome.status === 'filed') return `Linear: filed ${outcome.identifier} for ${outcome.page}`;
  return `Linear: ${outcome.identifier} is still open for ${outcome.page}`;
};

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const pages = options.only ? PROBE_PAGES.filter(config => options.only?.includes(config.name)) : PROBE_PAGES;
  const startedAt = new Date();
  const runId = startedAt
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/:/g, '-');
  const runDir = join(RUNS_DIR, runId);
  await mkdir(runDir, { recursive: true, mode: 0o700 });

  const context = await launchProfile(options.headless);
  const results: PageResult[] = [];
  try {
    for (const config of pages) {
      const page = await context.newPage();
      const result = await probePage(page, config);
      if (result.status !== 'ok')
        await saveSnapshot(page, runDir, config.name).catch((error: unknown) => console.warn(`Could not save the snapshot of ${config.name}:`, error));
      results.push(result);
      console.log(
        `${result.status.padEnd(10)} ${config.name} ${JSON.stringify({ ...result.counts, ...result.optionalCounts, signedIn: result.signedIn })}${result.error ? ` ${result.error}` : ''}`
      );
      await page.close();
      /* A pause between sites, so the run does not look like a burst of requests */
      await sleep(2000 + Math.random() * 3000);
    }
  } finally {
    await context.close();
  }

  const failed = results.filter(result => result.status !== 'ok');
  const summary = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    headless: options.headless,
    failed: failed.map(result => result.name),
    results,
  };
  await writeFile(join(runDir, 'result.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  await removeOldRuns();
  console.log(`Results: ${runDir}`);

  if (failed.length > 0) {
    if (options.notify) {
      const blocked = failed.filter(result => result.status === 'blocked').map(result => result.name);
      const filed = await fileBlockedIssues(blocked, runId);
      filed.forEach(outcome => console.log(describeFiling(outcome)));
      const unfiled = filed.filter(outcome => outcome.status === 'failed').map(outcome => outcome.page);
      await notify([describeFailures(failed), ...(unfiled.length > 0 ? [`Could not file a Linear issue: ${unfiled.join(', ')}`] : [])].join('\n'));
    }
    process.exitCode = 1;
  }
};

main().catch(async (error: unknown) => {
  console.error(error);
  await notify(`Canary crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
