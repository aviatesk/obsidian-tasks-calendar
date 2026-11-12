import { TaskValidationError } from './error-handling';

interface TextSegment {
  type: 'text';
  text: string;
}

interface TagSegment {
  type: 'tag';
  text: string;
}

interface PropertySegment {
  type: 'property';
  text: string;
  name: string;
  value: string;
}

type TaskSegment = TextSegment | TagSegment | PropertySegment;

/**
 * Represents different parts of a parsed task
 */
export interface ParsedTask {
  linePrefix: string; // Blockquote markers and whitespace before the list marker
  listMarker: string; // The type of list marker (-, *, +, 1., etc.)
  status: string; // The character in the checkbox
  content: string; // The main task text, i.e. the first run of plain text
  segments: TaskSegment[]; // Everything between the checkbox and the block reference, in its original order
  blockReference: string; // Block reference (^abc123)
}

// The line prefix covers blockquote markers (for tasks inside blockquotes and
// callouts) as well as indentation, including tab characters
const CHECKBOX_PATTERN = /^((?:[ \t]*>)*[ \t]*)([-*+]|\d+\.)\s+\[(.)\]\s*/;
const PROPERTY_PATTERN = /\[([^[\]:]+)::\s*([^\]]*)\]/g;
const TAG_PATTERN = /#[\w\p{L}/\-_]+/gu;
const BLOCK_REFERENCE_PATTERN = /\s*(\^\w+)\s*$/;

function isBlank(text: string): boolean {
  return text.trim() === '';
}

function isPropertyNamed(
  segment: TaskSegment,
  name: string
): segment is PropertySegment {
  return segment.type === 'property' && segment.name === name;
}

/**
 * Splits the text of a task into its tags, properties, and the text around
 * them. Joining the text of the segments yields the given text again.
 */
function splitIntoSegments(text: string): TaskSegment[] {
  const properties = [...text.matchAll(PROPERTY_PATTERN)].map(match => ({
    start: match.index,
    segment: {
      type: 'property' as const,
      text: match[0],
      name: match[1].trim(),
      value: match[2].trim(),
    },
  }));
  const tags = [...text.matchAll(TAG_PATTERN)]
    .filter(
      match =>
        !properties.some(
          ({ start, segment }) =>
            match.index >= start && match.index < start + segment.text.length
        )
    )
    .map(match => ({
      start: match.index,
      segment: { type: 'tag' as const, text: match[0] },
    }));
  const elements = [...properties, ...tags].sort((a, b) => a.start - b.start);

  const segments: TaskSegment[] = [];
  let position = 0;
  for (const { start, segment } of elements) {
    if (start > position) {
      segments.push({ type: 'text', text: text.slice(position, start) });
    }
    segments.push(segment);
    position = start + segment.text.length;
  }
  if (position < text.length) {
    segments.push({ type: 'text', text: text.slice(position) });
  }
  return segments;
}

function findContentSegment(segments: TaskSegment[]): TextSegment | undefined {
  return segments.find(
    (segment): segment is TextSegment =>
      segment.type === 'text' && !isBlank(segment.text)
  );
}

/**
 * Parse a task line into its components
 *
 * @param taskLine Full task line from file
 * @returns A parsed task object
 * @throws TaskValidationError if parsing fails
 */
export function parseTask(taskLine: string): ParsedTask {
  if (!taskLine) {
    throw new TaskValidationError('Task line is empty or undefined');
  }

  const checkboxMatch = taskLine.match(CHECKBOX_PATTERN);
  if (!checkboxMatch) {
    throw new TaskValidationError(
      "Invalid task format: Line must start with a list marker followed by '[ ]'"
    );
  }

  let remainingText = taskLine.slice(checkboxMatch[0].length);

  let blockReference = '';
  const blockReferenceMatch = remainingText.match(BLOCK_REFERENCE_PATTERN);
  if (blockReferenceMatch) {
    blockReference = blockReferenceMatch[1];
    remainingText = remainingText.slice(
      0,
      remainingText.length - blockReferenceMatch[0].length
    );
  }

  const segments = splitIntoSegments(remainingText);

  return {
    linePrefix: checkboxMatch[1],
    listMarker: checkboxMatch[2],
    status: checkboxMatch[3],
    content: findContentSegment(segments)?.text.trim() ?? '',
    segments,
    blockReference,
  };
}

/**
 * Check if text contains embedded tags that would be broken
 * if merged with other content
 *
 * @param text The text to check
 * @returns Whether the text contains potential broken tags
 */
export function hasEmbeddedTags(text: string): boolean {
  // Look for patterns like "text#tag" where a tag isn't separated by space
  const embeddedTagPattern = /[^\s#]#[\w\p{L}/\-_]+/u;
  return embeddedTagPattern.test(text);
}

/**
 * Returns the runs of plain text of a task. A task has more than one of them
 * when its text is interrupted by tags or properties.
 */
export function getContentFragments(task: ParsedTask): string[] {
  return task.segments
    .filter(segment => segment.type === 'text' && !isBlank(segment.text))
    .map(segment => segment.text.trim());
}

function replaceSegmentText(text: string, replacement: string): string {
  const leadingWhitespace = /^\s*/.exec(text)?.[0] ?? '';
  const trailingWhitespace = /\s*$/.exec(text)?.[0] ?? '';
  if (!replacement) return leadingWhitespace || trailingWhitespace ? ' ' : '';
  return leadingWhitespace + replacement + trailingWhitespace;
}

function appendWithSpace(text: string, appended: string): string {
  return [text.trimEnd(), appended].filter(Boolean).join(' ');
}

/**
 * Reconstructs a task string from parsed components. Everything that has not
 * been modified since the task was parsed is written back as it was.
 *
 * @param task The parsed task object
 * @returns A full task string
 */
export function reconstructTask(task: ParsedTask): string {
  const contentSegment = findContentSegment(task.segments);

  let body = task.segments
    .map(segment =>
      segment === contentSegment
        ? replaceSegmentText(segment.text, task.content.trim())
        : segment.text
    )
    .join('');

  if (!contentSegment && task.content.trim()) {
    body = appendWithSpace(body, task.content.trim());
  }
  if (task.blockReference) {
    body = appendWithSpace(body, task.blockReference);
  }

  return `${task.linePrefix}${task.listMarker} [${task.status}] ${body.trim()}`.trimEnd();
}

/**
 * Creates a copy of a ParsedTask with all collections properly cloned
 *
 * @param task The task to clone
 * @returns A deep copy of the task
 */
export function cloneTask(task: ParsedTask): ParsedTask {
  return {
    ...task,
    segments: task.segments.map(segment => ({ ...segment })),
  };
}

/**
 * Extract property from a task with the given key
 *
 * @param task The parsed task
 * @param key Property name to look for
 * @returns Property value or undefined if not found
 */
export function getTaskProperty(
  task: ParsedTask,
  key: string
): string | undefined {
  return task.segments.find(segment => isPropertyNamed(segment, key))?.value;
}

/**
 * Removes the segments selected by `shouldRemove`, and tidies up the spacing
 * around each of them: the whitespace on both sides is reduced to the one in
 * front, and neighbors that had no whitespace in between are kept apart.
 */
function removeSegments(
  segments: TaskSegment[],
  shouldRemove: (segment: TaskSegment, index: number) => boolean
): TaskSegment[] {
  const kept: TaskSegment[] = [];
  let hasJustRemoved = false;

  segments.forEach((segment, index) => {
    if (shouldRemove(segment, index)) {
      hasJustRemoved = true;
      return;
    }

    if (hasJustRemoved) {
      const previous = kept[kept.length - 1];
      const followsWhitespace = !previous || /\s$/.test(previous.text);
      if (followsWhitespace && segment.type === 'text') {
        const text = segment.text.trimStart();
        if (!text) return;
        kept.push({ ...segment, text });
        hasJustRemoved = false;
        return;
      }
      if (!followsWhitespace && !/^\s/.test(segment.text)) {
        kept.push({ type: 'text', text: ' ' });
      }
    }

    kept.push(segment);
    hasJustRemoved = false;
  });

  return kept;
}

/**
 * Sets a property on a task. An existing property is updated in place, and a
 * new one is added after everything else. Further occurrences of an existing
 * property are removed, so that the task ends up with the given value only.
 *
 * @param task The parsed task
 * @param key Property name
 * @param value Property value
 * @returns Updated task
 */
export function setTaskProperty(
  task: ParsedTask,
  key: string,
  value: string
): ParsedTask {
  const property: PropertySegment = {
    type: 'property',
    text: `[${key}:: ${value}]`,
    name: key,
    value,
  };

  const index = task.segments.findIndex(segment =>
    isPropertyNamed(segment, key)
  );
  if (index >= 0) {
    const segments = removeSegments(
      task.segments,
      (segment, i) => i > index && isPropertyNamed(segment, key)
    );
    segments[index] = property;
    return { ...task, segments };
  }

  const lastSegment = task.segments[task.segments.length - 1];
  const separator: TaskSegment[] =
    lastSegment && !/\s$/.test(lastSegment.text)
      ? [{ type: 'text', text: ' ' }]
      : [];
  return { ...task, segments: [...task.segments, ...separator, property] };
}

/**
 * Removes a property from a task
 *
 * @param task The parsed task
 * @param key Property name to remove
 * @returns Updated task
 */
export function removeTaskProperty(task: ParsedTask, key: string): ParsedTask {
  return {
    ...task,
    segments: removeSegments(task.segments, segment =>
      isPropertyNamed(segment, key)
    ),
  };
}
