import React from 'react';
import { type App, TFile } from 'obsidian';
import { DateTimePickerModal } from '../frontend/DateTimePickerModal';
import { ReactRenderer } from '../frontend/ReactRoot';
import { formatDateForTask } from '../backend/date';
import { processFileLine } from '../backend/file-operations';
import { parseTask, setTaskProperty, reconstructTask } from '../backend/parse';
import handleError from '../backend/error-handling';
import { createLogger } from '../logging';

const logger = createLogger('DatePropertyClickHandler');

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

export function openDatePropertyPicker(params: {
  app: App;
  targetEl: HTMLElement;
  currentValue: string;
  propertyName: string;
  filePath: string;
  lineNumber: number;
}): void {
  const { app, targetEl, currentValue, propertyName, filePath, lineNumber } =
    params;

  if (!DATE_VALUE_PATTERN.test(currentValue)) return;

  const isAllDay = !currentValue.includes('T');
  const initialDate = new Date(
    isAllDay ? currentValue + 'T00:00:00' : currentValue
  );

  const container = document.createElement('div');
  document.body.appendChild(container);
  const renderer = new ReactRenderer(container);

  const cleanup = () => {
    renderer.unmount();
    container.remove();
  };

  const rect = targetEl.getBoundingClientRect();
  const position = { top: rect.bottom + 5, left: rect.left };

  renderer.render(
    React.createElement(DateTimePickerModal, {
      initialStartDate: initialDate,
      initialEndDate: null,
      isAllDay,
      position,
      onClose: cleanup,
      onDone: async (
        startDate: Date,
        _endDate: Date | null,
        doneIsAllDay: boolean
      ) => {
        cleanup();

        const newValue = formatDateForTask(startDate, doneIsAllDay, false);

        const file = app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
          logger.error(`File not found: ${filePath}`);
          return;
        }

        try {
          await processFileLine(
            app.vault,
            file,
            lineNumber,
            (lineContent: string) => {
              const parsed = parseTask(lineContent);
              const updated = setTaskProperty(parsed, propertyName, newValue);
              return reconstructTask(updated);
            }
          );
        } catch (error) {
          handleError(error, 'Failed to update date property', logger);
        }
      },
    })
  );
}
