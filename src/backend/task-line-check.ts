import { StaleTaskError } from './error-handling';

/**
 * Mirrors the pattern Dataview uses to extract the text of a list item, so
 * that the text of a line in a file is comparable to the indexed task text.
 * Unlike that pattern, it requires a checkbox, since only tasks are modified.
 */
const TASK_LINE_PATTERN = /^[\s>]*(?:\d+\.|\d+\)|\*|-|\+)\s*\[.\]\s*(.*)$/mu;

/**
 * Reduces a task text to the part that stays the same when the calendar
 * updates the task, i.e. everything but its properties, tags and spacing.
 */
function getTaskTextFingerprint(taskText: string): string {
  return taskText
    .replace(/\[[^[\]:]+::[^\]]*\]/g, ' ')
    .replace(/#[\w\p{L}/\-_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verifies that the given line still holds the task with the given text.
 *
 * The line number of a task comes from the Dataview index, which lags behind
 * the file. When lines are inserted or removed in the meantime, that line
 * number points to another line, which must not be modified.
 *
 * @throws StaleTaskError if the line holds something else
 */
export function assertTaskLineMatches(
  lineContent: string,
  expectedTaskText: string
): void {
  const lineText = TASK_LINE_PATTERN.exec(lineContent)?.[1];
  if (
    lineText === undefined ||
    getTaskTextFingerprint(lineText) !==
      getTaskTextFingerprint(expectedTaskText)
  ) {
    throw new StaleTaskError();
  }
}
