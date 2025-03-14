import { Vault, TFile } from 'obsidian';

/**
 * Task status options
 * value: actual status character used in markdown
 * label: name displayed in UI
 */
export const STATUS_OPTIONS = [
  { value: ' ', label: 'Incomplete' },
  { value: '/', label: 'In Progress' },
  { value: 'x', label: 'Complete' },
  { value: 'X', label: 'Complete' },  // Capital X also treated as "Complete"
  { value: '-', label: 'Cancelled' },
  { value: '>', label: 'Deferred' },
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
  // Read file content
  const content = await vault.read(file);
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

  // Update status
  lines[line] = taskLine.replace(/^\s*- \[.\]/, `- [${newStatus}]`);

  // Write back to file
  await vault.modify(file, lines.join('\n'));
}

export default updateTaskStatus;
