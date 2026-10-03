/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  /* e2e/ holds Playwright specs, run by pnpm test:e2e */
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
  globals: {
    __TARGET__: 'chrome',
    __E2E_HOOKS__: false,
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
};
