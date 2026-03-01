import {
  type DecorationSet,
  Decoration,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  type PluginValue,
} from '@codemirror/view';
import { type Extension, RangeSetBuilder } from '@codemirror/state';
import { type App, MarkdownView } from 'obsidian';
import type { ConfigManager } from '../ConfigManager';
import { getDatePropertyNames } from '../date-properties';
import { openDatePropertyPicker } from './DatePropertyClickHandler';

const INLINE_FIELD_PATTERN = /\[([^:\]]+)::\s*([^\]]*)\]/g;
const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const CLICKABLE_CLASS = 'tasks-calendar-date-property-clickable';

class DatePropertyDecorationPlugin implements PluginValue {
  decorations: DecorationSet;

  private readonly configManager: ConfigManager;

  constructor(view: EditorView, configManager: ConfigManager) {
    this.configManager = configManager;
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const datePropertyNames = getDatePropertyNames(this.configManager);

    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to; ) {
        const line = view.state.doc.lineAt(pos);
        const lineText = line.text;

        INLINE_FIELD_PATTERN.lastIndex = 0;
        let match;
        while ((match = INLINE_FIELD_PATTERN.exec(lineText)) !== null) {
          const key = match[1].trim();
          const value = match[2].trim();

          if (datePropertyNames.has(key) && DATE_VALUE_PATTERN.test(value)) {
            const matchStart = line.from + match.index;
            const matchEnd = matchStart + match[0].length;
            builder.add(
              matchStart,
              matchEnd,
              Decoration.mark({
                class: CLICKABLE_CLASS,
                attributes: {
                  'data-property-name': key,
                  'data-property-value': value,
                },
              })
            );
          }
        }

        pos = line.to + 1;
      }
    }

    return builder.finish();
  }
}

export function createDatePropertyExtension(
  app: App,
  configManager: ConfigManager
): Extension {
  return ViewPlugin.define(
    view => new DatePropertyDecorationPlugin(view, configManager),
    {
      decorations: plugin => plugin.decorations,
      eventHandlers: {
        click: (event: MouseEvent, view: EditorView) => {
          const target = event.target as HTMLElement;
          const clickable = target.closest(`.${CLICKABLE_CLASS}`);
          if (!clickable) return false;

          event.preventDefault();

          const propertyName = clickable.getAttribute('data-property-name');
          const propertyValue = clickable.getAttribute('data-property-value');
          if (!propertyName || !propertyValue) return false;

          const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
          if (!markdownView?.file) return false;

          const pos = view.posAtDOM(clickable);
          const lineNumber = view.state.doc.lineAt(pos).number - 1;

          openDatePropertyPicker({
            app,
            targetEl: clickable as HTMLElement,
            currentValue: propertyValue,
            propertyName,
            filePath: markdownView.file.path,
            lineNumber,
          });

          return true;
        },
      },
    }
  );
}
