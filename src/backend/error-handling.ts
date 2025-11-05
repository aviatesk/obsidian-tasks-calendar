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
 * Central error handler function
 */
export default function handleError(
  error: unknown,
  context: string = ''
): void {
  if (error instanceof TaskValidationError) {
    // Task validation errors are expected and should be clearly explained to users
    new Notice(`${context}: ${error.message}`);
  } else if (error instanceof FileOperationError) {
    // File operation errors are also expected but relate to system issues
    new Notice(`${context}: ${error.message}`);
  } else {
    // unknown error
    // Log detailed information for debugging
    console.error('Unexpected error:', error);

    // Show a user-friendly message
    new Notice(
      `${context}. An unexpected error occurred. Check the console for details.`
    );
  }
}
