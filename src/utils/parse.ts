import { TaskValidationError } from './error-handling';

/**
 * Represents different parts of a parsed task
 */
export interface ParsedTask {
  leadingWhitespace: string;       // Whitespace before the list marker
  checkboxPrefix: string;          // The full prefix including list marker and checkbox
  status: string;                  // The character in the checkbox
  tagsBeforeContent: string[];     // Tags before content (#TODO, etc.)
  propertiesBeforeContent: Map<string, string>; // Properties before content
  content: string;                 // The main task text
  tagsAfterContent: string[];      // Tags after content
  propertiesAfterContent: Map<string, string>; // Properties after content
  blockReference: string;          // Block reference (^abc123)
  listMarker: string;              // The type of list marker (-, *, +, 1., etc.)
}

// Define interfaces for element types
interface TagElement {
  type: 'tag';
  start: number;
  end: number;
  tag: string;
}

interface PropertyElement {
  type: 'property';
  start: number;
  end: number;
  name: string;
  value: string;
}

type TaskElement = TagElement | PropertyElement;

/**
 * Parse a task line into its components
 *
 * @param taskLine Full task line from file
 * @returns A parsed task object
 * @throws TaskValidationError if parsing fails
 */
export function parseTask(taskLine: string): ParsedTask {
  // If this is null, the function might not be called with a task line
  if (!taskLine) {
    throw new TaskValidationError("Task line is empty or undefined");
  }

  // Define regex patterns for different components
  // Updated to explicitly handle tab characters in leading whitespace
  const checkboxPattern = /^([ \t]*)([-*+]|\d+\.)\s+\[(.)\]\s*/;
  const propertyPattern = /\[([^:]+)::\s*([^\]]*)\]/g;
  const tagPattern = /#[\w\p{L}/\-_]+/gu;
  const blockRefPattern = /\s*(\^\w+)\s*$/;

  // Start with default structure
  const result: ParsedTask = {
    leadingWhitespace: "",         // New property for whitespace
    checkboxPrefix: "",
    status: " ",  // Default to incomplete
    tagsBeforeContent: [],
    propertiesBeforeContent: new Map(),
    content: "",
    tagsAfterContent: [],
    propertiesAfterContent: new Map(),
    blockReference: "",
    listMarker: "-"  // Default list marker
  };

  // Extract checkbox prefix
  const checkboxMatch = taskLine.match(checkboxPattern);
  if (!checkboxMatch) {
    // Not a task, fail parsing
    throw new TaskValidationError("Invalid task format: Line must start with a list marker followed by '[ ]'");
  }

  // Explicitly preserve tab characters in the leading whitespace
  result.leadingWhitespace = checkboxMatch[1]; // Store leading whitespace with tabs preserved
  result.listMarker = checkboxMatch[2]; // Extract the list marker type
  result.status = checkboxMatch[3]; // Extract the status character
  result.checkboxPrefix = checkboxMatch[0].substring(checkboxMatch[1].length); // Prefix without leading whitespace
  let remainingText = taskLine.slice(checkboxMatch[0].length);

  // Extract block reference from the end if present
  const blockRefMatch = remainingText.match(blockRefPattern);
  if (blockRefMatch) {
    result.blockReference = blockRefMatch[1];
    remainingText = remainingText.slice(0, remainingText.length - blockRefMatch[0].length);
  }

  // Collect all property matches and their positions
  const propertyMatches: {start: number, end: number, name: string, value: string}[] = [];
  let match;
  while ((match = propertyPattern.exec(remainingText)) !== null) {
    propertyMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      name: match[1].trim(),
      value: match[2].trim()
    });
  }

  // Collect all tag matches and their positions
  const tagMatches: {start: number, end: number, tag: string}[] = [];
  while ((match = tagPattern.exec(remainingText)) !== null) {
    // Skip tags inside property values
    let insideProperty = false;
    for (const prop of propertyMatches) {
      if (match.index >= prop.start && match.index < prop.end) {
        insideProperty = true;
        break;
      }
    }

    if (!insideProperty) {
      tagMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        tag: match[0]
      });
    }
  }

  // Sort all properties and tags by position
  const allElements: TaskElement[] = [
    ...propertyMatches.map(p => ({ type: 'property' as const, ...p })),
    ...tagMatches.map(t => ({ type: 'tag' as const, ...t }))
  ].sort((a, b) => a.start - b.start);

  // Find the first non-property, non-tag text segment that can be considered content
  let contentStartIndex = 0;
  let contentEndIndex = remainingText.length;
  let foundContentStart = false;

  // If there are no elements, the entire text is content
  if (allElements.length === 0) {
    result.content = remainingText.trim();
    return result;
  }

  // Find text segments and determine content boundaries
  let lastEndIndex = 0;
  let beforeContentPhase = true;

  for (let i = 0; i < allElements.length; i++) {
    const element = allElements[i];

    // Check if there's text before this element
    if (element.start > lastEndIndex) {
      const textSegment = remainingText.substring(lastEndIndex, element.start).trim();
      if (textSegment && !foundContentStart) {
        // This is the first significant text segment - it's our content start
        contentStartIndex = lastEndIndex;
        foundContentStart = true;
        beforeContentPhase = false;
      }
    }

    // Process the element based on current phase
    if (beforeContentPhase) {
      if (element.type === 'tag') {
        result.tagsBeforeContent.push(element.tag);
      } else if (element.type === 'property') {
        result.propertiesBeforeContent.set(element.name, element.value);
      }
    } else {
      if (element.type === 'tag') {
        result.tagsAfterContent.push(element.tag);
      } else if (element.type === 'property') {
        result.propertiesAfterContent.set(element.name, element.value);
      }

      // If we find an element after content started, update the content end boundary
      if (foundContentStart && element.start > contentStartIndex) {
        contentEndIndex = Math.min(contentEndIndex, element.start);
      }
    }

    lastEndIndex = element.end;
  }

  // If no content was identified yet, but there's text after the last element
  if (!foundContentStart && lastEndIndex < remainingText.length) {
    const textSegment = remainingText.substring(lastEndIndex).trim();
    if (textSegment) {
      contentStartIndex = lastEndIndex;
      contentEndIndex = remainingText.length;
      foundContentStart = true;
    }
  }

  // Extract the content using the identified boundaries
  if (foundContentStart) {
    result.content = remainingText.substring(contentStartIndex, contentEndIndex).trim();
  } else {
    // Handle case where there's no clear content (just tags and properties)
    // In this case, we'll use an empty content string
    result.content = "";
  }

  return result;
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
 * Ensures text doesn't break tag formatting when combined with existing tags
 *
 * @param text The text content to sanitize
 * @returns Sanitized text with proper spacing
 */
export function sanitizeContentForTags(text: string): string {
  if (!text) return text;

  // Add space after content if it ends with a character that might merge with a tag
  if (/[^\s]$/.test(text)) {
    return text + ' ';
  }

  return text;
}

/**
 * Finds potential content fragments scattered throughout a task line
 *
 * @param parsedTask The parsed task object
 * @param taskLine The full task line text
 * @returns Array of content fragments with their positions
 */
export function findContentFragments(parsedTask: ParsedTask, taskLine: string): {text: string, start: number, end: number}[] {
  const fragments: {text: string, start: number, end: number}[] = [];

  // Remove the checkbox prefix for analysis
  const checkboxLength = parsedTask.checkboxPrefix.length;
  const lineWithoutCheckbox = taskLine.slice(checkboxLength);

  // Skip if we already have a well-defined content
  if (parsedTask.content && parsedTask.content.length > 0) {
    const startPos = taskLine.indexOf(parsedTask.content, checkboxLength);
    if (startPos > -1) {
      fragments.push({
        text: parsedTask.content,
        start: startPos,
        end: startPos + parsedTask.content.length
      });
    }
    return fragments;
  }

  // Create a mask of positions that are part of tags, properties, or block references
  const maskedPositions = new Array(lineWithoutCheckbox.length).fill(false);

  // Mark tag positions
  [...parsedTask.tagsBeforeContent, ...parsedTask.tagsAfterContent].forEach(tag => {
    const tagIndex = lineWithoutCheckbox.indexOf(tag);
    if (tagIndex >= 0) {
      for (let i = tagIndex; i < tagIndex + tag.length; i++) {
        maskedPositions[i] = true;
      }
    }
  });

  // Mark property positions
  const allProperties = new Map([
    ...parsedTask.propertiesBeforeContent.entries(),
    ...parsedTask.propertiesAfterContent.entries()
  ]);

  allProperties.forEach((value, name) => {
    const propertyStr = `[${name}:: ${value}]`;
    const propIndex = lineWithoutCheckbox.indexOf(propertyStr);
    if (propIndex >= 0) {
      for (let i = propIndex; i < propIndex + propertyStr.length; i++) {
        maskedPositions[i] = true;
      }
    }
  });

  // Mark block reference positions
  if (parsedTask.blockReference) {
    const refIndex = lineWithoutCheckbox.indexOf(parsedTask.blockReference);
    if (refIndex >= 0) {
      for (let i = refIndex; i < refIndex + parsedTask.blockReference.length; i++) {
        maskedPositions[i] = true;
      }
    }
  }

  // Find continuous segments of unmarked positions (potential content)
  let inFragment = false;
  let fragmentStart = 0;

  for (let i = 0; i < maskedPositions.length; i++) {
    const isMarked = maskedPositions[i];

    if (!isMarked && !inFragment) {
      // Start of a new fragment
      inFragment = true;
      fragmentStart = i;
    } else if ((isMarked || i === maskedPositions.length - 1) && inFragment) {
      // End of a fragment
      inFragment = false;
      const fragmentEnd = isMarked ? i : i + 1;
      const fragmentText = lineWithoutCheckbox.substring(fragmentStart, fragmentEnd).trim();

      if (fragmentText) {
        fragments.push({
          text: fragmentText,
          start: fragmentStart + checkboxLength,
          end: fragmentEnd + checkboxLength
        });
      }
    }
  }

  return fragments;
}

/**
 * Reconstructs a task string from parsed components
 * ensuring proper spacing and structure
 *
 * @param task The parsed task object
 * @returns A full task string
 */
export function reconstructTask(task: ParsedTask): string {
  let result = "";

  // Add leading whitespace if present
  if (task.leadingWhitespace) {
    result += task.leadingWhitespace;
  }

  // Add checkbox with status, preserving the original list marker
  if (task.listMarker) {
    result += `${task.listMarker} [${task.status}] `;
  } else {
    // Fallback to the default marker if listMarker is somehow not set
    result += `- [${task.status}] `;
  }

  // Add tags before content (with proper spacing)
  if (task.tagsBeforeContent.length > 0) {
    result += task.tagsBeforeContent.join(" ") + " ";
  }

  // Add properties before content (with proper spacing)
  if (task.propertiesBeforeContent.size > 0) {
    const props = Array.from(task.propertiesBeforeContent.entries())
      .map(([name, value]) => `[${name}:: ${value}]`);
    result += props.join(" ") + " ";
  }

  // Add main content (ensure it doesn't end with a character that could merge with a tag)
  if (task.content && task.content.trim().length > 0) {
    result += sanitizeContentForTags(task.content.trim());
  }

  // Add tags after content (with proper spacing)
  if (task.tagsAfterContent.length > 0) {
    if (task.content && !result.endsWith(" ")) {
      result += " ";
    }
    result += task.tagsAfterContent.join(" ");
  }

  // Add properties after content (with proper spacing)
  if (task.propertiesAfterContent.size > 0) {
    if (!result.endsWith(" ")) {
      result += " ";
    }
    const props = Array.from(task.propertiesAfterContent.entries())
      .map(([name, value]) => `[${name}:: ${value}]`);
    result += props.join(" ");
  }

  // Add block reference if present (with proper spacing)
  if (task.blockReference) {
    if (!result.endsWith(" ")) {
      result += " ";
    }
    result += task.blockReference;
  }

  // Clean up excessive spacing while preserving the leading whitespace and tabs
  // Preserve the leading whitespace (including tabs)
  const leadingPart = result.slice(0, task.leadingWhitespace.length);
  // Clean up only the non-leading part
  const nonLeadingPart = result.slice(task.leadingWhitespace.length);
  // Replace multiple spaces with a single space in the non-leading part
  const cleanedNonLeadingPart = nonLeadingPart.replace(/ +/g, " ").trim();

  return leadingPart + cleanedNonLeadingPart;
}

/**
 * Checks if the parse task has split content (content that appears in multiple places)
 *
 * @param parsedTask The parsed task
 * @param taskLine The original task line
 * @returns True if content is split or ambiguous
 */
export function hasSplitContent(parsedTask: ParsedTask, taskLine: string): boolean {
  const fragments = findContentFragments(parsedTask, taskLine);
  return fragments.length > 1;
}

/**
 * Detects potential issues that might make task editing unsafe
 *
 * @param parsedTask The parsed task
 * @param taskLine The original task line
 * @returns An object with issue detection results
 */
export function detectTaskIssues(parsedTask: ParsedTask, taskLine: string): {
  hasSplitContent: boolean,
  hasInvalidProperties: boolean,
  hasEmbeddedTags: boolean,
  contentFragments: {text: string, start: number, end: number}[]
} {
  // Check for split content
  const contentFragments = findContentFragments(parsedTask, taskLine);
  const splitContent = contentFragments.length > 1;

  // Check for properties that don't have proper format
  const invalidProps =
    [...parsedTask.propertiesBeforeContent.entries(), ...parsedTask.propertiesAfterContent.entries()]
      .some(([key, value]) => !key || key.includes(']') || value.includes(']'));

  // Check for embedded tags in content
  const embeddedTagsInContent = hasEmbeddedTags(parsedTask.content);

  return {
    hasSplitContent: splitContent,
    hasInvalidProperties: invalidProps,
    hasEmbeddedTags: embeddedTagsInContent,
    contentFragments
  };
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
    leadingWhitespace: task.leadingWhitespace,
    tagsBeforeContent: [...task.tagsBeforeContent],
    propertiesBeforeContent: new Map(task.propertiesBeforeContent),
    tagsAfterContent: [...task.tagsAfterContent],
    propertiesAfterContent: new Map(task.propertiesAfterContent),
    listMarker: task.listMarker  // Preserve the list marker
  };
}

/**
 * Safely resolves conflicts between content and tags by adding spaces
 *
 * @param task The parsed task
 * @returns Task with fixed spacing
 */
export function fixTaskSpacing(task: ParsedTask): ParsedTask {
  // Nothing to fix if task has no content
  if (!task.content.trim()) return task;

  // Fix spacing between content and following tags/properties
  if (task.tagsAfterContent.length > 0 || task.propertiesAfterContent.size > 0) {
    // Ensure content doesn't end with a character that could merge with a tag
    if (!task.content.endsWith(' ')) {
      task.content += ' ';
    }
  }

  return task;
}

/**
 * Extract property from a task with the given key
 *
 * @param task The parsed task
 * @param key Property name to look for
 * @returns Property value or undefined if not found
 */
export function getTaskProperty(task: ParsedTask, key: string): string | undefined {
  // Check in properties before content
  if (task.propertiesBeforeContent.has(key)) {
    return task.propertiesBeforeContent.get(key);
  }

  // Check in properties after content
  if (task.propertiesAfterContent.has(key)) {
    return task.propertiesAfterContent.get(key);
  }

  return undefined;
}

/**
 * Sets a property on a task
 *
 * @param task The parsed task
 * @param key Property name
 * @param value Property value
 * @returns Updated task
 */
export function setTaskProperty(task: ParsedTask, key: string, value: string): ParsedTask {
  const updatedTask = { ...task };

  // If property already exists, update in the same location
  if (task.propertiesBeforeContent.has(key)) {
    updatedTask.propertiesBeforeContent = new Map(task.propertiesBeforeContent);
    updatedTask.propertiesBeforeContent.set(key, value);
  } else if (task.propertiesAfterContent.has(key)) {
    updatedTask.propertiesAfterContent = new Map(task.propertiesAfterContent);
    updatedTask.propertiesAfterContent.set(key, value);
  } else {
    // Otherwise, add to properties after content (more common for added properties)
    updatedTask.propertiesAfterContent = new Map(task.propertiesAfterContent);
    updatedTask.propertiesAfterContent.set(key, value);
  }

  return updatedTask;
}

/**
 * Removes a property from a task
 *
 * @param task The parsed task
 * @param key Property name to remove
 * @returns Updated task
 */
export function removeTaskProperty(task: ParsedTask, key: string): ParsedTask {
  const updatedTask = { ...task };

  if (task.propertiesBeforeContent.has(key)) {
    updatedTask.propertiesBeforeContent = new Map(task.propertiesBeforeContent);
    updatedTask.propertiesBeforeContent.delete(key);
  }

  if (task.propertiesAfterContent.has(key)) {
    updatedTask.propertiesAfterContent = new Map(task.propertiesAfterContent);
    updatedTask.propertiesAfterContent.delete(key);
  }

  return updatedTask;
}
