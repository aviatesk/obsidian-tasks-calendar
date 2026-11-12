import React, { useEffect, useRef, useState } from 'react';
import { type App, Component, Keymap, MarkdownRenderer } from 'obsidian';
import { readTaskBody } from '../backend/task-block';
import { createLogger } from '../logging';

const logger = createLogger('TaskBody');

interface TaskBodyProps {
  app: App;
  filePath: string;
  line: number;
  onOpenLink: () => void;
}

export const TaskBody: React.FC<TaskBodyProps> = ({
  app,
  filePath,
  line,
  onOpenLink,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [markdown, setMarkdown] = useState<string>('');

  useEffect(() => {
    let isStale = false;

    void (async () => {
      let body: string;
      try {
        body = await readTaskBody(app, filePath, line);
      } catch (error) {
        logger.warn(`Failed to read task body: ${error}`);
        return;
      }
      if (!isStale) setMarkdown(body);
    })();

    return () => {
      isStale = true;
    };
  }, [app, filePath, line]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !markdown) return;

    const renderTarget = container.createDiv();
    const component = new Component();
    component.load();

    void (async () => {
      try {
        await MarkdownRenderer.render(
          app,
          markdown,
          renderTarget,
          filePath,
          component
        );
      } catch (error) {
        logger.warn(`Failed to render task body: ${error}`);
      }
    })();

    return () => {
      component.unload();
      renderTarget.remove();
    };
  }, [app, markdown, filePath]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest('a.internal-link');
    if (!link) return;

    event.preventDefault();
    const linktext = link.getAttribute('data-href');
    if (!linktext) return;

    void app.workspace.openLinkText(
      linktext,
      filePath,
      Keymap.isModEvent(event.nativeEvent)
    );
    onOpenLink();
  };

  if (!markdown) return null;

  return (
    <div
      ref={containerRef}
      className="task-click-tooltip-body markdown-rendered"
      onClick={handleClick}
    />
  );
};
