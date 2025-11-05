import { App, MarkdownPreviewView, MarkdownView, Platform } from 'obsidian';

export default function openTask(app: App, filePath: string, line?: number) {
  // We can simplify by directly checking for existing open leaves
  const leaves = app.workspace.getLeavesOfType('markdown');
  const existingLeaf = leaves.find(leaf => {
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      return view.file?.path === filePath;
    }
    return false;
  });

  if (existingLeaf) {
    // If file is already open, just reveal that leaf
    return app.workspace.revealLeaf(existingLeaf).then(() => {
      handleLineNavigation(app, line, existingLeaf.view as MarkdownView);
      app.workspace.setActiveLeaf(existingLeaf); // Make the leaf active to ensure it's visible
    });
  }

  // If file isn't open yet, open it in a new tab
  app.workspace.openLinkText(filePath, '', true).then(async () => {
    handleLineNavigation(app, line);
  });
}

// Helper function to navigate to specific line if provided
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
      // Apply scroll with the calculated offset to center the line
      // Use longer timeout on mobile for better reliability
      const scrollDelay = Platform.isMobile ? 500 : 250;
      if (view.getMode() == 'preview') {
        const previewMode = view.previewMode;
        if (previewMode instanceof MarkdownPreviewView) {
          // const fontSizeStr = getComputedStyle(app.workspace.containerEl).getPropertyValue('--font-text-size');
          // if (fontSizeStr) {
          //   try {
          //     const fontSize = Number(fontSizeStr.slice(0, -2));
          //     const visibleHeight = app.workspace.containerEl.innerHeight;

          //     // Calculate approximate line height based on font size
          //     const lineHeight = fontSize * 1.5; // Typical line-height multiplier

          //     // Calculate the number of visible lines in the viewport
          //     const visibleLines = Math.floor(visibleHeight / lineHeight);

          //     // Calculate the offset to center the target line
          //     // We want half the viewport height worth of lines above our target
          //     const offset = Math.max(0, line - Math.floor(visibleLines / 2));

          //     setTimeout(() => {
          //       previewMode.applyScroll(offset);

          //       // After scrolling, find and highlight the target line
          //       setTimeout(() => {
          //         const previewEl = previewMode.containerEl.querySelector('.markdown-preview-view');
          //         if (previewEl) {
          //           // Find all block elements in the preview
          //           const blocks = previewEl.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote');

          //           // Highlight the target line and 2 lines above and below
          //           if (blocks.length > 0) {
          //             // Calculate the range of lines to highlight (target ± 2 lines)
          //             const startLine = Math.max(0, line - 2);
          //             const endLine = Math.min(blocks.length - 1, line + 2);

          //             // Add highlights to all elements in range
          //             for (let i = startLine; i <= endLine; i++) {
          //               const el = blocks[i];
          //               if (el) {
          //                 el.addClass('task-calendar-highlight');
          //                 // Remove all highlights after 2 seconds
          //                 setTimeout(() => {
          //                   el.removeClass('task-calendar-highlight');
          //                 }, 2000);
          //               }
          //             }
          //           }
          //         }
          //       }, 100);
          //     }, scrollDelay);
          //     return;
          //   } catch (err) {
          //     console.error('Error parsing font size', err);
          //   }
          // }
          // fallback case
          setTimeout(() => {
            previewMode.applyScroll(line);
          }, scrollDelay);
          return;
        }
      }
      const editor = view.editor;
      if (editor) {
        // Set cursor to the task position
        editor.setCursor({ line: line, ch: 0 });

        // Scroll to the cursor position with some context
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
