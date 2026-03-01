export type LogLevel = 'error' | 'warn' | 'log';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  log: 2,
};

let currentLevel: LogLevel = 'warn';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export interface Logger {
  log: (msg: string) => void;
  error: (msg: string) => void;
  warn: (msg: string) => void;
}

export function createLogger(componentName: string): Logger {
  const prefix = `[TasksCalendar.${componentName}]`;
  return {
    log: (msg: string) => {
      if (LOG_LEVEL_PRIORITY[currentLevel] >= LOG_LEVEL_PRIORITY['log'])
        console.log(`${prefix} ${msg}`);
    },
    warn: (msg: string) => {
      if (LOG_LEVEL_PRIORITY[currentLevel] >= LOG_LEVEL_PRIORITY['warn'])
        console.warn(`${prefix} ${msg}`);
    },
    error: (msg: string) => {
      console.error(`${prefix} ${msg}`);
    },
  };
}
