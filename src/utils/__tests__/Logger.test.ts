import { LogLevel, logger } from '@/utils/Logger';

describe('logger', () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('uses error as the default log level', () => {
    expect(LogLevel.ERROR).toBe(5);
    expect(logger.debug('debug message')).toBeUndefined();
    expect(logger.warn('warn message')).toBeUndefined();

    expect(logger.error('error message')).toBeDefined();
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });
});
