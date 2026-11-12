import { App, TFile } from 'obsidian';

const TAB_WIDTH = 4;

function getIndentation(text: string): string {
  return /^[ \t]*/.exec(text)?.[0] ?? '';
}

function getIndentationWidth(text: string): number {
  return getIndentation(text).replace(/\t/g, ' '.repeat(TAB_WIDTH)).length;
}

function isBlank(text: string): boolean {
  return text.trim() === '';
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
 * Removes `quoteDepth` blockquote markers from the start of the line. Returns
 * `null` when the line has fewer markers, i.e. it is outside of the blockquote.
 */
function stripQuoteMarkers(line: string, quoteDepth: number): string | null {
  const match = new RegExp(`^(?:[ \\t]*>){${quoteDepth}}`).exec(line);
  return match ? line.slice(match[0].length) : null;
}

/**
 * Returns the index of the last line that belongs to the task starting at
 * `line`. The task body consists of the following lines that are indented
 * deeper than the task line, including blank lines in between them. For a
 * task inside a blockquote, the body ends where the blockquote ends.
 */
export function findTaskBlockEnd(lines: string[], line: number): number {
  const quoteDepth = getQuoteDepth(lines[line]);
  const taskIndentationWidth = getIndentationWidth(
    stripQuoteMarkers(lines[line], quoteDepth) ?? ''
  );
  let end = line;
  for (let i = line + 1; i < lines.length; i++) {
    const unquoted = stripQuoteMarkers(lines[i], quoteDepth);
    if (unquoted === null) break;
    if (isBlank(unquoted)) continue;
    if (getIndentationWidth(unquoted) <= taskIndentationWidth) break;
    end = i;
  }
  return end;
}

function getCommonIndentation(lines: string[]): string {
  let common: string | null = null;
  for (const line of lines) {
    if (isBlank(line)) continue;
    const indentation = getIndentation(line);
    if (common === null) {
      common = indentation;
      continue;
    }
    let length = 0;
    while (
      length < common.length &&
      length < indentation.length &&
      common[length] === indentation[length]
    ) {
      length++;
    }
    common = common.slice(0, length);
  }
  return common ?? '';
}

export function extractTaskBody(lines: string[], line: number): string {
  const quoteDepth = getQuoteDepth(lines[line]);
  const bodyLines = lines
    .slice(line + 1, findTaskBlockEnd(lines, line) + 1)
    .map(bodyLine => stripQuoteMarkers(bodyLine, quoteDepth) ?? '');
  const commonIndentation = getCommonIndentation(bodyLines);
  return bodyLines
    .map(bodyLine =>
      isBlank(bodyLine) ? '' : bodyLine.slice(commonIndentation.length)
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
