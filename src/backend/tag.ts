/**
 * Normalizes tags by ensuring they start with '#'
 * This helps handle inconsistencies between Markdown list properties and page properties
 */
export const normalizeTag = (tag: string): string => {
  return tag.trim().startsWith('#') ? tag.trim() : `#${tag.trim()}`;
};
