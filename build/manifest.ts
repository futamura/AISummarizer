/**
 * Build-time manifest transforms. manifest.json is the single source of truth;
 * the development and Firefox variants are derived from it by webpack.
 */

export type Target = 'chrome' | 'firefox';

type Icons = Record<string, string>;

export interface Manifest {
  name: string;
  version: string;
  permissions?: string[];
  icons?: Icons;
  action?: { default_icon?: Icons; [key: string]: unknown };
  background?: { service_worker?: string; type?: string; scripts?: string[] };
  side_panel?: { default_path?: string };
  sidebar_action?: { default_panel: string; default_title: string; default_icon?: Icons; open_at_install: boolean };
  browser_specific_settings?: {
    gecko: { id: string; strict_min_version: string; data_collection_permissions: { required: string[] } };
    gecko_android?: { strict_min_version: string };
  };
  [key: string]: unknown;
}

export const FIREFOX_ADDON_ID = 'free-ai-summarizer@futamura.dev';

/* Minimum version that understands data_collection_permissions (also covers ESR 140) */
export const FIREFOX_STRICT_MIN_VERSION = '140.0';

/* First Firefox for Android version that understands data_collection_permissions */
export const FIREFOX_ANDROID_STRICT_MIN_VERSION = '142.0';

/* The page text, title and URL are sent to the AI service the user picks (implicit consent, AMO policy 6.2.2.2) */
export const FIREFOX_DATA_COLLECTION = ['websiteContent', 'browsingActivity'];

/* Firefox caps the manifest name at 45 characters; the Chrome name in manifest.json is longer */
export const FIREFOX_NAME = 'Free AI Summarizer - ChatGPT, Claude, Gemini';

/* The manifest.json description says "Chrome Extension"; Firefox gets a browser-neutral one */
export const FIREFOX_DESCRIPTION = 'A free and open-source browser extension that uses AI to summarize web articles. Get instant summaries with just a few clicks.';

/* Short label shown in Firefox's sidebar switcher; the manifest name is too long there */
const FIREFOX_SIDEBAR_TITLE = 'Free AI Summarizer';

const FIREFOX_UNSUPPORTED_PERMISSIONS = ['offscreen', 'sidePanel'];

const toDevIcons = (icons: Icons): Icons => Object.fromEntries(Object.entries(icons).map(([size, iconPath]) => [size, iconPath.replace(/\.png$/, '-dev.png')]));

/**
 * Point manifest icons at the DEV-badged variants for development builds
 */
export const toDevManifest = (manifest: Manifest): Manifest => ({
  ...manifest,
  ...(manifest.icons && { icons: toDevIcons(manifest.icons) }),
  ...(manifest.action && {
    action: {
      ...manifest.action,
      ...(manifest.action.default_icon && { default_icon: toDevIcons(manifest.action.default_icon) }),
    },
  }),
});

/**
 * Convert the Chrome manifest into a Firefox (desktop) manifest
 */
export const toFirefoxManifest = (manifest: Manifest): Manifest => {
  const serviceWorker = manifest.background?.service_worker;
  if (!serviceWorker) throw new Error('manifest.background.service_worker is required to build the Firefox manifest');
  const sidePanelPath = manifest.side_panel?.default_path;
  if (!sidePanelPath) throw new Error('manifest.side_panel.default_path is required to build the Firefox manifest');

  const { side_panel, ...rest } = manifest;
  return {
    ...rest,
    name: FIREFOX_NAME,
    description: FIREFOX_DESCRIPTION,
    permissions: (manifest.permissions ?? []).filter(permission => !FIREFOX_UNSUPPORTED_PERMISSIONS.includes(permission)),
    background: { scripts: [serviceWorker] },
    sidebar_action: {
      default_panel: sidePanelPath,
      default_title: FIREFOX_SIDEBAR_TITLE,
      default_icon: manifest.action?.default_icon,
      open_at_install: false,
    },
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_ADDON_ID,
        strict_min_version: FIREFOX_STRICT_MIN_VERSION,
        data_collection_permissions: { required: [...FIREFOX_DATA_COLLECTION] },
      },
      gecko_android: { strict_min_version: FIREFOX_ANDROID_STRICT_MIN_VERSION },
    },
  };
};

/**
 * Apply the transforms for the given build. Dev icons are applied first so the
 * Firefox sidebar icon inherits them.
 */
export const transformManifest = (manifest: Manifest, options: { isDev: boolean; target: Target }): Manifest => {
  const devApplied = options.isDev ? toDevManifest(manifest) : manifest;
  return options.target === 'firefox' ? toFirefoxManifest(devApplied) : devApplied;
};
