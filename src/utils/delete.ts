import { TFile, Vault } from "obsidian";
import { processFileLine } from "./file-operations";
import { TaskValidationError } from "./error-handling";

/**
 * Deletes a task from a file at the specified line
 *
 * @param vault Obsidian vault instance
 * @param filePath Path to the file containing the task
 * @param line Line number of the task to delete
 * @returns Promise resolving to true if the operation was successful
 * @throws FileOperationError if file operation fails
 */
export async function deleteTask(
  vault: Vault,
  file: TFile,
  line?: number
): Promise<boolean> {
  if (line === undefined || line < 0) {
    throw new TaskValidationError("Valid line number must be specified");
  }

  // Process the file to remove the task line
  const result = await processFileLine(vault, file, line, () => {
    // Return an empty string to remove the line
    return "";
  });

  return result.changed;
}
