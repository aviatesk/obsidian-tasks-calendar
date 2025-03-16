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
    await vault.process(file, (content) => {
      const lines = content.split('\n');

      // Check if line number is valid
      if (line < 0 || line >= lines.length) {
        throw new Error(`Invalid line number: ${line}`);
      }

      const taskLine = lines[line];

      // Verify line contains a task
      if (!taskLine.match(/^\s*- \[.\]/)) {
        throw new Error(`Line ${line} is not a valid task`);
      }

      // Get current status from task line
      const currentStatusMatch = taskLine.match(/^\s*- \[(.)\]/);
      const currentStatus = currentStatusMatch ? currentStatusMatch[1] : ' ';

      // Find status properties for old and new status
      const oldStatusOption = STATUS_OPTIONS.find(option => option.value === currentStatus);
      const newStatusOption = STATUS_OPTIONS.find(option => option.value === newStatus);

      const oldProp = oldStatusOption?.prop;
      const newProp = newStatusOption?.prop;

      // Update status in the task marker
      let updatedLine = taskLine.replace(/^\s*- \[.\]/, `- [${newStatus}]`);

      // Only remove old property if:
      // 1. It exists
      // 2. It's different from the new property
      // 3. The new status does NOT have preserveOldProp set to true
      if (oldProp && oldProp !== newProp && newStatusOption?.preserveOldProp !== true) {
        const oldPropertyRegex = new RegExp(`\\s*\\[${oldProp}::\\s*[^\\]]*\\]`);
        updatedLine = updatedLine.replace(oldPropertyRegex, '');
      }

      // Add new property if needed
      if (newProp) {
        const currentDate = getCurrentDateFormatted();
        const newPropertyText = ` [${newProp}:: ${currentDate}]`;

        // Check if property already exists
        const propertyRegex = new RegExp(`\\[${newProp}::\\s*[^\\]]*\\]`);
        if (!propertyRegex.test(updatedLine)) {
          updatedLine += newPropertyText;
        }
      }

      // Only update the line if there was a change
      if (updatedLine !== taskLine) {
        lines[line] = updatedLine;
        return lines.join('\n');
      }

      // Return original content if no changes were made
      return content;
    });
  } catch (error) {
    console.error("Error updating task status:", error);
    new Notice(`Failed to update task status: ${error.message}`);
    throw error;
  }
}

export default updateTaskStatus;
