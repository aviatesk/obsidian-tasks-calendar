import { App, Vault, TFile } from "obsidian";
import { FileOperationError } from "./error-handling";
import { ParsedTask } from "./parse";

/**
 * Ensures a directory exists, creating it and parent directories if needed
 */
export async function ensureDirectory(vault: Vault, dirPath: string): Promise<void> {
  const dirs = dirPath.split('/').filter(dir => dir.length > 0);
  let currentPath = '';

  try {
    for (const dir of dirs) {
      currentPath += (currentPath ? '/' : '') + dir;
      const exists = vault.getAbstractFileByPath(currentPath);
      if (!exists) {
        await vault.createFolder(currentPath);
      }
    }
  } catch (error) {
    throw new FileOperationError(`Failed to create directory ${currentPath}: ${error.message}`);
  }
}

/**
 * Process a specific line in a file
 *
 * @param vault Obsidian vault instance
 * @param file Target file
 * @param line Line number to process
 * @param processor Function that processes the line content
 * @returns Object containing processing results
 * @throws FileOperationError if file processing fails
 */
export async function processFileLine(
  vault: Vault,
  file: TFile,
  line: number,
  processor: (lineContent: string) => string
): Promise<{ original: string, updated: string, changed: boolean }> {
  let result = { original: "", updated: "", changed: false };

  await vault.process(file, (content) => {
    const lines = content.split('\n');

    if (line < 0 || line >= lines.length) {
      throw new FileOperationError(`Invalid line number: ${line}`);
    }

    result.original = lines[line];

    // The processor function may throw TaskValidationError
    result.updated = processor(lines[line]);

    result.changed = result.original !== result.updated;

    if (result.changed) {
      lines[line] = result.updated;
      return lines.join('\n');
    }

    return content; // Return unchanged content if no modifications were made
  });

  return result;
}

/**
 * Process all lines in a file with a line processor function
 */
export async function processFileLines<T>(
  vault: Vault,
  file: TFile,
  lineProcessor: (line: string, index: number) => { updatedLine?: string, result?: T, process: boolean }
): Promise<{ changed: boolean, results: T[] }> {
  let results: T[] = [];
  let changed = false;

  await vault.process(file, (content) => {
    const lines = content.split('\n');
    let newContent = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const processResult = lineProcessor(line, i);

      if (processResult.process) {
        if (processResult.updatedLine !== undefined) {
          newContent += processResult.updatedLine + '\n';
          if (processResult.updatedLine !== line) {
            changed = true;
          }
        } else {
          // If no updated line is provided but process is true, remove the line
          changed = true;
          continue;
        }

        if (processResult.result !== undefined) {
          results.push(processResult.result);
        }
      } else {
        newContent += line + '\n';
      }
    }

    return changed ? newContent.trimEnd() + '\n' : content;
  });

  return { changed, results };
}

/**
 * Process a file with a recurrence group filter
 */
export async function processRecurrenceGroup(
  vault: Vault,
  file: TFile,
  recurrenceId: string,
  taskProcessor: (task: ParsedTask, isParent: boolean) => { updatedTask?: ParsedTask, shouldProcess: boolean }
): Promise<{changed: boolean, foundParent: boolean}> {
  let changed = false;
  let foundParent = false;

  // Import here to avoid circular dependencies
  const { tryParseTask, reconstructTask } = require("./parse");
  const { getRecurrenceId, isRecurrenceParent } = require("./recurrence");

  await vault.process(file, (content) => {
    const lines = content.split('\n');
    let newContent = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let updatedLine = line;

      const task = tryParseTask(line);
      if (task) {
        const taskRecurrenceId = getRecurrenceId(task);

        if (taskRecurrenceId === recurrenceId) {
          const isParent = isRecurrenceParent(task);
          if (isParent) foundParent = true;

          const result = taskProcessor(task, isParent);

          if (result.shouldProcess && result.updatedTask) {
            updatedLine = reconstructTask(result.updatedTask);
            changed = true;
          }
        }
      }

      newContent += updatedLine + '\n';
    }

    return changed ? newContent.trimEnd() + '\n' : content;
  });

  return { changed, foundParent };
}

/**
 * Appends content to a file, creating it if it doesn't exist
 *
 * @param vault Obsidian vault instance
 * @param targetFilePath Path to the target file
 * @param content Content to append
 * @returns Whether the operation was successful
 * @throws FileOperationError if file operation fails
 */
export async function appendToFile(
  vault: Vault,
  targetFilePath: string,
  content: string
): Promise<boolean> {
  // Check if file exists first
  let file = vault.getAbstractFileByPath(targetFilePath);

  // Create file if it doesn't exist
  if (!file) {
    // Create necessary directories
    const folders = targetFilePath.split('/');
    if (folders.length > 1) {
      const dirPath = folders.slice(0, -1).join('/');
      await ensureDirectory(vault, dirPath);
    }

    // Create the file
    file = await vault.create(targetFilePath, '');
  }

  // Verify file is valid
  if (!(file instanceof TFile)) {
    throw new FileOperationError(`${targetFilePath} is not a valid file`);
  }

  // Using process for appending content
  await vault.process(file, (fileContent) => {
    return fileContent + content;
  });

  return true;
}

/**
 * Renames a file with proper error handling
 *
 * @param app Obsidian app instance
 * @param file File to rename
 * @param newName New file name (without extension)
 * @throws FileOperationError if file operation fails
 */
export async function renameFile(
  app: App,
  file: TFile,
  newName: string
) {
  // Get the file extension
  const extension = file.extension;
  // Get the parent path
  const parentPath = file.parent ? file.parent.path + '/' : '';
  // Create the new path
  const newPath = `${parentPath}${newName}.${extension}`;
  if (file.path == newPath)
    return undefined;
  await app.fileManager.renameFile(file, newPath);
  return file.path;
}
