import { readdirSync, readFileSync } from 'fs';
import path from 'path';

/* Sanitized snapshots of live pages, captured with scripts/fixtures/capture.js */
export type FixtureName =
  | 'youtube-watch'
  | 'x-post'
  | 'x-article'
  | 'x-signed-out-post'
  | 'x-signed-out-article'
  | 'claude-composer'
  | 'deepseek-composer'
  | 'chatgpt-composer'
  | 'chatgpt-guest-composer'
  | 'gemini-composer'
  | 'aistudio-composer'
  | 'grok-textarea-composer'
  | 'grok-tiptap-composer'
  | 'perplexity-composer'
  | 'kimi-composer'
  | 'qwen-composer';

export interface FixtureMeta {
  name: string;
  source: string;
  captured: string;
}

const FIXTURE_DIR = __dirname;
const HEADER_PATTERN = /^<!-- fixture: (\S+) \| source: (\S+) \| captured: (\d{4}-\d{2}-\d{2}) \| sanitized by scripts\/fixtures\/capture\.js -->\n/;

/**
 * List the fixture files in this directory
 * @returns The file names of the fixtures
 */
export const listFixtureFiles = (): string[] => readdirSync(FIXTURE_DIR).filter(file => file.endsWith('.html'));

/**
 * Read the raw HTML of a fixture file
 * @param file - The file name of the fixture
 * @returns The HTML, including the header comment
 */
export const readFixtureFile = (file: string): string => readFileSync(path.join(FIXTURE_DIR, file), 'utf8');

/**
 * Parse the header comment of a fixture
 * @param html - The HTML of the fixture
 * @returns The metadata, or null when the header is missing or malformed
 */
export const parseFixtureMeta = (html: string): FixtureMeta | null => {
  const match = html.match(HEADER_PATTERN);
  if (!match) return null;
  return { name: match[1], source: match[2], captured: match[3] };
};

/**
 * Replace the current jsdom document with a fixture
 * @param name - The name of the fixture
 * @returns The metadata of the fixture
 */
export const loadFixture = (name: FixtureName): FixtureMeta => {
  const html = readFixtureFile(`${name}.html`);
  const meta = parseFixtureMeta(html);
  if (!meta) throw new Error(`Fixture ${name} has no valid header`);

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
  return meta;
};
