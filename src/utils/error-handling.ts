import { Notice } from 'obsidian';

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
 * Error thrown for unexpected internal errors
 */
export class InternalError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'InternalError';

    // Preserve stack trace
    if (originalError && originalError.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
    }
  }
}

/**
 * Central error handler function
 */
export default function handleError(error: unknown, context: string = ""): void {
  if (error instanceof TaskValidationError) {
    // Task validation errors are expected and should be clearly explained to users
    new Notice(`${context}: ${error.message}`);
  } else if (error instanceof FileOperationError) {
    // File operation errors are also expected but relate to system issues
    new Notice(`${context}: ${error.message}`);
  } else {
    // Log detailed information for debugging
    console.error('Unexpected error:', error);

    // Show a user-friendly message
    new Notice(`${context}. An unexpected error occurred. Check the console for details.`);
  }
}
