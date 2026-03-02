import { App, MarkdownPreviewView, MarkdownView, Platform } from 'obsidian';
import { createLogger } from '../logging';

const logger = createLogger('open');

export default function openTask(app: App, filePath: string, line?: number) {
  const leaves = app.workspace.getLeavesOfType('markdown');
  const existingLeaf = leaves.find(leaf => {
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      return view.file?.path === filePath;
    }
    return false;
  });

  if (existingLeaf) {
    void app.workspace
      .revealLeaf(existingLeaf)
      .then(() => {
        handleLineNavigation(app, line, existingLeaf.view as MarkdownView);
        app.workspace.setActiveLeaf(existingLeaf);
      })
      .catch(error => {
        logger.error(
          `Failed to reveal leaf: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    return;
  }

  void app.workspace
    .openLinkText(filePath, '', true)
    .then(() => {
      handleLineNavigation(app, line);
    })
    .catch(error => {
      logger.error(
        `Failed to open file: ${error instanceof Error ? error.message : String(error)}`
      );
    });
}

function handleLineNavigation(
  app: App,
  line?: number,
  view: MarkdownView | null = null
) {
  if (line) {
    if (!view) {
      view = app.workspace.getActiveViewOfType(MarkdownView);
    }
    if (view) {
      const scrollDelay = Platform.isMobile ? 500 : 250;
      if (view.getMode() == 'preview') {
        const previewMode = view.previewMode;
        if (previewMode instanceof MarkdownPreviewView) {
          setTimeout(() => {
            previewMode.applyScroll(line);
          }, scrollDelay);
          return;
        }
      }
      const editor = view.editor;
      if (editor) {
        editor.setCursor({ line: line, ch: 0 });

        setTimeout(() => {
          editor.scrollIntoView(
            {
              from: { line: Math.max(0, line - 2), ch: 0 },
              to: { line: line + 2, ch: 0 },
            },
            true
          );
        }, scrollDelay);
      }
    }
  }
}
