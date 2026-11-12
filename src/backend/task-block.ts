import { App, TFile } from 'obsidian';

const TAB_WIDTH = 4;

function getIndentation(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? '';
}

function getIndentationWidth(line: string): number {
  return getIndentation(line).replace(/\t/g, ' '.repeat(TAB_WIDTH)).length;
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

/**
 * Returns the index of the last line that belongs to the task starting at
 * `line`. The task body consists of the following lines that are indented
 * deeper than the task line, including blank lines in between them.
 */
export function findTaskBlockEnd(lines: string[], line: number): number {
  const taskIndentationWidth = getIndentationWidth(lines[line]);
  let end = line;
  for (let i = line + 1; i < lines.length; i++) {
    if (isBlank(lines[i])) continue;
    if (getIndentationWidth(lines[i]) <= taskIndentationWidth) break;
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
  const bodyLines = lines.slice(line + 1, findTaskBlockEnd(lines, line) + 1);
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
