import { LOG_LEVEL, logger, LogLevel } from '@/utils/Logger';

describe('logger', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('suppresses all logs outside development', () => {
    /* Jest runs with NODE_ENV=test, which is treated the same as production */
    expect(LOG_LEVEL).toBe(LogLevel.SILENT);
    expect(logger.debug('debug message')).toBeUndefined();
    expect(logger.warn('warn message')).toBeUndefined();
    expect(logger.error('error message')).toBeUndefined();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('logs DEBUG and above in development', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    jest.isolateModules(() => {
      /* Re-import so LOG_LEVEL is re-evaluated with the development env */
      /* eslint-disable-next-line @typescript-eslint/no-require-imports */
      const devModule = require('@/utils/Logger');
      expect(devModule.LOG_LEVEL).toBe(devModule.LogLevel.DEBUG);
      expect(devModule.logger.silly('silly message')).toBeUndefined();
      expect(devModule.logger.debug('debug message')).toBeDefined();
      expect(devModule.logger.error('error message')).toBeDefined();
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    });
    process.env.NODE_ENV = originalNodeEnv;
  });
});
