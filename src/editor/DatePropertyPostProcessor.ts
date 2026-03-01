import {
  type App,
  type MarkdownPostProcessor,
  type MarkdownPostProcessorContext,
} from 'obsidian';
import type { ConfigManager } from '../ConfigManager';
import { getDatePropertyNames } from '../date-properties';
import { openDatePropertyPicker } from './DatePropertyClickHandler';

const INLINE_FIELD_PATTERN = /\[([^:\]]+)::\s*([^\]]*)\]/g;
const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const CLICKABLE_CLASS = 'tasks-calendar-date-property-clickable';
const PROCESSED_ATTR = 'data-tc-date-processed';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface SectionLines {
  lines: string[];
  lineStart: number;
  lineEnd: number;
}

function getSectionLines(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): SectionLines | null {
  const info = ctx.getSectionInfo(el);
  if (!info) return null;
  return {
    lines: info.text.split('\n'),
    lineStart: info.lineStart,
    lineEnd: info.lineEnd,
  };
}

interface PropertyMatch {
  lineNumber: number;
  originalValue: string;
}

function createPropertyMatcher(section: SectionLines) {
  const cache = new Map<string, PropertyMatch[]>();
  const nextIndex = new Map<string, number>();

  return (propertyName: string): PropertyMatch | null => {
    if (!cache.has(propertyName)) {
      const matches: PropertyMatch[] = [];
      const pattern = new RegExp(
        `\\[${escapeRegExp(propertyName)}::\\s*([^\\]]*)\\]`
      );
      for (let i = section.lineStart; i <= section.lineEnd; i++) {
        const m = pattern.exec(section.lines[i]);
        if (m) matches.push({ lineNumber: i, originalValue: m[1].trim() });
      }
      cache.set(propertyName, matches);
      nextIndex.set(propertyName, 0);
    }
    const matches = cache.get(propertyName)!;
    const idx = nextIndex.get(propertyName)!;
    if (idx >= matches.length) return null;
    nextIndex.set(propertyName, idx + 1);
    return matches[idx];
  };
}

function attachDataviewHandlers(
  fields: HTMLElement[],
  section: SectionLines,
  ctx: MarkdownPostProcessorContext,
  app: App,
  datePropertyNames: Set<string>
): boolean {
  const matchProperty = createPropertyMatcher(section);
  let attached = false;
  for (const field of fields) {
    if (field.hasAttribute(PROCESSED_ATTR)) continue;

    const keyEl = field.querySelector('.inline-field-key');
    if (!keyEl) continue;
    const key = (
      keyEl.getAttribute('data-dv-key') ??
      keyEl.textContent ??
      ''
    ).trim();
    if (!datePropertyNames.has(key)) continue;

    const propMatch = matchProperty(key);
    if (!propMatch || !DATE_VALUE_PATTERN.test(propMatch.originalValue))
      continue;

    const { lineNumber, originalValue } = propMatch;

    field.setAttribute(PROCESSED_ATTR, 'true');
    field.classList.add(CLICKABLE_CLASS);
    field.addEventListener('click', (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      openDatePropertyPicker({
        app,
        targetEl: field,
        currentValue: originalValue,
        propertyName: key,
        filePath: ctx.sourcePath,
        lineNumber,
      });
    });
    attached = true;
  }
  return attached;
}

function attachPlainTextHandlers(
  el: HTMLElement,
  section: SectionLines,
  ctx: MarkdownPostProcessorContext,
  app: App,
  datePropertyNames: Set<string>
): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textMatches: {
    node: Text;
    index: number;
    fullMatch: string;
    key: string;
    value: string;
  }[] = [];

  let textNode: Text | null;
  while ((textNode = walker.nextNode() as Text | null)) {
    INLINE_FIELD_PATTERN.lastIndex = 0;
    let match;
    while (
      (match = INLINE_FIELD_PATTERN.exec(textNode.textContent ?? '')) !== null
    ) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (datePropertyNames.has(key) && DATE_VALUE_PATTERN.test(value)) {
        textMatches.push({
          node: textNode,
          index: match.index,
          fullMatch: match[0],
          key,
          value,
        });
      }
    }
  }

  if (textMatches.length === 0) return false;

  // Resolve line numbers in forward order (matching source line order)
  // before processing DOM in reverse order
  const matchProperty = createPropertyMatcher(section);
  const resolved = textMatches.map(m => ({
    ...m,
    lineNumber: matchProperty(m.key)?.lineNumber ?? null,
  }));

  for (let i = resolved.length - 1; i >= 0; i--) {
    const { node, index, fullMatch, key, value, lineNumber } = resolved[i];
    if (lineNumber === null) continue;

    const before = node.textContent!.slice(0, index);
    const after = node.textContent!.slice(index + fullMatch.length);

    const span = document.createElement('span');
    span.classList.add(CLICKABLE_CLASS);
    span.setAttribute(PROCESSED_ATTR, 'true');
    span.textContent = fullMatch;
    span.addEventListener('click', (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      openDatePropertyPicker({
        app,
        targetEl: span,
        currentValue: value,
        propertyName: key,
        filePath: ctx.sourcePath,
        lineNumber,
      });
    });

    const parent = node.parentNode!;
    if (after)
      parent.insertBefore(document.createTextNode(after), node.nextSibling);
    parent.insertBefore(span, node.nextSibling);
    node.textContent = before;
  }

  return true;
}

function tryAttach(
  el: HTMLElement,
  section: SectionLines,
  ctx: MarkdownPostProcessorContext,
  app: App,
  datePropertyNames: Set<string>
): boolean {
  const dvFields = Array.from(
    el.querySelectorAll<HTMLElement>('.dataview.inline-field')
  );
  if (dvFields.length > 0) {
    return attachDataviewHandlers(
      dvFields,
      section,
      ctx,
      app,
      datePropertyNames
    );
  }
  return attachPlainTextHandlers(el, section, ctx, app, datePropertyNames);
}

function sectionHasDateProperties(
  section: SectionLines,
  datePropertyNames: Set<string>
): boolean {
  for (let i = section.lineStart; i <= section.lineEnd; i++) {
    for (const name of datePropertyNames) {
      if (section.lines[i].includes(`[${name}::`)) return true;
    }
  }
  return false;
}

export function createDatePropertyPostProcessor(
  app: App,
  configManager: ConfigManager
): MarkdownPostProcessor {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    const datePropertyNames = getDatePropertyNames(configManager);
    const section = getSectionLines(el, ctx);
    if (!section) return;

    if (tryAttach(el, section, ctx, app, datePropertyNames)) return;

    // Only observe for deferred Dataview rendering if the section
    // source actually contains date property inline fields
    if (!sectionHasDateProperties(section, datePropertyNames)) return;

    const observer = new MutationObserver(() => {
      observer.disconnect();
      tryAttach(el, section, ctx, app, datePropertyNames);
    });
    observer.observe(el, { childList: true, subtree: true });
  };
}
