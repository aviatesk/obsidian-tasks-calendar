/**
 * Returns current date formatted as YYYY-MM-DD in local time zone
 *
 * This function ensures the date is formatted based on the user's local time,
 * not UTC, which is important for task completion dates to reflect when
 * the user actually marked the task as complete in their time zone.
 *
 * @returns Formatted date string YYYY-MM-DD
 */
export function getCurrentDateFormatted(): string {
  const now = new Date();

  // Get local date components
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Formats a date for inclusion in a task, handling all-day events correctly
 *
 * @param date The date to format
 * @param isAllDay Whether the event is an all-day event
 * @param isEndDate Whether the date is an end date (needs adjustment for all-day events)
 * @returns Formatted date string
 */
export function formatDateForTask(date: Date, isAllDay: boolean, isEndDate: boolean): string {
  // Create copy of the date to avoid modifying the original
  let dateToFormat = new Date(date);

  // For all-day events with end dates, subtract one day to align with calendar display
  if (isAllDay && isEndDate) {
    dateToFormat = new Date(dateToFormat.getTime() - 24 * 60 * 60 * 1000);
  }

  if (isAllDay) {
    // Format as YYYY-MM-DD for all-day events
    const year = dateToFormat.getFullYear();
    const month = (dateToFormat.getMonth() + 1).toString().padStart(2, '0');
    const day = dateToFormat.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  } else {
    // For events with time, use ISO format but ensure it's in local timezone
    const year = dateToFormat.getFullYear();
    const month = (dateToFormat.getMonth() + 1).toString().padStart(2, '0');
    const day = dateToFormat.getDate().toString().padStart(2, '0');
    const hours = dateToFormat.getHours().toString().padStart(2, '0');
    const minutes = dateToFormat.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}
