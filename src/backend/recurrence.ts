import { DateTime } from "luxon";
import { ParsedTask } from "./parse";
import { TaskValidationError } from "./error-handling";

// Recurrence rule format: [frequency][interval]:[count|until]:[options]
// Examples:
// - daily2:2025-12-31 (every 2 days until Dec 31, 2025)
// - weekly:5:MWF (every Monday, Wednesday, Friday, 5 times)
// - monthly2:2025-12-31:15 (15th of every 2 months until Dec 31, 2025)
// - monthly:12:2W4 (2nd Wednesday, 12 times)
// - yearly:2025-12-31 (every year until Dec 31, 2025)

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  count?: number;
  until?: DateTime;
  weekdays?: number[];     // 0-6 for Sunday-Saturday
  monthDay?: number;       // 1-31
  monthWeek?: number;      // 1-5 for first-last week, -1 for last week
  monthWeekday?: number;   // 0-6 for Sunday-Saturday
}

export interface RecurrenceTaskGroup {
  rule: RecurrenceRule;
  recurrenceId: string;
  originalTask: ParsedTask;
  recurrenceTasks: ParsedTask[];
}

// Utility constants for weekday parsing
const WEEKDAY_MAP: { [key: string]: number } = {
  'U': 0, 'M': 1, 'T': 2, 'W': 3, 'R': 4, 'F': 5, 'S': 6
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function parseRecurrenceRule(ruleStr: string): RecurrenceRule {
  const parts = ruleStr.split(':');
  if (parts.length < 2 || parts.length > 3) {
    throw new TaskValidationError("Invalid recurrence rule format");
  }

  // Parse frequency and interval
  const freqMatch = parts[0].match(/^(daily|weekly|monthly|yearly)(\d+)?$/i);
  if (!freqMatch) {
    throw new TaskValidationError("Invalid frequency format");
  }

  const [, frequency, intervalStr] = freqMatch;
  const interval = intervalStr ? parseInt(intervalStr) : 1;

  if (interval < 1) {
    throw new TaskValidationError("Interval must be greater than 0");
  }

  const rule: RecurrenceRule = {
    frequency: frequency as RecurrenceFrequency,
    interval
  };

  // Parse count or until date
  const endStr = parts[1];
  if (endStr.match(/^\d+$/)) {
    const count = parseInt(endStr);
    if (count < 1) {
      throw new TaskValidationError("Count must be greater than 0");
    }
    rule.count = count;
  } else {
    const until = DateTime.fromISO(endStr);
    if (!until.isValid) {
      throw new TaskValidationError("Invalid until date");
    }
    rule.until = until;
  }

  // Parse options if present
  if (parts.length === 3) {
    const options = parts[2];

    switch (rule.frequency) {
      case "weekly":
        rule.weekdays = parseWeekdays(options);
        break;
      case "monthly":
        if (options.match(/^\d{1,2}$/)) {
          // Format: "15" for 15th day of month
          const day = parseInt(options);
          if (day < 1 || day > 31) {
            throw new TaskValidationError("Month day must be between 1 and 31");
          }
          rule.monthDay = day;
        } else {
          // Format: "2W4" for 2nd Wednesday
          const match = options.match(/^(\d|-)(\d|[UMTWRFS])$/);
          if (!match) {
            throw new TaskValidationError("Invalid monthly recurrence format");
          }
          const [, weekStr, dayChar] = match;
          const week = weekStr === '-' ? -1 : parseInt(weekStr);
          if (week !== -1 && (week < 1 || week > 5)) {
            throw new TaskValidationError("Week number must be between 1 and 5 or -1");
          }
          rule.monthWeek = week;
          rule.monthWeekday = WEEKDAY_MAP[dayChar];
        }
        break;
    }
  }

  return rule;
}

function parseWeekdays(weekdayStr: string): number[] {
  const weekdays = new Set<number>();
  for (const char of weekdayStr) {
    const day = WEEKDAY_MAP[char.toUpperCase()];
    if (day === undefined) {
      throw new TaskValidationError(`Invalid weekday character: ${char}`);
    }
    weekdays.add(day);
  }
  return Array.from(weekdays).sort();
}

export function generateRecurrenceDates(
  startDate: DateTime,
  rule: RecurrenceRule,
  maxCount = 100
): DateTime[] {
  const dates: DateTime[] = [];
  let current = startDate;
  let count = 0;

  while (
    count < (rule.count || maxCount) &&
    (!rule.until || current <= rule.until) &&
    count < maxCount
  ) {
    // For weekly recurrence with specific weekdays
    if (rule.frequency === "weekly" && rule.weekdays) {
      const weekStart = current.startOf('week');
      rule.weekdays.forEach(weekday => {
        const date = weekStart.plus({ days: weekday });
        if (date >= startDate && (!rule.until || date <= rule.until)) {
          dates.push(date);
          count++;
        }
      });
      current = weekStart.plus({ weeks: rule.interval });
      continue;
    }

    // For monthly recurrence with specific day or weekday
    if (rule.frequency === "monthly") {
      if (rule.monthDay) {
        // Specific day of month
        current = current.set({ day: rule.monthDay });
      } else if (rule.monthWeek !== undefined && rule.monthWeekday !== undefined) {
        // Specific weekday (e.g., 2nd Wednesday)
        if (rule.monthWeek === -1) {
          // Last occurrence of weekday
          current = current.endOf('month')
            .startOf('day')
            .minus({ days: (current.endOf('month').weekday - rule.monthWeekday + 7) % 7 });
        } else {
          // Nth occurrence of weekday
          current = current.startOf('month')
            .plus({ days: (rule.monthWeekday - current.startOf('month').weekday + 7) % 7 })
            .plus({ weeks: rule.monthWeek - 1 });
        }
      }
    }

    if (current >= startDate && (!rule.until || current <= rule.until)) {
      dates.push(current);
      count++;
    }

    switch (rule.frequency) {
      case "daily":
        current = current.plus({ days: rule.interval });
        break;
      case "weekly":
        current = current.plus({ weeks: rule.interval });
        break;
      case "monthly":
        current = current.plus({ months: rule.interval });
        break;
      case "yearly":
        current = current.plus({ years: rule.interval });
        break;
    }
  }

  return dates;
}

export function generateRecurrenceId(): string {
  return "r" + DateTime.now().toMillis().toString(36) + Math.random().toString(36).substring(2, 6);
}

export function isRecurrenceTask(task: ParsedTask): boolean {
  return (
    task.propertiesBeforeContent.has("recurrence") ||
    task.propertiesAfterContent.has("recurrence") ||
    task.propertiesBeforeContent.has("recurrence_id") ||
    task.propertiesAfterContent.has("recurrence_id")
  );
}

export function isRecurrenceParent(task: ParsedTask): boolean {
  return (
    task.propertiesBeforeContent.has("recurrence") ||
    task.propertiesAfterContent.has("recurrence")
  );
}

export function isRecurrenceChild(task: ParsedTask): boolean {
  return (
    !isRecurrenceParent(task) &&
    (task.propertiesBeforeContent.has("recurrence_id") ||
     task.propertiesAfterContent.has("recurrence_id"))
  );
}

export function getRecurrenceRule(task: ParsedTask): RecurrenceRule | null {
  const ruleStr = task.propertiesBeforeContent.get("recurrence") ||
                 task.propertiesAfterContent.get("recurrence");
  if (!ruleStr) return null;
  return parseRecurrenceRule(ruleStr);
}

export function getRecurrenceId(task: ParsedTask): string | null {
  return task.propertiesBeforeContent.get("recurrence_id") ||
         task.propertiesAfterContent.get("recurrence_id") ||
         null;
}

export function formatRecurrenceRule(rule: RecurrenceRule): string {
  let ruleStr = `${rule.frequency}${rule.interval > 1 ? rule.interval : ''}:`;

  // Add count or until
  if (rule.count) {
    ruleStr += rule.count;
  } else if (rule.until) {
    ruleStr += rule.until.toISODate();
  }

  // Add options based on frequency
  if (rule.weekdays && rule.frequency === "weekly") {
    ruleStr += ':' + rule.weekdays
      .map(d => Object.entries(WEEKDAY_MAP).find(([_, v]) => v === d)?.[0])
      .join('');
  } else if (rule.frequency === "monthly") {
    if (rule.monthDay) {
      ruleStr += ':' + rule.monthDay;
    } else if (rule.monthWeek !== undefined && rule.monthWeekday !== undefined) {
      const weekChar = rule.monthWeek === -1 ? '-' : rule.monthWeek.toString();
      const dayChar = Object.entries(WEEKDAY_MAP)
        .find(([, v]) => v === rule.monthWeekday)?.[0];
      ruleStr += ':' + weekChar + dayChar;
    }
  }

  return ruleStr;
}

export function describeRecurrenceRule(rule: RecurrenceRule): string {
  let description = `Every`;

  if (rule.interval > 1) {
    description += ` ${rule.interval}`;
  }

  switch (rule.frequency) {
    case "daily":
      description += ` day${rule.interval > 1 ? 's' : ''}`;
      break;
    case "weekly":
      description += ` week${rule.interval > 1 ? 's' : ''}`;
      if (rule.weekdays) {
        description += ` on ${rule.weekdays
          .map(d => WEEKDAY_NAMES[d])
          .join(', ')}`;
      }
      break;
    case "monthly":
      description += ` month${rule.interval > 1 ? 's' : ''}`;
      if (rule.monthDay) {
        description += ` on day ${rule.monthDay}`;
      } else if (rule.monthWeek !== undefined && rule.monthWeekday !== undefined) {
        const weekStr = rule.monthWeek === -1 ? 'last' :
          ['first', 'second', 'third', 'fourth', 'fifth'][rule.monthWeek - 1];
        description += ` on the ${weekStr} ${WEEKDAY_NAMES[rule.monthWeekday]}`;
      }
      break;
    case "yearly":
      description += ` year${rule.interval > 1 ? 's' : ''}`;
      break;
  }

  if (rule.count) {
    description += `, ${rule.count} times`;
  } else if (rule.until) {
    description += ` until ${rule.until.toISODate()}`;
  }

  return description;
}
