import { App, TFile } from 'obsidian';

const TAB_STOP = 4;

interface LineLayout {
  indentationWidth: number;
  content: string;
}

/**
 * Returns the number of blockquote markers in front of the given line, which
 * is non-zero for lines inside blockquotes and callouts.
 */
export function getQuoteDepth(line: string): number {
  const quotePrefix = /^(?:[ \t]*>)*/.exec(line)?.[0] ?? '';
  return quotePrefix.split('>').length - 1;
}

/**
 * Measures the indentation of the line within a blockquote of the given depth.
 *
 * The width is counted in columns, with a tab advancing to the next tab stop.
 * It excludes the optional padding after a blockquote marker, so that
 * `>- item` and `> - item` are indented equally. Returns `null` when the line
 * has fewer blockquote markers, i.e. it is outside of the blockquote.
 */
function layoutLine(line: string, quoteDepth: number): LineLayout | null {
  let index = 0;
  let column = 0;
  let contentOrigin = 0;

  const isWhitespace = () => line[index] === ' ' || line[index] === '\t';
  const skipWhitespace = () => {
    for (; isWhitespace(); index++) {
      column =
        line[index] === '\t'
          ? column + TAB_STOP - (column % TAB_STOP)
          : column + 1;
    }
  };

  for (let depth = 0; depth < quoteDepth; depth++) {
    skipWhitespace();
    if (line[index] !== '>') return null;
    index++;
    column++;
    contentOrigin = isWhitespace() ? column + 1 : column;
  }
  skipWhitespace();

  return {
    indentationWidth: column - contentOrigin,
    content: line.slice(index),
  };
}

function isBlank(layout: LineLayout): boolean {
  return layout.content.trim() === '';
}

/**
 * Returns the index of the last line that belongs to the task starting at
 * `line`. The task body consists of the following lines that are indented
 * deeper than the task line, including blank lines in between them. For a
 * task inside a blockquote, the body ends where the blockquote ends.
 */
export function findTaskBlockEnd(lines: string[], line: number): number {
  const quoteDepth = getQuoteDepth(lines[line]);
  const taskIndentationWidth =
    layoutLine(lines[line], quoteDepth)?.indentationWidth ?? 0;
  let end = line;
  for (let i = line + 1; i < lines.length; i++) {
    const layout = layoutLine(lines[i], quoteDepth);
    if (layout === null) break;
    if (isBlank(layout)) continue;
    if (layout.indentationWidth <= taskIndentationWidth) break;
    end = i;
  }
  return end;
}

/**
 * Returns the body of the task starting at `line` as Markdown, without the
 * blockquote markers and the indentation that the body lines have in common.
 */
export function extractTaskBody(lines: string[], line: number): string {
  const quoteDepth = getQuoteDepth(lines[line]);
  const layouts = lines
    .slice(line + 1, findTaskBlockEnd(lines, line) + 1)
    .map(
      bodyLine =>
        layoutLine(bodyLine, quoteDepth) ?? { indentationWidth: 0, content: '' }
    );
  const baseIndentationWidth = layouts.reduce(
    (width, layout) =>
      isBlank(layout) ? width : Math.min(width, layout.indentationWidth),
    Infinity
  );
  return layouts
    .map(layout =>
      isBlank(layout)
        ? ''
        : ' '.repeat(layout.indentationWidth - baseIndentationWidth) +
          layout.content
    )
    .join('\n');
}

export async function readTaskBody(
  app: App,
  filePath: string,
  line: number
): Promise<string> {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return '';
  const content = await app.vault.cachedRead(file);
  const lines = content.split('\n');
  if (line < 0 || line >= lines.length) return '';
  return extractTaskBody(lines, line);
}
