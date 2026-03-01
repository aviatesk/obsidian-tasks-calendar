import {
  Circle,
  CircleChevronRight,
  CircleSlash,
  CircleMinus,
  CircleAlert,
  CircleHelp,
  CircleCheck,
} from 'lucide-react';

/**
 * Interface defining a task status option
 */
export interface TaskStatusOption {
  value: string; // The actual status character
  label: string; // Display name
  prop?: string; // Property name to add (optional)
  preserveOldProp?: boolean; // Whether to preserve old properties when changing to this status
}

/**
 * Task status options
 */
export const STATUS_OPTIONS: TaskStatusOption[] = [
  { value: ' ', label: 'Incomplete' },
  { value: '/', label: 'In Progress' },
  { value: 'x', label: 'Completed', prop: 'completion' }, // use "completion" since "completed" is preserved for dataview task data structure
  { value: 'X', label: 'Done', prop: 'completion' }, // `X` also treated as "Complete"
  { value: '-', label: 'Cancelled', prop: 'cancelled' },
  { value: '>', label: 'Deferred', prop: 'deferred', preserveOldProp: true },
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
export const DROPDOWN_STATUS_OPTIONS = STATUS_OPTIONS.filter(
  (option, index) =>
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
export const getStatusIcon = (status: string | null | undefined) => {
  switch ((status ?? '').trim().toLowerCase()) {
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
