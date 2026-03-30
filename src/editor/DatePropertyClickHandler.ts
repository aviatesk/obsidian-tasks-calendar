import { type App, TFile } from 'obsidian';
import { DateTimePickerNativeModal } from '../frontend/DateTimePickerModal';
import { formatDateForTask } from '../backend/date';
import { processFileLine } from '../backend/file-operations';
import {
  parseTask,
  getTaskProperty,
  setTaskProperty,
  removeTaskProperty,
  reconstructTask,
} from '../backend/parse';
import handleError from '../backend/error-handling';
import { createLogger } from '../logging';

const logger = createLogger('DatePropertyClickHandler');

const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

function parseDateValue(value: string): Date | null {
  if (!DATE_VALUE_PATTERN.test(value)) return null;
  const isAllDay = !value.includes('T');
  return new Date(isAllDay ? value + 'T00:00:00' : value);
}

function isRangeProperty(
  propertyName: string,
  startDateProperty: string,
  endDateProperty: string
): boolean {
  return propertyName === startDateProperty || propertyName === endDateProperty;
}

export function openDatePropertyPicker(params: {
  app: App;
  targetEl: HTMLElement;
  currentValue: string;
  propertyName: string;
  filePath: string;
  lineNumber: number;
  startDateProperty: string;
  endDateProperty: string;
}): void {
  const {
    app,
    currentValue,
    propertyName,
    filePath,
    lineNumber,
    startDateProperty,
    endDateProperty,
  } = params;

  if (!DATE_VALUE_PATTERN.test(currentValue)) return;

  const file = app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return;

  void app.vault.cachedRead(file).then(content => {
    const lines = content.split('\n');
    if (lineNumber < 0 || lineNumber >= lines.length) return;

    let parsed;
    try {
      parsed = parseTask(lines[lineNumber]);
    } catch {
      return;
    }

    const rangeMode = isRangeProperty(
      propertyName,
      startDateProperty,
      endDateProperty
    );

    if (rangeMode) {
      openRangeDatePicker(
        app,
        file,
        parsed,
        currentValue,
        lineNumber,
        startDateProperty,
        endDateProperty
      );
    } else {
      openSingleDatePicker(
        app,
        file,
        parsed,
        currentValue,
        lineNumber,
        propertyName
      );
    }
  });
}

function openRangeDatePicker(
  app: App,
  file: TFile,
  parsed: ReturnType<typeof parseTask>,
  currentValue: string,
  lineNumber: number,
  startDateProperty: string,
  endDateProperty: string
): void {
  const startValue = getTaskProperty(parsed, startDateProperty);
  const endValue = getTaskProperty(parsed, endDateProperty);

  const startDate = startValue ? parseDateValue(startValue) : null;
  const endDate = endValue ? parseDateValue(endValue) : null;

  const hasRange = startDate && endDate;
  const isAllDay = hasRange
    ? !startValue!.includes('T')
    : !currentValue.includes('T');
  const initialStartDate = hasRange
    ? startDate
    : new Date(isAllDay ? currentValue + 'T00:00:00' : currentValue);
  const initialEndDate = hasRange ? endDate : null;

  new DateTimePickerNativeModal(app, {
    title: parsed.content || undefined,
    initialStartDate,
    initialEndDate,
    isAllDay,
    onDone: (
      newStartDate: Date,
      newEndDate: Date | null,
      doneIsAllDay: boolean
    ) => {
      void processFileLine(
        app.vault,
        file,
        lineNumber,
        (lineContent: string) => {
          const task = parseTask(lineContent);

          if (newEndDate) {
            const formattedStart = formatDateForTask(
              newStartDate,
              doneIsAllDay,
              false
            );
            const formattedEnd = formatDateForTask(
              newEndDate,
              doneIsAllDay,
              true
            );
            let updated = setTaskProperty(
              task,
              startDateProperty,
              formattedStart
            );
            updated = setTaskProperty(updated, endDateProperty, formattedEnd);
            return reconstructTask(updated);
          }

          let updated = removeTaskProperty(task, startDateProperty);
          const newValue = formatDateForTask(newStartDate, doneIsAllDay, false);
          updated = setTaskProperty(updated, endDateProperty, newValue);
          return reconstructTask(updated);
        }
      ).catch(error => {
        handleError(error, 'Failed to update date property', logger);
      });
    },
  }).open();
}

function openSingleDatePicker(
  app: App,
  file: TFile,
  parsed: ReturnType<typeof parseTask>,
  currentValue: string,
  lineNumber: number,
  propertyName: string
): void {
  const isAllDay = !currentValue.includes('T');
  const initialDate = new Date(
    isAllDay ? currentValue + 'T00:00:00' : currentValue
  );

  new DateTimePickerNativeModal(app, {
    title: parsed.content || undefined,
    initialStartDate: initialDate,
    initialEndDate: null,
    isAllDay,
    onDone: (
      newDate: Date,
      _newEndDate: Date | null,
      doneIsAllDay: boolean
    ) => {
      void processFileLine(
        app.vault,
        file,
        lineNumber,
        (lineContent: string) => {
          const task = parseTask(lineContent);
          const newValue = formatDateForTask(newDate, doneIsAllDay, false);
          const updated = setTaskProperty(task, propertyName, newValue);
          return reconstructTask(updated);
        }
      ).catch(error => {
        handleError(error, 'Failed to update date property', logger);
      });
    },
  }).open();
}
