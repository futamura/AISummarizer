import { LogLevels as ConsolaLogLevels, createConsola } from 'consola';
import { Logger } from 'tslog';

export enum LogLevel {
  SILLY = 0,
  TRACE = 1,
  DEBUG = 2,
  INFO = 3,
  WARN = 4,
  ERROR = 5,
  FATAL = 6,
  SILENT = 7,
}

/* Suppress all logs in production; show DEBUG and above in development */
export const LOG_LEVEL = process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.SILENT;

const toConsolaLogLevel = (logLevel: LogLevel) => {
  switch (logLevel) {
    case LogLevel.SILLY:
      return ConsolaLogLevels.verbose;
    case LogLevel.TRACE:
      return ConsolaLogLevels.trace;
    case LogLevel.DEBUG:
      return ConsolaLogLevels.debug;
    case LogLevel.INFO:
      return ConsolaLogLevels.info;
    case LogLevel.WARN:
      return ConsolaLogLevels.warn;
    case LogLevel.ERROR:
    case LogLevel.FATAL:
      return ConsolaLogLevels.error;
    case LogLevel.SILENT:
      return ConsolaLogLevels.silent;
  }
};

const createLogger = (loggerType: 'tslog' | 'consola') => {
  if (loggerType === 'tslog') {
    /**
     * TSLogger
     * @reference https://github.com/fullstack-build/tslog
     */
    return new Logger({
      name: 'Free AI Summarizer',
      prettyLogTemplate: '{{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}} [{{name}}][{{fileNameWithLine}}] ',
      type: 'pretty',
      minLevel: LOG_LEVEL,
    });
  } else {
    /**
     * Consola
     * @reference https://github.com/unjs/consola
     */
    return createConsola({
      level: toConsolaLogLevel(LOG_LEVEL),
      formatOptions: {
        columns: 80,
        colors: true,
        compact: false,
        date: true,
      },
    });
  }
};

export const logger = createLogger('tslog');
