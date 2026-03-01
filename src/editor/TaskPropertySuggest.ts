import {
  type App,
  type Editor,
  type EditorPosition,
  EditorSuggest,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
  type TFile,
} from 'obsidian';
import { DateTime } from 'luxon';
import type { ConfigManager } from '../ConfigManager';
import { getDatePropertyNames } from '../date-properties';

interface TaskPropertySuggestion {
  display: string;
  replacement: string;
  dateValue?: string;
}

const TASK_LINE_PATTERN = /^\s*- \[.\] /;
const PROPERTY_NAME_PATTERN = /\[(\w*)$/;
const RECURRENCE_VALUE_PATTERN = /\[recurrence::\s+(.*)$/;

const RECURRENCE_PATTERNS = [
  'every day',
  'every week',
  'every month',
  'every year',
  'every weekday',
  'every monday',
  'every tuesday',
  'every wednesday',
  'every thursday',
  'every friday',
  'every saturday',
  'every sunday',
  'every 2 weeks',
  'every 2 months',
];

type TriggerKind = 'property-name' | 'recurrence-value';

export class TaskPropertySuggest extends EditorSuggest<TaskPropertySuggestion> {
  private readonly configManager: ConfigManager;
  private triggerKind: TriggerKind = 'property-name';

  constructor(app: App, configManager: ConfigManager) {
    super(app);
    this.configManager = configManager;
  }

  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    _file: TFile | null
  ): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    if (!TASK_LINE_PATTERN.test(line)) return null;

    const textBeforeCursor = line.slice(0, cursor.ch);

    const recurrenceMatch = textBeforeCursor.match(RECURRENCE_VALUE_PATTERN);
    if (recurrenceMatch) {
      this.triggerKind = 'recurrence-value';
      return {
        start: { line: cursor.line, ch: cursor.ch - recurrenceMatch[1].length },
        end: cursor,
        query: recurrenceMatch[1],
      };
    }

    const propertyMatch = textBeforeCursor.match(PROPERTY_NAME_PATTERN);
    if (propertyMatch) {
      this.triggerKind = 'property-name';
      return {
        start: { line: cursor.line, ch: cursor.ch - propertyMatch[1].length },
        end: cursor,
        query: propertyMatch[1],
      };
    }

    return null;
  }

  getSuggestions(
    context: EditorSuggestContext
  ): TaskPropertySuggestion[] | Promise<TaskPropertySuggestion[]> {
    const query = context.query.toLowerCase();

    if (this.triggerKind === 'recurrence-value') {
      return RECURRENCE_PATTERNS.filter(p => p.includes(query)).map(p => ({
        display: p,
        replacement: p,
      }));
    }

    const datePropertyNames = getDatePropertyNames(this.configManager);
    const propertyNames = [...datePropertyNames, 'recurrence'];
    const unique = [...new Set(propertyNames)];
    const today = DateTime.now().toISODate()!;

    return unique
      .filter(name => name.toLowerCase().includes(query))
      .map(name => {
        const isDate = datePropertyNames.has(name);
        return {
          display: name,
          replacement: isDate ? `${name}:: ${today}` : `${name}:: `,
          dateValue: isDate ? today : undefined,
        };
      });
  }

  renderSuggestion(item: TaskPropertySuggestion, el: HTMLElement): void {
    el.setText(item.display);
  }

  selectSuggestion(
    item: TaskPropertySuggestion,
    _evt: MouseEvent | KeyboardEvent
  ): void {
    const { context } = this;
    if (!context) return;
    const { editor, start, end } = context;

    const line = editor.getLine(end.line);
    const replaceEnd =
      line[end.ch] === ']' ? { line: end.line, ch: end.ch + 1 } : end;
    const replacement = item.replacement + ']';

    editor.replaceRange(replacement, start, replaceEnd);

    if (this.triggerKind === 'property-name' && item.dateValue) {
      const dateOffset = replacement.indexOf(item.dateValue);
      editor.setSelection(
        { line: start.line, ch: start.ch + dateOffset },
        { line: start.line, ch: start.ch + dateOffset + item.dateValue.length }
      );
    } else if (this.triggerKind === 'property-name') {
      editor.setCursor({
        line: start.line,
        ch: start.ch + replacement.length - 1,
      });
    } else {
      editor.setCursor({ line: start.line, ch: start.ch + replacement.length });
    }
  }
}
