# Technology Stack

## Core Technologies

- TypeScript: ^5.8.3
- Node.js: 20 (pinned in mise.toml)
- React: ^18.2.0

## Frontend

- React for UI components
- Tailwind CSS: 3.4.1 for styling
- Floating UI (@floating-ui/react: ^0.27.13) for tooltips and popovers
- Headless UI (@headlessui/react: ^2.2.4) for accessible components
- React Window (^1.8.11) for virtualized lists
- Lucide React (^0.523.0) for icons
- React Icons (^5.5.0) for additional icons
- Heroicons (^2.2.0) for additional icons
- clsx (^2.1.1) for conditional class names

## Development Tools

### Code Quality

- ESLint: ^9.30.1
- Prettier: ^3.6.2
- TypeScript ESLint Parser: ^8.36.0
- Jest: ^29.7.0 (Testing Framework)
- ts-jest: ^29.4.0 (TypeScript support for Jest)

### Build System

- Webpack: ^5.100.0
- pnpm: 10.12.4
- ts-node: ^10.9.2
- ts-loader: ^9.5.2

### Styling

- Tailwind CSS: 3.4.1
- PostCSS: ^8.5.6
- Autoprefixer: ^10.4.21
- CSS Loader: ^7.1.2
- Style Loader: ^4.0.0
- Mini CSS Extract Plugin: ^2.9.2

### Type Definitions

- @types/node: ^20.19.6
- @types/react: ^18.3.23
- @types/react-dom: ^18.2.19
- @types/chrome: ^0.0.326
- @types/jest: ^29.5.14
- @types/uuid: ^10.0.0
- @types/html-webpack-plugin: ^3.2.9
- @types/react-window: ^1.8.8

## Dependencies

- @plasmohq/storage: ^1.3.0 (Chrome Extension Storage)
- zustand: ^5.0.6 (State Management)
- uuid: ^11.1.0
- tslog: ^4.9.3 (Logging)
- consola: ^3.4.2 (Console logging)
- idb: ^8.0.3 (IndexedDB wrapper)
- @mozilla/readability: ^0.6.0 (Article parsing)
- pdf-lib: ^1.17.1 (PDF manipulation)
- pdfjs-dist: ^5.3.93 (PDF parsing; worker bundled as pdf.worker.min.mjs)
- html-dom-parser: ^5.1.1 (HTML parsing)
- domhandler: ^5.0.3 (DOM manipulation)
- entities: ^6.0.1 (HTML entities)

## Development Environment

- VSCode
- Cursor IDE
- mise (Development environment manager)

## Implementation Rules

### Code Organization

- Modular component architecture
- Strict TypeScript type checking
- ESLint and Prettier for code style enforcement
- Chrome Extension best practices
- Jest for unit testing

### Build Process

- Webpack for bundling
- Optimized production builds
- Type checking and linting in CI/CD pipeline
- Automated testing in CI/CD pipeline

### Development Workflow

- Development mode with hot reloading
- Production build optimization
- Type checking and linting in CI/CD pipeline
- Automated deployment with Fastlane
