import { TFile, Vault } from "obsidian";

/**
 * Ensures a directory exists, creating it and parent directories if needed
 */
export async function ensureDirectory(vault: Vault, dirPath: string): Promise<void> {
  const dirs = dirPath.split('/').filter(dir => dir.length > 0);
  let currentPath = '';

  for (const dir of dirs) {
    currentPath += (currentPath ? '/' : '') + dir;
    const exists = vault.getAbstractFileByPath(currentPath);
    if (!exists) {
      await vault.createFolder(currentPath);
    }
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
      throw new Error(`Invalid line number: ${line}`);
    }

    result.original = lines[line];
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
 * Appends content to a file, creating it if it doesn't exist
 *
 * @param vault Obsidian vault instance
 * @param targetFilePath Path to the target file
 * @param content Content to append
 * @returns Whether the operation was successful
 */
export async function appendToFile(
  vault: Vault,
  targetFilePath: string,
  content: string
): Promise<boolean> {
  try {
    // Check if file exists first
    let file = vault.getAbstractFileByPath(targetFilePath);

    // Create file if it doesn't exist
    if (!file) {
      try {
        // Create necessary directories
        const folders = targetFilePath.split('/');
        if (folders.length > 1) {
          const dirPath = folders.slice(0, -1).join('/');
          await ensureDirectory(vault, dirPath);
        }

        // Create the file
        file = await vault.create(targetFilePath, '');
      } catch (error) {
        console.error("Failed to create file:", error);
        return false;
      }
    }

    // Verify file is valid
    if (!(file instanceof TFile)) {
      console.error(`${targetFilePath} is not a valid file`);
      return false;
    }

    // Using process for appending content
    await vault.process(file, (fileContent) => {
      return fileContent + content;
    });

    return true;
  } catch (error) {
    console.error("Error appending to file:", error);
    return false;
  }
}
