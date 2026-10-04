# Directory Structure

Please follow the directory structure below for implementation:

```
/
├── src/                          # Source directory
│   ├── components/               # Shared UI Components
│   ├── constants/                # Constant values and configurations
│   ├── db/                       # Database related implementations
│   ├── features/                 # Feature-specific implementations
│   │   ├── content/             # Content script feature
│   │   │   └── __fixtures__/       # Sanitized snapshots of live pages for injector / extractor tests and E2E
│   │   ├── offscreen/           # Offscreen feature
│   │   ├── options/             # Options page feature
│   │   ├── popup/               # Popup feature
│   │   └── serviceworker/       # Service Worker feature
│   ├── models/                   # Data models and interfaces
│   ├── pages/                    # Page implementations
│   │   ├── Content.tsx          # Content script page
│   │   ├── Offscreen.ts         # Offscreen page
│   │   ├── Options.tsx          # Options page
│   │   ├── Popup.tsx            # Popup page
│   │   └── ServiceWorker.ts     # Service Worker implementation
│   ├── platform/                 # Browser-specific implementations (Chrome / Firefox)
│   ├── stores/                   # State management (Zustand)
│   ├── styles/                   # Global styles
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utility functions
├── build/                        # Build-time scripts (manifest transforms)
├── scripts/                      # Developer scripts outside the build (fixture capture, local canary)
├── docs/                         # Developer documentation (store rollback runbook, design specs and plans)
├── e2e/                          # End-to-end tests of the built extension: Chrome (Playwright) and Firefox (firefox/, Puppeteer)
├── public/                       # Static assets
├── dist/                         # Output directory (dev/prod: Chrome, firefox-dev/firefox-prod: Firefox, prod-e2e: visual tests)
├── node_modules/                 # Dependency packages
├── logs/                         # Application logs
├── fastlane/                     # Fastlane deployment configuration
├── .github/                      # GitHub configuration files
├── .vscode/                      # VSCode configuration
├── .gitignore                    # Git ignore patterns
├── prettier.config.js            # Prettier configuration
├── .prettierignore               # Prettier ignore patterns
├── eslint.config.js              # ESLint configuration
├── manifest.json                 # Chrome Extension manifest configuration
├── package.json                  # Project settings
├── package-script.sh             # Build and development scripts
├── pnpm-lock.yaml                # Dependency lock file
├── tsconfig.json                 # TypeScript settings
├── webpack.config.ts             # Webpack configuration
├── postcss.config.js             # PostCSS configuration
├── tailwind.config.js            # Tailwind CSS configuration
├── jest.config.js                # Jest testing configuration
├── mise.toml                     # Development environment settings
├── TECHNOLOGSTACK.md             # Technology stack documentation
├── DIRECTORYSTRUCTURE.md         # Directory structure documentation
├── PRIVACY.md                    # Privacy policy documentation
├── LICENSE                       # License information
└── README.md                     # Project documentation

### Directory Descriptions

#### Source Code (`src/`)
- `components/`: Shared UI component implementations
- `constants/`: Constant values and configuration definitions (`Selectors.ts`: the DOM selectors of the pages the extension reads and writes, shared with the canary)
- `db/`: Database related implementations and migrations
- `features/`: Feature-specific implementations
  - `content/`: Content script feature implementation
    - `__fixtures__/`: Sanitized snapshots of live pages that injector and extractor tests run against, captured with `scripts/fixtures/`. The E2E tests serve them too
  - `offscreen/`: Offscreen feature implementation
  - `options/`: Options page feature implementation
  - `popup/`: Popup feature implementation
  - `serviceworker/`: Service Worker feature implementation
- `models/`: Data models and interfaces
- `pages/`: Page implementations
  - `Content.tsx`: Content script page implementation
  - `Offscreen.ts`: Offscreen page implementation
  - `Options.tsx`: Options page implementation
  - `Popup.tsx`: Popup page implementation
  - `ServiceWorker.ts`: Service Worker implementation
- `platform/`: Browser-specific implementations selected at build time by `__TARGET__` (settings panel, theme detection)
- `stores/`: State management implementations (Zustand)
- `styles/`: Global style definitions
- `types/`: TypeScript type definitions
- `utils/`: General utility functions

#### Configuration Files
- `prettier.config.js`: Prettier formatting rules
- `eslint.config.js`: ESLint configuration
- `tsconfig.json`: TypeScript compiler configuration
- `webpack.config.ts`: Webpack build configuration
- `postcss.config.js`: PostCSS configuration
- `tailwind.config.js`: Tailwind CSS configuration
- `jest.config.js`: Jest testing configuration

#### Build and Dependencies
- `build/`: Build-time scripts used by webpack (manifest transforms for development and Firefox builds)
- `scripts/`: Developer scripts, not part of the build (`fixtures/`: capturing page fixtures; `canary/`: the daily local check of the live pages against the selectors; see their READMEs; `visual.sh`: running the visual tests in the Playwright container)
- `e2e/`: end-to-end tests that load `dist/prod` and `dist/dev` into headless Chromium and, from `firefox/`, `dist/firefox-prod` and `dist/firefox-dev` into headless Firefox (`pnpm test:e2e`, after `pnpm build`, `pnpm start`, `pnpm build:firefox` and `pnpm start:firefox`); `pages/` holds the hand-written pages they open, `scenarios.ts` the data both browsers' specs share, and `fixture-server.ts` serves those pages and the captured fixtures at their real host names over local HTTPS, with a proxy for Firefox, so no request reaches a live site; `visual/` holds the screenshot tests of `dist/prod-e2e` and their baselines, run in Docker by `pnpm test:visual`
- `dist/`: Compiled output files (`dev` / `prod` for Chrome, `firefox-dev` / `firefox-prod` for Firefox, `prod-e2e` for the visual tests: a Chrome production build that keeps the test hooks, made by `pnpm build:e2e`)
- `public/`: Static assets
- `node_modules/`: Third-party dependencies
- `package.json`: Project metadata and dependencies
- `pnpm-lock.yaml`: Dependency version lock file
- `package-script.sh`: Build and development scripts

#### Documentation and Configuration
- `TECHNOLOGSTACK.md`: Technology stack specifications
- `DIRECTORYSTRUCTURE.md`: Directory structure guide
- `README.md`: Project overview and setup instructions
- `PRIVACY.md`: Privacy policy documentation
- `LICENSE`: Project license information
- `fastlane/`: Deployment automation configuration
- `.github/`: GitHub workflows and configuration
- `.vscode/`: VSCode editor configuration
```
