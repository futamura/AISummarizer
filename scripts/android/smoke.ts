import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { FIREFOX_ADDON_ID } from '../../build/manifest';
import { AIService, getSummarizeUrl } from '../../src/types/AIService';
import { RdpClient } from './rdp';

const run = promisify(execFile);

const REPO_DIR = resolve(fileURLToPath(import.meta.url), '../../..');
const DIST_DIR = join(REPO_DIR, 'dist', 'firefox-dev');
const FIREFOX_PACKAGE = 'org.mozilla.firefox';
/* Where web-ext pushes its add-ons too: Firefox can read it, and the add-on is installed from that copy */
const DEVICE_XPI_PATH = '/data/local/tmp/ai-summarizer-smoke.xpi';
/* An https article: Firefox for Android upgrades http pages to https and shows an error page when it cannot */
const DEFAULT_ARTICLE_URL = 'https://en.wikipedia.org/wiki/Newline';
/* Signed out, ChatGPT still takes a message as a guest */
const DEFAULT_SERVICE = AIService.CHATGPT;
const PAGE_LOAD_TIMEOUT_MS = 60000;
/* Extraction, the new tab and the injector's waits for the composer */
const INJECTION_TIMEOUT_MS = 90000;
const POLL_INTERVAL_MS = 1000;
const NOT_SENT = 'in the composer, not sent';

interface Options {
  /* Only check the device, without installing or sending anything */
  checkOnly: boolean;
  serial: string | null;
  service: AIService;
  url: string;
}

interface TabForm {
  actor: string;
  url: string;
}

interface TargetForm {
  url: string;
  consoleActor: string;
}

const sleep = (ms: number): Promise<void> => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

const parseOptions = (args: string[]): Options => {
  const value = (name: string): string | undefined => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const service = (value('service') ?? DEFAULT_SERVICE).toUpperCase();
  if (!Object.values<string>(AIService).includes(service)) {
    throw new Error(`Unknown service ${service}: use one of ${Object.values(AIService).join(', ')}`);
  }
  return { checkOnly: args.includes('--check'), serial: value('serial') ?? null, service: service as AIService, url: value('url') ?? DEFAULT_ARTICLE_URL };
};

const warnings: string[] = [];
const warn = (message: string): void => {
  warnings.push(message);
  console.log(`  ! ${message}`);
};

/**
 * Run a step and print its outcome
 * @param name - What the step does
 * @param action - The step; it returns a detail to print, and throws to fail the run
 * @returns What the step returned
 */
const step = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
  console.log(`- ${name}`);
  try {
    const result = await action();
    console.log(`  ok${typeof result === 'string' && result ? `: ${result}` : ''}`);
    return result;
  } catch (error) {
    console.log(`  NG: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

/**
 * Wait until a check returns a value
 * @param check - Returns the awaited value, or null to keep waiting
 * @param timeoutMs - How long to wait
 * @param what - What is awaited, for the timeout message
 * @returns The value
 */
const poll = async <T>(check: () => Promise<T | null>, timeoutMs: number, what: string): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs / 1000} s waiting for ${what}`);
    await sleep(POLL_INTERVAL_MS);
  }
};

const adb = async (serial: string, ...args: string[]): Promise<string> => (await run('adb', ['-s', serial, ...args])).stdout;

/**
 * Pick the device and warn about what makes a run fail: a locked or dark screen stops the timers of the
 * pages, and a page in the background stops them too
 * @param requested - The serial number given with --serial
 * @returns The serial number of the device
 */
const checkDevice = async (requested: string | null): Promise<string> => {
  const { stdout } = await run('adb', ['devices']);
  const devices = stdout
    .split('\n')
    .slice(1)
    .map(line => line.trim().split(/\s+/))
    .filter(([serial]) => serial && (!requested || serial === requested));
  if (devices.length === 0) throw new Error(requested ? `No device ${requested}` : 'No device: connect the phone with USB debugging on');
  if (devices.length > 1) throw new Error(`${devices.length} devices: pick one with --serial=<serial> (adb devices lists them)`);
  const [serial, state] = devices[0];
  if (state === 'unauthorized') throw new Error('The device has not allowed this computer: accept the USB debugging prompt on the phone');
  if (state !== 'device') throw new Error(`The device is ${state}`);

  const power = await adb(serial, 'shell', 'dumpsys', 'power');
  if (!/mWakefulness=Awake/.test(power)) warn('The screen is off: wake the phone, or the pages stop and the run times out');
  const window = await adb(serial, 'shell', 'dumpsys', 'window');
  if (/isKeyguardShowing=true/.test(window)) warn('The phone is locked: unlock it, or the pages stop and the run times out');
  if (!new RegExp(`mCurrentFocus=.*${FIREFOX_PACKAGE.replace(/\./g, '\\.')}`).test(window)) {
    warn('Firefox is not in front: bring it to the front, or its tabs stop and the run times out');
  }
  const sockets = await adb(serial, 'shell', 'cat', '/proc/net/unix');
  if (!sockets.includes(`${FIREFOX_PACKAGE}/firefox-debugger-socket`)) {
    throw new Error('Firefox does not listen for a debugger: start Firefox and turn on Settings → Remote debugging via USB');
  }
  return serial;
};

/**
 * Pack dist/firefox-dev and install it as a temporary add-on. It covers an add-on of the same ID from AMO
 * until Firefox restarts, which web-ext run cannot do: it stops before installing (exit 13)
 * @param serial - The device
 * @param port - The local port forwarded to Firefox
 * @returns The version installed
 */
const installAddon = async (serial: string, port: number): Promise<string> => {
  const manifestPath = join(DIST_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error('No dist/firefox-dev: build it with pnpm start:firefox');
  const { version } = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string };

  const workDir = mkdtempSync(join(tmpdir(), 'ai-summarizer-smoke-'));
  try {
    const xpi = join(workDir, 'addon.xpi');
    await run('zip', ['-q', '-r', '-X', xpi, '.'], { cwd: DIST_DIR });
    await adb(serial, 'push', xpi, DEVICE_XPI_PATH);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  const client = await RdpClient.connect(port);
  try {
    const root = await client.request('root', 'getRoot');
    const { addon } = await client.request(String(root.addonsActor), 'installTemporaryAddon', { addonPath: DEVICE_XPI_PATH, openDevTools: false });
    if ((addon as { id?: string })?.id !== FIREFOX_ADDON_ID) throw new Error(`Installed ${JSON.stringify(addon)}, not ${FIREFOX_ADDON_ID}`);
  } finally {
    client.close();
  }
  return `dist/firefox-dev ${version}`;
};

/**
 * Watch the frames of the add-on: its background page and its extension pages
 * @param client - The connection
 */
const watchAddonFrames = async (client: RdpClient): Promise<void> => {
  const { addons } = await client.request('root', 'listAddons');
  const addon = (addons as { id: string; actor: string }[]).find(({ id }) => id === FIREFOX_ADDON_ID);
  if (!addon) throw new Error('The add-on is not installed');
  const watcher = await client.request(addon.actor, 'getWatcher');
  await client.request(String(watcher.actor), 'watchTargets', { targetType: 'frame' });
};

/**
 * Find a frame of the add-on among those the watcher reported
 * @param client - The connection
 * @param urlPart - Part of the frame's URL
 * @returns The latest such frame
 */
const findAddonFrame = (client: RdpClient, urlPart: string): Promise<TargetForm> =>
  poll(
    async () =>
      client.events
        .filter(event => event.type === 'target-available-form')
        .map(event => event.target as TargetForm)
        .reverse()
        .find(target => String(target.url).includes(urlPart)) ?? null,
    PAGE_LOAD_TIMEOUT_MS,
    `the add-on page ${urlPart}`
  );

/**
 * Get the console of a tab
 * @param client - The connection
 * @param tab - The tab
 * @returns The console actor of its top frame
 */
const tabConsole = async (client: RdpClient, tab: TabForm): Promise<string> => {
  const { frame } = await client.request(tab.actor, 'getTarget');
  return (frame as TargetForm).consoleActor;
};

const listTabs = async (client: RdpClient): Promise<TabForm[]> => (await client.request('root', 'listTabs')).tabs as TabForm[];

/* The opening of the article's first paragraph, as Readability keeps it: footnote marks left out */
const ARTICLE_SNIPPET = `(() => {
  const text = [...document.querySelectorAll('p')].map(p => p.innerText.replace(/\\s+/g, ' ').trim()).find(t => t.length > 80) ?? '';
  return text.split('[')[0].slice(0, 60).trim();
})()`;

/**
 * Where the snippet is on the AI service's page: anywhere, and in a composer (not sent yet)
 * @param snippet - The snippet of the article
 * @returns The expression
 */
const injectionState = (snippet: string): string => `(() => {
  const normalize = text => text.replace(/\\s+/g, ' ');
  const composers = [...document.querySelectorAll('textarea')].map(t => t.value)
    .concat([...document.querySelectorAll('[contenteditable="true"]')].map(e => e.innerText));
  const inComposer = composers.some(text => normalize(text).includes(${JSON.stringify(snippet)}));
  const inPage = inComposer || normalize(document.body.innerText).includes(${JSON.stringify(snippet)});
  return JSON.stringify({ inPage, inComposer, url: location.href });
})()`;

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const serviceHost = new URL(getSummarizeUrl(options.service, 'smoke')).hostname;
  console.log(`Android smoke: ${options.url} → ${options.service}`);

  const serial = await step('Check the device', () => checkDevice(options.serial));
  if (options.checkOnly) {
    console.log(warnings.length ? `Ready with ${warnings.length} warning(s)` : 'Ready');
    return;
  }
  const forwarded = (await adb(serial, 'forward', 'tcp:0', `localabstract:${FIREFOX_PACKAGE}/firefox-debugger-socket`)).trim();
  const port = Number(forwarded);

  try {
    await step('Install dist/firefox-dev as a temporary add-on', () => installAddon(serial, port));

    /* A fresh connection: on the old one, the new add-on's pages answer awaited evaluations only after a timeout */
    const client = await RdpClient.connect(port);
    try {
      await watchAddonFrames(client);
      const background = await findAddonFrame(client, '_generated_background_page.html');

      const article = await step('Open the article', async () => {
        const id = Number(
          await client.evaluate(
            background.consoleActor,
            `browser.tabs.create({ url: ${JSON.stringify(options.url)}, active: true }).then(tab => String(tab.id))`
          )
        );
        const url = await poll(
          async () => {
            const tab = JSON.parse(await client.evaluate(background.consoleActor, `browser.tabs.get(${id}).then(tab => JSON.stringify(tab))`)) as {
              status: string;
              url: string;
            };
            /* A new tab is complete on about:blank for a moment, before the article starts loading */
            return tab.status === 'complete' && tab.url !== 'about:blank' ? tab.url : null;
          },
          PAGE_LOAD_TIMEOUT_MS,
          'the article to load'
        );
        return { id, url };
      });
      console.log(`  ${article.url}`);

      const snippet = await step('Read the start of the article', async () => {
        const tab = (await listTabs(client)).find(({ url }) => url === article.url);
        if (!tab) throw new Error('The article tab is not listed');
        const text = await client.evaluate(await tabConsole(client, tab), ARTICLE_SNIPPET);
        if (text.length < 20) throw new Error(`No paragraph to look for on the AI service: "${text}"`);
        return text;
      });

      /*
       * The popup sends OPEN_AI_SERVICE from an extension page; the options page stands in for it, since
       * the background page does not receive its own messages. The article goes back to the front first,
       * as when the popup opens over it
       */
      const tabsBefore = new Set((await listTabs(client)).map(({ actor }) => actor));
      await step(`Send OPEN_AI_SERVICE for ${options.service}`, async () => {
        await client.evaluate(background.consoleActor, 'browser.runtime.openOptionsPage().then(() => "")');
        const optionsPage = await findAddonFrame(client, 'options.html');
        await client.evaluate(background.consoleActor, `browser.tabs.update(${article.id}, { active: true }).then(() => "")`);
        const payload = { service: options.service, tabId: article.id, tabUrl: article.url };
        /* Not awaited: the page is in the background now, where Firefox for Android holds back what an await waits for */
        await client.evaluate(
          optionsPage.consoleActor,
          `browser.runtime.sendMessage({ action: "OPEN_AI_SERVICE", payload: ${JSON.stringify(payload)} }).catch(() => {}), "sent"`
        );
        return '';
      });

      const serviceTab = await step(`Open ${serviceHost}`, () =>
        poll(
          async () =>
            (await listTabs(client)).find(tab => !tabsBefore.has(tab.actor) && URL.canParse(tab.url) && new URL(tab.url).hostname === serviceHost) ?? null,
          INJECTION_TIMEOUT_MS,
          `a new tab of ${serviceHost}`
        )
      );
      console.log(`  ${serviceTab.url}`);

      const found = await step('Find the article on the AI service', async () => {
        const consoleActor = await tabConsole(client, serviceTab);
        let last = { inPage: false, inComposer: false, url: serviceTab.url };
        try {
          await poll(
            async () => {
              last = JSON.parse(await client.evaluate(consoleActor, injectionState(snippet)));
              return last.inPage && !last.inComposer ? last : null;
            },
            INJECTION_TIMEOUT_MS,
            'the article to be sent'
          );
          return `sent (${last.url})`;
        } catch (error) {
          /* Injected but not sent: the service may want a sign-in or refuse a guest; the injection worked */
          if (last.inComposer) return NOT_SENT;
          throw new Error(`${error instanceof Error ? error.message : String(error)} (now at ${last.url})`);
        }
      });
      if (found === NOT_SENT) warn('The article is in the composer but was not sent: look at the phone (a sign-in or a limit of the service?)');
    } finally {
      client.close();
    }
  } finally {
    await adb(serial, 'forward', '--remove', `tcp:${port}`).catch(() => undefined);
  }

  console.log(warnings.length ? `Passed with ${warnings.length} warning(s)` : 'Passed');
  console.log('Restart Firefox to go back to the add-on from AMO');
};

main().catch(error => {
  console.log(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
