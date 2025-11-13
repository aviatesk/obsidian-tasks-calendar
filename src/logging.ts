/**
 * Logger interface with component-prefixed logging methods
 */
export interface Logger {
  log: (msg: string) => void;
  error: (msg: string) => void;
  warn: (msg: string) => void;
}

/**
 * Creates a logger instance with automatic component name prefixing
 * All log messages are formatted as `[TasksCalendar.ComponentName] message`
 *
 * @param componentName - Name of the component for log prefixes
 * @returns Logger instance with log, error, and warn methods
 *
 * @example
 * ```typescript
 * const logger = createLogger('MyComponent');
 * logger.log('Initialized');  // Output: [TasksCalendar.MyComponent] Initialized
 * logger.error('Failed to load'); // Output: [TasksCalendar.MyComponent] Failed to load
 * ```
 */
export function createLogger(componentName: string): Logger {
  const prefix = `[TasksCalendar.${componentName}]`;
  return {
    log: (msg: string) => console.log(`${prefix} ${msg}`),
    error: (msg: string) => console.error(`${prefix} ${msg}`),
    warn: (msg: string) => console.warn(`${prefix} ${msg}`),
  };
}
