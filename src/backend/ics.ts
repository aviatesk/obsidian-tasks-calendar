import { EventInput } from '@fullcalendar/core';
import { DateTime } from 'luxon';
import { ExternalSource } from '../TasksCalendarSettings';
import { createLogger } from '../logging';

const logger = createLogger('IcsParser');

export function parseIcsEvents(
  content: string,
  source: ExternalSource
): EventInput[] {
  const lines = unfoldLines(content);
  const events: EventInput[] = [];
  let inEvent = false;
  let eventProps: Map<string, string> = new Map();

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      eventProps = new Map();
      continue;
    }
    if (line === 'END:VEVENT') {
      inEvent = false;
      try {
        const event = buildEvent(eventProps, source);
        if (event) events.push(event);
      } catch (error) {
        logger.warn(`Skipping malformed VEVENT: ${error}`);
      }
      continue;
    }
    if (inEvent) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.substring(0, colonIdx);
      const value = line.substring(colonIdx + 1);
      eventProps.set(key, value);
    }
  }

  return events;
}

function unfoldLines(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
    .filter(line => line.length > 0);
}

function unescapeIcsText(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

interface IcsDateResult {
  date: Date;
  allDay: boolean;
}

function parseIcsDate(key: string, value: string): IcsDateResult | null {
  const params = key.split(';');
  const isDateOnly = params.some(p => p === 'VALUE=DATE');
  const tzidParam = params.find(p => p.startsWith('TZID='));

  if (isDateOnly) {
    const dt = DateTime.fromFormat(value, 'yyyyMMdd');
    if (!dt.isValid) return null;
    return { date: dt.toJSDate(), allDay: true };
  }

  if (value.endsWith('Z')) {
    const dt = DateTime.fromFormat(value.slice(0, -1), "yyyyMMdd'T'HHmmss", {
      zone: 'UTC',
    });
    if (!dt.isValid) return null;
    return { date: dt.toJSDate(), allDay: false };
  }

  if (tzidParam) {
    const tzid = tzidParam.substring('TZID='.length);
    const dt = DateTime.fromFormat(value, "yyyyMMdd'T'HHmmss", { zone: tzid });
    if (!dt.isValid) return null;
    return { date: dt.toJSDate(), allDay: false };
  }

  const dt = DateTime.fromFormat(value, "yyyyMMdd'T'HHmmss");
  if (!dt.isValid) return null;
  return { date: dt.toJSDate(), allDay: false };
}

function findDateProp(
  props: Map<string, string>,
  prefix: string
): { key: string; value: string } | null {
  for (const [key, value] of props) {
    if (key === prefix || key.startsWith(prefix + ';')) {
      return { key, value };
    }
  }
  return null;
}

function buildEvent(
  props: Map<string, string>,
  source: ExternalSource
): EventInput | null {
  const startEntry = findDateProp(props, 'DTSTART');
  if (!startEntry) return null;

  const startResult = parseIcsDate(startEntry.key, startEntry.value);
  if (!startResult) return null;

  let end: Date | undefined;
  let allDay = startResult.allDay;
  const endEntry = findDateProp(props, 'DTEND');
  if (endEntry) {
    const endResult = parseIcsDate(endEntry.key, endEntry.value);
    if (endResult) {
      end = endResult.date;
      allDay = allDay && endResult.allDay;
    }
  }

  const summary = props.get('SUMMARY');
  const title = summary ? unescapeIcsText(summary) : source.path;

  const description = props.get('DESCRIPTION');

  return {
    title,
    start: startResult.date,
    end,
    allDay,
    backgroundColor: source.color,
    textColor: 'var(--text-on-accent)',
    display: 'auto',
    classNames: ['tasks-calendar-event-external'],
    editable: false,
    extendedProps: {
      isExternal: true,
      opacity: source.opacity,
      ...(description && { description: unescapeIcsText(description) }),
      sourcePath: source.path,
    },
  };
}
