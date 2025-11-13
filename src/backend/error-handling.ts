import { Notice } from 'obsidian';
import type { Logger } from '../logging';

/**
 * Error thrown when task validation fails
 */
export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

/**
 * Error thrown when file operations fail
 */
export class FileOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileOperationError';
  }
}

/**
 * Central error handler function
 */
export default function handleError(
  error: unknown,
  context: string = '',
  logger: Logger
): void {
  if (error instanceof TaskValidationError) {
    new Notice(`${context}: ${error.message}`);
  } else if (error instanceof FileOperationError) {
    new Notice(`${context}: ${error.message}`);
  } else {
    logger.error(`${context}: ${error}`);
    new Notice(
      `${context}. An unexpected error occurred. Check the console for details.`
    );
  }
}
