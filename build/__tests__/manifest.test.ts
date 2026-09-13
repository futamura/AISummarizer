import manifestJson from '../../manifest.json';
import { FIREFOX_ADDON_ID, FIREFOX_DESCRIPTION, FIREFOX_NAME, FIREFOX_STRICT_MIN_VERSION, Manifest, toDevManifest, toFirefoxManifest, transformManifest } from '../manifest';

/* Fresh deep copy of the real manifest so each test can mutate or compare freely */
const source = (): Manifest => JSON.parse(JSON.stringify(manifestJson)) as Manifest;

const toDevIcons = (icons: Record<string, string>) => Object.fromEntries(Object.entries(icons).map(([size, iconPath]) => [size, iconPath.replace(/\.png$/, '-dev.png')]));

describe('toDevManifest', () => {
  it('points icons and action icons at the DEV-badged variants', () => {
    const result = toDevManifest(source());
    expect(result.icons).toEqual(toDevIcons(source().icons!));
    expect(result.action?.default_icon).toEqual(toDevIcons(source().action!.default_icon!));
  });

  it('does not mutate the input', () => {
    const input = source();
    toDevManifest(input);
    expect(input).toEqual(source());
  });
});

describe('toFirefoxManifest', () => {
  it('replaces the service worker with background scripts', () => {
    expect(toFirefoxManifest(source()).background).toEqual({ scripts: ['service-worker.js'] });
  });

  it('removes permissions Firefox does not support', () => {
    const result = toFirefoxManifest(source());
    expect(result.permissions).toEqual(source().permissions!.filter(permission => permission !== 'offscreen' && permission !== 'sidePanel'));
  });

  it('replaces side_panel with a sidebar_action that does not open at install', () => {
    const result = toFirefoxManifest(source());
    expect(result.side_panel).toBeUndefined();
    expect(result.sidebar_action).toEqual({
      default_panel: 'options.html',
      default_title: 'Free AI Summarizer',
      default_icon: source().action!.default_icon,
      open_at_install: false,
    });
  });

  it('adds gecko settings', () => {
    expect(FIREFOX_ADDON_ID).toBe('free-ai-summarizer@futamura.dev');
    expect(FIREFOX_STRICT_MIN_VERSION).toBe('140.0');
    expect(toFirefoxManifest(source()).browser_specific_settings).toEqual({
      gecko: {
        id: 'free-ai-summarizer@futamura.dev',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['websiteContent', 'browsingActivity'] },
      },
      gecko_android: { strict_min_version: '142.0' },
    });
  });

  it('uses a name within the Firefox 45-character limit', () => {
    expect(FIREFOX_NAME).toBe('Free AI Summarizer - ChatGPT, Claude, Gemini');
    const result = toFirefoxManifest(source());
    expect(result.name).toBe(FIREFOX_NAME);
    expect(result.name.length).toBeLessThanOrEqual(45);
  });

  it('uses a browser-neutral description', () => {
    expect(FIREFOX_DESCRIPTION).toBe('A free and open-source browser extension that uses AI to summarize web articles. Get instant summaries with just a few clicks.');
    const result = toFirefoxManifest(source());
    expect(result.description).toBe(FIREFOX_DESCRIPTION);
    expect(result.description).not.toContain('Chrome');
  });

  it('keeps unrelated keys', () => {
    const input = source();
    const result = toFirefoxManifest(input);
    for (const key of ['manifest_version', 'version', 'host_permissions', 'action', 'icons', 'content_scripts', 'options_page', 'web_accessible_resources']) {
      expect(result[key]).toEqual(input[key]);
    }
  });

  it('does not mutate the input', () => {
    const input = source();
    toFirefoxManifest(input);
    expect(input).toEqual(source());
  });

  it('throws when the service worker is missing', () => {
    const input = source();
    delete input.background;
    expect(() => toFirefoxManifest(input)).toThrow('manifest.background.service_worker');
  });

  it('throws when the side panel path is missing', () => {
    const input = source();
    delete input.side_panel;
    expect(() => toFirefoxManifest(input)).toThrow('manifest.side_panel.default_path');
  });
});

describe('transformManifest', () => {
  it('returns the manifest unchanged for chrome production builds', () => {
    expect(transformManifest(source(), { isDev: false, target: 'chrome' })).toEqual(source());
  });

  it('applies only the dev icons for chrome development builds', () => {
    expect(transformManifest(source(), { isDev: true, target: 'chrome' })).toEqual(toDevManifest(source()));
  });

  it('applies only the Firefox transform for firefox production builds', () => {
    expect(transformManifest(source(), { isDev: false, target: 'firefox' })).toEqual(toFirefoxManifest(source()));
  });

  it('uses the dev icons for the sidebar in firefox development builds', () => {
    const result = transformManifest(source(), { isDev: true, target: 'firefox' });
    expect(result.sidebar_action?.default_icon).toEqual(toDevIcons(source().action!.default_icon!));
    expect(result.background).toEqual({ scripts: ['service-worker.js'] });
  });
});
