import { Notice, Vault, TFile } from 'obsidian';
import {
  Circle,
  CircleChevronRight,
  CircleSlash,
  CircleMinus,
  CircleAlert,
  CircleHelp,
  CircleCheck
} from 'lucide-react';
import { getCurrentDateFormatted } from './update';
import {
  parseTask,
  reconstructTask,
  updateTaskStatus as updateTaskStatusInParser,
  setTaskProperty
} from './parse';

/**
 * Interface defining a task status option
 */
export interface TaskStatusOption {
  value: string;        // The actual status character
  label: string;        // Display name
  prop?: string;        // Property name to add (optional)
  preserveOldProp?: boolean; // Whether to preserve old properties when changing to this status
}

/**
 * Task status options
 */
export const STATUS_OPTIONS: TaskStatusOption[] = [
  { value: ' ', label: 'Incomplete' },
  { value: '/', label: 'In Progress' },
  { value: 'x', label: 'Completed', prop: "completion" },
  { value: 'X', label: 'Completed', prop: "completion" },  // Capital X also treated as "Complete"
  { value: '-', label: 'Cancelled', prop: "cancelled" },
  { value: '>', label: 'Deferred', prop: "deferred", preserveOldProp: true },
  { value: '!', label: 'Important' },
  { value: '?', label: 'Question' },
];

// Create a map of unique statuses for performance
const STATUS_MAP = new Map<string, string[]>();
STATUS_OPTIONS.forEach(option => {
  const existing = STATUS_MAP.get(option.label) || [];
  existing.push(option.value);
  STATUS_MAP.set(option.label, existing);
});

/**
 * Status options for dropdown - with duplicates removed
 */
export const DROPDOWN_STATUS_OPTIONS = STATUS_OPTIONS.filter((option, index) =>
  STATUS_OPTIONS.findIndex(o => o.label === option.label) === index
);

/**
 * Convert status character to display name
 */
export function formatStatus(status?: string): string {
  // If undefined or null, treat as Incomplete
  if (status === undefined || status === null) {
    return 'Incomplete';
  }

  // Empty or space characters are also treated as Incomplete
  const trimmedStatus = status.trim();
  if (trimmedStatus === '' || trimmedStatus === ' ') {
    return 'Incomplete';
  }

  // Use cache to speed up status lookups
  for (const option of STATUS_OPTIONS) {
    if (option.value === trimmedStatus) {
      return option.label;
    }
  }

  return status;
}

// Add a new function to get the appropriate icon component for a status
export const getStatusIcon = (status: string) => {
  switch (status.trim().toLowerCase()) {
    case '':
    case ' ':
      return Circle; // Todo/Not started
    case 'x':
      return CircleCheck; // Complete/Done
    case '/':
      return CircleSlash; // In Progress
    case '-':
      return CircleMinus; // Cancelled
    case '>':
      return CircleChevronRight; // Forwarded/Deferred
    case '!':
      return CircleAlert; // Important/Urgent
    case '?':
      return CircleHelp; // Question/Maybe
    default:
      return Circle; // Default icon
  }
};

/**
 * Update task status in Obsidian document
 *
 * @param vault Obsidian vault instance
 * @param file Target file
 * @param line Line number of the task
 * @param newStatus New status value
 */
export async function updateTaskStatus(
  vault: Vault,
  file: TFile,
  line: number,
  newStatus: string
): Promise<void> {
  try {
    const content = await vault.read(file);
    const lines = content.split('\n');

    // Check if line number is valid
    if (line < 0 || line >= lines.length) {
      throw new Error(`Invalid line number: ${line}`);
    }

    const taskLine = lines[line];

    // Parse the task using our new parser
    const parsedTask = parseTask(taskLine);

    // Verify line contains a valid task
    if (!parsedTask) {
      throw new Error(`Line ${line} is not a valid task`);
    }

    // Get the current status and find options
    const currentStatus = parsedTask.status;
    const oldStatusOption = STATUS_OPTIONS.find(option => option.value === currentStatus);
    const newStatusOption = STATUS_OPTIONS.find(option => option.value === newStatus);

    const oldProp = oldStatusOption?.prop;
    const newProp = newStatusOption?.prop;

    // Update the task status
    let updatedTask = updateTaskStatusInParser(parsedTask, newStatus);

    // Only remove old property if:
    // 1. It exists
    // 2. It's different from the new property
    // 3. The new status does NOT have preserveOldProp set to true
    if (oldProp && oldProp !== newProp && newStatusOption?.preserveOldProp !== true) {
      // Remove old property using our helper function
      if (updatedTask.propertiesBeforeContent.has(oldProp)) {
        updatedTask.propertiesBeforeContent.delete(oldProp);
      }
      if (updatedTask.propertiesAfterContent.has(oldProp)) {
        updatedTask.propertiesAfterContent.delete(oldProp);
      }
    }

    // Add new property if needed
    if (newProp) {
      const currentDate = getCurrentDateFormatted();
      updatedTask = setTaskProperty(updatedTask, newProp, currentDate);
    }

    // Reconstruct the task line
    const updatedLine = reconstructTask(updatedTask);

    // Only update the line if there was a change
    if (updatedLine !== taskLine) {
      lines[line] = updatedLine;
      await vault.modify(file, lines.join('\n'));
    }
  } catch (error) {
    console.error("Error updating task status:", error);
    new Notice(`Failed to update task status: ${error.message}`);
    throw error;
  }
}

export default updateTaskStatus;
