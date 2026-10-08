import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:https';
import { type AddressInfo, connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.dirname(E2E_DIR);
const PAGES_DIR = path.join(E2E_DIR, 'pages');
/* Sanitized snapshots of live pages, shared with the Jest tests */
const FIXTURES_DIR = path.join(REPO_DIR, 'src', 'features', 'content', '__fixtures__');

/* .test is reserved for testing (RFC 6761), so even a resolver mistake cannot reach a real site */
const PAGE_HOST = 'news.e2e.test';
export const PAGE_ORIGIN = `https://${PAGE_HOST}`;

/* The fixture each live host answers with. The AI service hosts are the ones getSummarizeUrl opens */
const FIXTURE_HOSTS: Record<string, string> = {
  'www.youtube.com': 'youtube-watch',
  'chatgpt.com': 'chatgpt-composer',
  'gemini.google.com': 'gemini-composer',
  'claude.ai': 'claude-composer',
  'grok.com': 'grok-tiptap-composer',
  'www.perplexity.ai': 'perplexity-composer',
  'chat.deepseek.com': 'deepseek-composer',
  'www.kimi.ai': 'kimi-composer',
  'chat.qwen.ai': 'qwen-composer',
};

/* x.com serves posts and long-form articles on the same path pattern */
const X_HOST = 'x.com';
const X_ARTICLE_PATH = '/Safety/status/1801282137921871887';

/* Every host the browser resolves to the server; any other host does not resolve */
const SERVED_HOSTS = [PAGE_HOST, X_HOST, ...Object.keys(FIXTURE_HOSTS)];

/*
 * A captured fixture has no site script, so a click on a send button inside a <form> submits it
 * natively and reloads the page with the composer emptied, which the live sites never do. This stands
 * in for their submit handler
 */
const SUBMIT_GUARD = "<script>document.addEventListener('submit', event => event.preventDefault(), true);</script>";

/**
 * Serve a fixture with the submit guard at the start of its head
 * @param html - The fixture HTML
 * @returns The HTML to serve
 */
export const withSubmitGuard = (html: string): string => html.replace(/<head(?:\s[^>]*)?>/i, head => `${head}${SUBMIT_GUARD}`);

export interface CapturedFixture {
  html: string;
  /* The URL the fixture was captured from */
  source: string;
}

export interface FixtureServer {
  /* Value for Chromium's --host-resolver-rules: the served hosts to this server, every other host to nowhere */
  resolverRules: string;
  /* Port of the HTTP proxy Firefox uses: it tunnels the served hosts to this server and refuses every other host */
  proxyPort: number;
  /* Hosts the proxy refused since the last reset, Firefox's own background requests included */
  refused: string[];
  /* Every request received since the last reset, as "<hostname><path><query> <Sec-Fetch-Dest>" */
  requests: string[];
  /* Answer a served host with another fixture until the next reset */
  override: (host: string, name: string) => void;
  /* Drop the overrides, the request log and the refused hosts, between tests */
  reset: () => void;
  close: () => Promise<void>;
}

/**
 * Read a captured fixture
 * @param name - The fixture name, its file name without .html
 * @returns The HTML and the URL it was captured from
 */
export const readFixture = (name: string): CapturedFixture => {
  const file = path.join(FIXTURES_DIR, `${name}.html`);
  const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const header = html.match(/^<!-- fixture: (\S+) \| source: (\S+) \|/);
  if (!header || header[1] !== name) throw new Error(`No captured fixture ${name} with a valid header in src/features/content/__fixtures__/`);
  return { html, source: header[2] };
};

/**
 * The fixture a live URL is answered with by default
 * @param url - The requested URL
 * @returns The fixture name, or undefined for a host without one
 */
export const fixtureForUrl = (url: URL): string | undefined => {
  if (url.hostname === X_HOST) return url.pathname === X_ARTICLE_PATH ? 'x-article' : 'x-post';
  return FIXTURE_HOSTS[url.hostname];
};

/**
 * Read a hand-written test page of e2e/pages/
 * @param pathname - The URL path, the file name without .html
 * @returns The HTML, or undefined when there is no such page
 */
const readTestPage = (pathname: string): string | undefined => {
  const file = path.join(PAGES_DIR, `${pathname.slice(1)}.html`);
  return path.dirname(file) === PAGES_DIR && existsSync(file) ? readFileSync(file, 'utf8') : undefined;
};

/**
 * Create a self-signed certificate for the server; the browser is started to accept it
 * @returns The private key and the certificate, in PEM
 */
const createCertificate = (): { key: Buffer; cert: Buffer } => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ai-summarizer-e2e-cert-'));
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  try {
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=ai-summarizer-e2e', '-keyout', keyFile, '-out', certFile],
      {
        stdio: 'pipe',
      }
    );
    return { key: readFileSync(keyFile), cert: readFileSync(certFile) };
  } catch (error) {
    throw new Error(`openssl is needed to create the test certificate: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * Start the HTTPS server that answers every served host. Only page loads get HTML; images, scripts
 * and API calls get 404, since the fixtures keep the site's own URLs for them
 * @returns The running server
 */
export const startFixtureServer = async (): Promise<FixtureServer> => {
  const overrides = new Map<string, string>();
  const requests: string[] = [];

  const server = createServer(createCertificate(), (request, response) => {
    const url = new URL(request.url ?? '/', `https://${request.headers.host ?? 'unknown.invalid'}`);
    const destination = String(request.headers['sec-fetch-dest'] ?? '');
    requests.push(`${url.hostname}${url.pathname}${url.search} ${destination}`);

    let html: string | undefined;
    if (destination === 'document') {
      if (url.hostname === PAGE_HOST) {
        html = readTestPage(url.pathname);
      } else {
        const name = overrides.get(url.hostname) ?? fixtureForUrl(url);
        if (name) html = withSubmitGuard(readFixture(name).html);
      }
    }
    if (html === undefined) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  /*
   * Firefox has no --host-resolver-rules, so it sends every request to this proxy instead: a served host
   * is tunnelled to the server above, any other host gets 403. Plain http:// requests are refused too
   */
  const refused: string[] = [];
  const tunnels = new Set<Socket>();
  const proxy = createHttpServer((request, response) => {
    refused.push(new URL(request.url ?? '/', 'http://unknown.invalid').hostname);
    response.writeHead(403);
    response.end();
  });
  proxy.on('connect', (request, client: Socket) => {
    /*
     * The HTTP server stops handling this socket's errors once it emits connect, and Firefox resets connections
     * when it closes: without a listener, the reset would crash the test worker
     */
    tunnels.add(client);
    client.on('close', () => tunnels.delete(client));
    client.on('error', () => client.destroy());

    const host = String(request.url ?? '').split(':')[0];
    if (!SERVED_HOSTS.includes(host)) {
      refused.push(host);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = connect(port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.pipe(client);
      client.pipe(upstream);
    });
    tunnels.add(upstream);
    upstream.on('close', () => tunnels.delete(upstream));
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const { port: proxyPort } = proxy.address() as AddressInfo;

  return {
    resolverRules: [...SERVED_HOSTS.map(host => `MAP ${host} 127.0.0.1:${port}`), 'MAP * ~NOTFOUND'].join(', '),
    proxyPort,
    refused,
    requests,
    override: (host: string, name: string) => {
      if (!SERVED_HOSTS.includes(host)) throw new Error(`${host} is not served: add it to FIXTURE_HOSTS in e2e/fixture-server.ts`);
      /* Fail now on an unknown name, rather than on the first request */
      readFixture(name);
      overrides.set(host, name);
    },
    reset: () => {
      overrides.clear();
      requests.length = 0;
      refused.length = 0;
    },
    close: async () => {
      /* A tunnel is a raw socket, which closeAllConnections does not know about */
      for (const socket of tunnels) socket.destroy();
      proxy.closeAllConnections();
      server.closeAllConnections();
      await Promise.all([proxy, server].map(listener => new Promise<void>((resolve, reject) => listener.close(error => (error ? reject(error) : resolve())))));
    },
  };
};
