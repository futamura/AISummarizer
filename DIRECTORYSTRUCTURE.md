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
│   ├── stores/                   # State management (Zustand)
│   ├── styles/                   # Global styles
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utility functions
├── public/                       # Static assets
├── dist/                         # Output directory
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
- `constants/`: Constant values and configuration definitions
- `db/`: Database related implementations and migrations
- `features/`: Feature-specific implementations
  - `content/`: Content script feature implementation
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
- `dist/`: Compiled output files
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
