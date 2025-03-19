import { Platform } from 'obsidian';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Clock, X } from 'lucide-react';
import { FIRST_DAY } from 'src/TasksCalendarSettings';
import { calculateOptimalPosition } from '../utils/position';

interface DateTimePickerModalProps {
  initialStartDate: Date;
  initialEndDate?: Date | null;
  isAllDay: boolean;
  onClose: () => void;
  onDone: (startDate: Date, endDate: Date | null, isAllDay: boolean, wasMultiDay: boolean) => void;
  position: { top: number; left: number };
}

export const DateTimePickerModal: React.FC<DateTimePickerModalProps> = ({
  initialStartDate,
  initialEndDate,
  isAllDay: initialIsAllDay,
  onClose,
  onDone,
  position
}) => {
  // Track whether this was initially a multi-day event
  const wasMultiDay = useRef<boolean>(!!initialEndDate);

  // State for current values
  const [startDate, setStartDate] = useState<Date>(new Date(initialStartDate));

  // For all-day events, the displayed end date is the inclusive end date
  // (one day before the exclusive end date stored in the task)
  const [endDate, setEndDate] = useState<Date | null>(() => {
    if (initialEndDate) {
      const endDate = new Date(initialEndDate);
      if (initialIsAllDay)
        endDate.setDate(endDate.getDate() - 1)
      return endDate;
    }
    return null;
  });

  const [isAllDay, setIsAllDay] = useState<boolean>(initialIsAllDay);
  const [hours, setHours] = useState<string>(
    initialStartDate.getHours().toString().padStart(2, '0')
  );
  const [minutes, setMinutes] = useState<string>(
    initialStartDate.getMinutes().toString().padStart(2, '0')
  );
  const [endHours, setEndHours] = useState<string>(
    initialEndDate ? initialEndDate.getHours().toString().padStart(2, '0') : hours
  );
  const [endMinutes, setEndMinutes] = useState<string>(
    initialEndDate ? initialEndDate.getMinutes().toString().padStart(2, '0') : minutes
  );

  // Refs
  const calendarRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const calendarInstance = useRef<Calendar | null>(null);

  // For time input changes - using a shorter debounce
  const timeInputDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Input focus states
  const [hoursInputFocused, setHoursInputFocused] = useState(false);
  const [minutesInputFocused, setMinutesInputFocused] = useState(false);
  const [endHoursInputFocused, setEndHoursInputFocused] = useState(false);
  const [endMinutesInputFocused, setEndMinutesInputFocused] = useState(false);

  // Position state
  const [finalPosition, setFinalPosition] = useState(position);

  // Determine if on mobile or desktop
  const isMobile = Platform.isMobile;

  // Derived state for multi-day events
  const isMultiDay = endDate && endDate.toDateString() !== startDate.toDateString();

  // Create result dates from current state
  const createResultDates = useCallback(() => {
    const resultStartDate = new Date(startDate);

    if (!isAllDay) {
      const parsedHours = parseInt(hours, 10);
      const parsedMinutes = parseInt(minutes, 10);

      resultStartDate.setHours(isNaN(parsedHours) ? 0 : parsedHours);
      resultStartDate.setMinutes(isNaN(parsedMinutes) ? 0 : parsedMinutes);
    } else {
      resultStartDate.setHours(0);
      resultStartDate.setMinutes(0);
      resultStartDate.setSeconds(0);
      resultStartDate.setMilliseconds(0);
    }

    let resultEndDate: Date | null = null;

    if (endDate) {
      // For all-day events, the end date needs to be adjusted:
      // - Display: Inclusive end date (last day of event)
      // - Storage: Exclusive end date (day after last day of event)
      if (isAllDay) {
        // Create exclusive end date by adding one day to the inclusive end date
        resultEndDate = new Date(endDate);
        resultEndDate.setDate(resultEndDate.getDate() + 1);
        resultEndDate.setHours(0);
        resultEndDate.setMinutes(0);
        resultEndDate.setSeconds(0);
        resultEndDate.setMilliseconds(0);
      } else {
        resultEndDate = new Date(endDate);

        if (isMultiDay) {
          // For multi-day events, use specified end time
          const parsedHours = parseInt(endHours, 10);
          const parsedMinutes = parseInt(endMinutes, 10);

          resultEndDate.setHours(isNaN(parsedHours) ? 0 : parsedHours);
          resultEndDate.setMinutes(isNaN(parsedMinutes) ? 0 : parsedMinutes);
        } else {
          // For single-day events, use the same time as start date
          resultEndDate.setHours(resultStartDate.getHours());
          resultEndDate.setMinutes(resultStartDate.getMinutes());
        }
      }
    }

    return { startDate: resultStartDate, endDate: resultEndDate };
  }, [startDate, endDate, isAllDay, hours, minutes, endHours, endMinutes, isMultiDay]);

  // Handlers for automatic updates while interacting
  const handleDataChange = useCallback(() => {
    // Cancel any pending time input debounce
    if (timeInputDebounceTimerRef.current) {
      clearTimeout(timeInputDebounceTimerRef.current);
      timeInputDebounceTimerRef.current = null;
    }
  }, []);

  // Handle date changes
  const handleDateChange = useCallback((newStartDate: Date, newEndDate: Date | null) => {
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    handleDataChange();
  }, [handleDataChange]);

  // Handle all-day toggle
  const handleAllDayChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newIsAllDay = e.target.checked;
    setIsAllDay(newIsAllDay);
    handleDataChange();
  }, [handleDataChange]);

  // Handle time input changes with a short debounce
  const handleTimeInputChange = useCallback((newValue: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    setter(newValue);

    // Use a short debounce for time inputs to avoid excessive updates while typing
    if (timeInputDebounceTimerRef.current) {
      clearTimeout(timeInputDebounceTimerRef.current);
    }

    timeInputDebounceTimerRef.current = setTimeout(() => {
      timeInputDebounceTimerRef.current = null;
    }, 300); // Short debounce time
  }, []);

  // Handle clearing the end date (convert to single-day task)
  const handleClearEndDate = useCallback(() => {
    setEndDate(null);
    handleDataChange();
  }, [handleDataChange]);

  // Position calculation
  useEffect(() => {
    if (modalRef.current && !isMobile) {
      const sourceEl = document.createElement('div');
      sourceEl.style.position = 'absolute';
      sourceEl.style.left = `${position.left}px`;
      sourceEl.style.top = `${position.top - 5}px`;
      sourceEl.style.width = '100px';
      sourceEl.style.height = '20px';
      document.body.appendChild(sourceEl);

      const optimalPosition = calculateOptimalPosition(sourceEl, modalRef.current, 10);
      setFinalPosition(optimalPosition);

      document.body.removeChild(sourceEl);
    } else if (isMobile) {
      setFinalPosition({ top: 0, left: 0 });
    }
  }, [position, isMobile]);

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        // Handle close without saving
        handleCancel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);

      // Clean up any pending timeout when component unmounts
      if (timeInputDebounceTimerRef.current) {
        clearTimeout(timeInputDebounceTimerRef.current);
      }
    };
  }, [onClose]);

  // Initialize calendar
  useEffect(() => {
    if (calendarRef.current) {
      const calendar = new Calendar(calendarRef.current, {
        plugins: [dayGridPlugin, interactionPlugin],
        initialView: 'dayGridMonth',
        initialDate: startDate,
        headerToolbar: {
          left: 'prev',
          center: 'title',
          right: 'next'
        },
        aspectRatio: 0.75,
        selectable: true,
        selectMirror: true,
        unselectAuto: false,
        events: [],
        navLinks: false,
        firstDay: FIRST_DAY,
        dayCellDidMount: (info) => {
          const cellDate = info.date;

          // Check if this date is the start date
          const isStart =
            cellDate.getFullYear() === startDate.getFullYear() &&
            cellDate.getMonth() === startDate.getMonth() &&
            cellDate.getDate() === startDate.getDate();

          // Check if this date is the end date (which is already the inclusive end date in this component)
          const isEnd = endDate &&
            cellDate.getFullYear() === endDate.getFullYear() &&
            cellDate.getMonth() === endDate.getMonth() &&
            cellDate.getDate() === endDate.getDate();

          // Check if this date is between start and end
          let isBetween = false;
          if (endDate && startDate < endDate) {
            const cellTime = cellDate.getTime();
            const startTime = startDate.getTime();
            const endTime = endDate.getTime();
            // Check if the current cell date is between start and end (inclusive)
            isBetween = cellTime > startTime && cellTime < endTime;
          }

          if (isStart) {
            info.el.classList.add('fc-day-selected-start');
            info.el.classList.add('fc-day-selected');
          } else if (isEnd) {
            info.el.classList.add('fc-day-selected-end');
            info.el.classList.add('fc-day-selected');
          } else if (isBetween) {
            info.el.classList.add('fc-day-in-range');
          }
        },
        dateClick: (info) => {
          const clickedDate = new Date(info.dateStr);
          clickedDate.setHours(startDate.getHours());
          clickedDate.setMinutes(startDate.getMinutes());

          // If clicked date is the same as start date and we have an end date, clear end date
          if (clickedDate.toDateString() === startDate.toDateString() && endDate) {
            handleDateChange(startDate, null);
          } else {
            // Set as new start date
            handleDateChange(clickedDate, null);
          }

          updateSelectedDateHighlight();
        },
        select: (info) => {
          // Handle date range selection
          const newStartDate = new Date(info.start);

          // For FullCalendar, the end date is exclusive but we want to display inclusive dates
          const exclusiveEnd = new Date(info.end);
          const inclusiveEnd = new Date(exclusiveEnd);
          inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);

          // Set time components from current selection
          newStartDate.setHours(startDate.getHours());
          newStartDate.setMinutes(startDate.getMinutes());

          // Only set end date if it's different from start date
          let newEndDate = null;
          if (newStartDate.toDateString() !== inclusiveEnd.toDateString()) {
            newEndDate = inclusiveEnd;
          }

          handleDateChange(newStartDate, newEndDate);

          // Don't unselect after selection (keep visual highlighting)
          calendar.unselect();

          updateSelectedDateHighlight();
        },
        datesSet: () => {
          // Update highlighting when the view changes (e.g., month changes)
          updateSelectedDateHighlight();
        },
        dayHeaderFormat: { weekday: 'narrow' },
        fixedWeekCount: false
      });

      calendar.render();
      calendarInstance.current = calendar;

      // Apply the selected date highlight after render
      setTimeout(() => {
        updateSelectedDateHighlight();
      }, 100);

      return () => {
        calendar.destroy();
      };
    }
  }, []); // Only run once on mount

  // Function to highlight the selected date range
  const updateSelectedDateHighlight = useCallback(() => {
    if (!calendarRef.current) return;

    // Remove existing selections
    const selectedCells = calendarRef.current.querySelectorAll('.fc-day-selected, .fc-day-selected-start, .fc-day-selected-end, .fc-day-in-range');
    selectedCells.forEach((el) => {
      el.classList.remove('fc-day-selected');
      el.classList.remove('fc-day-selected-start');
      el.classList.remove('fc-day-selected-end');
      el.classList.remove('fc-day-in-range');
    });

    // Remove today highlighting to avoid confusion
    const todayCells = calendarRef.current.querySelectorAll('.fc-day-today');
    todayCells.forEach((el) => el.classList.remove('fc-day-today'));

    // Function to format date for selection
    const formatDateForSelector = (date: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    };

    // Highlight start date
    const startDateStr = formatDateForSelector(startDate);
    const startCell = calendarRef.current.querySelector(`[data-date="${startDateStr}"]`);
    if (startCell) {
      startCell.classList.add('fc-day-selected-start');
      startCell.classList.add('fc-day-selected');
    }

    // Highlight end date if exists
    if (endDate) {
      const endDateStr = formatDateForSelector(endDate);
      const endCell = calendarRef.current.querySelector(`[data-date="${endDateStr}"]`);
      if (endCell) {
        endCell.classList.add('fc-day-selected-end');
        endCell.classList.add('fc-day-selected');
      }

      // Highlight dates in between if this is a range
      if (startDate < endDate) {
        const start = new Date(startDate);
        start.setDate(start.getDate() + 1); // Start from the day after start date

        const end = new Date(endDate);

        // Loop through dates between start and end
        for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
          const dateStr = formatDateForSelector(d);
          const dayCell = calendarRef.current.querySelector(`[data-date="${dateStr}"]`);
          if (dayCell) {
            dayCell.classList.add('fc-day-in-range');
          }
        }
      }
    }
  }, [startDate, endDate]);

  // Update highlight when dates change
  useEffect(() => {
    if (calendarInstance.current) {
      // Schedule an update after the calendar has been fully rendered
      setTimeout(() => {
        updateSelectedDateHighlight();
      }, 50);
    }
  }, [startDate, endDate, updateSelectedDateHighlight]);

  // Hours input change handler with validation
  const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (value === '') {
      handleTimeInputChange('', setHours);
      return;
    }

    const numericValue = value.replace(/[^0-9]/g, '');
    const numValue = parseInt(numericValue, 10);

    if (isNaN(numValue)) return;

    if (hoursInputFocused) {
      if (numValue <= 23) {
        handleTimeInputChange(numericValue, setHours);
      }
    } else {
      if (numValue >= 0 && numValue <= 23) {
        handleTimeInputChange(numValue.toString().padStart(2, '0'), setHours);
      }
    }
  };

  // Minutes input change handler with validation
  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (value === '') {
      handleTimeInputChange('', setMinutes);
      return;
    }

    const numericValue = value.replace(/[^0-9]/g, '');
    const numValue = parseInt(numericValue, 10);

    if (isNaN(numValue)) return;

    if (minutesInputFocused) {
      if (numValue <= 59) {
        handleTimeInputChange(numericValue, setMinutes);
      }
    } else {
      if (numValue >= 0 && numValue <= 59) {
        handleTimeInputChange(numValue.toString().padStart(2, '0'), setMinutes);
      }
    }
  };

  // End hours input change handler with validation
  const handleEndHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (value === '') {
      handleTimeInputChange('', setEndHours);
      return;
    }

    const numericValue = value.replace(/[^0-9]/g, '');
    const numValue = parseInt(numericValue, 10);

    if (isNaN(numValue)) return;

    if (endHoursInputFocused) {
      if (numValue <= 23) {
        handleTimeInputChange(numericValue, setEndHours);
      }
    } else {
      if (numValue >= 0 && numValue <= 23) {
        handleTimeInputChange(numValue.toString().padStart(2, '0'), setEndHours);
      }
    }
  };

  // End minutes input change handler with validation
  const handleEndMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (value === '') {
      handleTimeInputChange('', setEndMinutes);
      return;
    }

    const numericValue = value.replace(/[^0-9]/g, '');
    const numValue = parseInt(numericValue, 10);

    if (isNaN(numValue)) return;

    if (endMinutesInputFocused) {
      if (numValue <= 59) {
        handleTimeInputChange(numericValue, setEndMinutes);
      }
    } else {
      if (numValue >= 0 && numValue <= 59) {
        handleTimeInputChange(numValue.toString().padStart(2, '0'), setEndMinutes);
      }
    }
  };

  // Focus handlers
  const handleHoursFocus = () => {
    setHoursInputFocused(true);
    if (hours.startsWith('0') && hours !== '0') {
      setHours(hours.replace(/^0+/, ''));
    }
  };

  const handleHoursBlur = () => {
    setHoursInputFocused(false);
    if (hours !== '') {
      const numValue = parseInt(hours, 10);
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 23) {
        const paddedValue = numValue.toString().padStart(2, '0');
        setHours(paddedValue);

        // Ensure the change is saved
        handleDataChange();
      }
    }
  };

  const handleMinutesFocus = () => {
    setMinutesInputFocused(true);
    if (minutes.startsWith('0') && minutes !== '0') {
      setMinutes(minutes.replace(/^0+/, ''));
    }
  };

  const handleMinutesBlur = () => {
    setMinutesInputFocused(false);
    if (minutes !== '') {
      const numValue = parseInt(minutes, 10);
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 59) {
        const paddedValue = numValue.toString().padStart(2, '0');
        setMinutes(paddedValue);

        // Ensure the change is saved
        handleDataChange();
      }
    }
  };

  // End time focus handlers
  const handleEndHoursFocus = () => {
    setEndHoursInputFocused(true);
    if (endHours.startsWith('0') && endHours !== '0') {
      setEndHours(endHours.replace(/^0+/, ''));
    }
  };

  const handleEndHoursBlur = () => {
    setEndHoursInputFocused(false);
    if (endHours !== '') {
      const numValue = parseInt(endHours, 10);
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 23) {
        const paddedValue = numValue.toString().padStart(2, '0');
        setEndHours(paddedValue);
        handleDataChange();
      }
    }
  };

  const handleEndMinutesFocus = () => {
    setEndMinutesInputFocused(true);
    if (endMinutes.startsWith('0') && endMinutes !== '0') {
      setEndMinutes(endMinutes.replace(/^0+/, ''));
    }
  };

  const handleEndMinutesBlur = () => {
    setEndMinutesInputFocused(false);
    if (endMinutes !== '') {
      const numValue = parseInt(endMinutes, 10);
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 59) {
        const paddedValue = numValue.toString().padStart(2, '0');
        setEndMinutes(paddedValue);
        handleDataChange();
      }
    }
  };

  // Handle select changes for mobile (immediate update)
  const handleSelectChange = (value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    setter(value);

    // Update immediately
    setTimeout(() => {
      handleDataChange();
    }, 0);
  };

  // Handle select changes for end time on mobile
  const handleEndSelectChange = (value: string, setter: React.Dispatch<React.SetStateAction<string>>) => {
    setter(value);

    // Update immediately
    setTimeout(() => {
      handleDataChange();
    }, 0);
  };

  // Done button handler - save changes and close the picker
  const handleDone = () => {
    // Ensure any pending time input changes are saved
    if (timeInputDebounceTimerRef.current) {
      clearTimeout(timeInputDebounceTimerRef.current);
      timeInputDebounceTimerRef.current = null;
    }

    // Get the final date values and send them to the parent
    const { startDate: resultStartDate, endDate: resultEndDate } = createResultDates();

    // Pass wasMultiDay flag to help determine if we need to remove startDateProperty
    // We only need to consider it as "was multi-day" if we're changing to single-day
    const isNowMultiDay = !!resultEndDate;
    const needsMultiDayConversion = wasMultiDay.current && !isNowMultiDay;

    onDone(resultStartDate, resultEndDate, isAllDay, needsMultiDayConversion);
  };

  // Cancel button handler - close the picker without saving
  const handleCancel = () => {
    if (timeInputDebounceTimerRef.current) {
      clearTimeout(timeInputDebounceTimerRef.current);
      timeInputDebounceTimerRef.current = null;
    }
    onClose();
  };

  // Modal title based on selection mode
  const modalTitle = endDate ? 'Date Range' : 'Select Date';

  // Render different container based on mobile or desktop
  return isMobile ? (
    <div className="mobile-modal-overlay">
      <div className="date-time-picker-modal" ref={modalRef}>
        <div className="date-time-picker-header">
          <div className="date-time-picker-title">
            {modalTitle}
          </div>
          <div className="date-time-picker-header-buttons">
            <button
              className="date-time-picker-close-button"
              onClick={handleCancel}
              title="Cancel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {endDate && (
          <div className="date-range-summary">
            <div><strong>{startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}</strong></div>
            <button
              className="date-range-clear"
              onClick={handleClearEndDate}
              title="Convert to single day"
            >
              Clear End Date
            </button>
          </div>
        )}

        <div className="date-time-picker-calendar-container">
          <div className="date-time-picker-calendar" ref={calendarRef}></div>
        </div>

        <div className="date-time-picker-time-container">
          <div className="date-time-picker-all-day">
            <label>
              <input
                type="checkbox"
                checked={isAllDay}
                onChange={handleAllDayChange}
              />
              All day
            </label>
          </div>

          {!isAllDay && (
            <>
              <div className="date-time-picker-time">
                {isMultiDay && <span className="date-time-picker-time-label">Start</span>}
                <Clock size={16} className="date-time-picker-time-icon" />
                <div className="time-input-with-controls">
                  <select
                    value={hours}
                    onChange={(e) => handleSelectChange(e.target.value, setHours)}
                  >
                    {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map((val) => (
                      <option key={val} value={val}>{val}</option>
                    ))}
                  </select>
                </div>
                <span className="date-time-picker-time-separator">:</span>
                <div className="time-input-with-controls">
                  <select
                    value={minutes}
                    onChange={(e) => handleSelectChange(e.target.value, setMinutes)}
                  >
                    {Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0')).map((val) => (
                      <option key={val} value={val}>{val}</option>
                    ))}
                  </select>
                </div>
              </div>

              {isMultiDay && (
                <div className="date-time-picker-time">
                  <span className="date-time-picker-time-label">End</span>
                  <Clock size={16} className="date-time-picker-time-icon" />
                  <div className="time-input-with-controls">
                    <select
                      value={endHours}
                      onChange={(e) => handleEndSelectChange(e.target.value, setEndHours)}
                    >
                      {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>
                  <span className="date-time-picker-time-separator">:</span>
                  <div className="time-input-with-controls">
                    <select
                      value={endMinutes}
                      onChange={(e) => handleEndSelectChange(e.target.value, setEndMinutes)}
                    >
                      {Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0')).map((val) => (
                        <option key={val} value={val}>{val}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="date-time-picker-done-container">
            <button className="date-time-picker-done-button" onClick={handleDone}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div
      className="date-time-picker-modal"
      style={{
        top: `${finalPosition.top}px`,
        left: `${finalPosition.left}px`,
      }}
      ref={modalRef}
    >
      <div className="date-time-picker-header">
        <div className="date-time-picker-title">
          {modalTitle}
        </div>
        <div className="date-time-picker-header-buttons">
          <button
            className="date-time-picker-close-button"
            onClick={handleCancel}
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {endDate && (
        <div className="date-range-summary">
          <div><strong>{startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}</strong></div>
          <button
            className="date-range-clear"
            onClick={handleClearEndDate}
            title="Convert to single day"
          >
            Clear End Date
          </button>
        </div>
      )}

      <div className="date-time-picker-calendar-container">
        <div className="date-time-picker-calendar" ref={calendarRef}></div>
      </div>

      <div className="date-time-picker-time-container">
        <div className="date-time-picker-all-day">
          <label>
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={handleAllDayChange}
            />
            All day
          </label>
        </div>

        {!isAllDay && (
          <>
            <div className="date-time-picker-time">
              {isMultiDay && <span className="date-time-picker-time-label">Start</span>}
              <Clock size={16} className="date-time-picker-time-icon" />
              <div className="time-input-with-controls">
                <input
                  type="text"
                  inputMode="numeric"
                  className="date-time-picker-time-input"
                  value={hours}
                  onChange={handleHoursChange}
                  onFocus={handleHoursFocus}
                  onBlur={handleHoursBlur}
                  maxLength={2}
                  placeholder="00"
                />
              </div>
              <span className="date-time-picker-time-separator">:</span>
              <div className="time-input-with-controls">
                <input
                  type="text"
                  inputMode="numeric"
                  className="date-time-picker-time-input"
                  value={minutes}
                  onChange={handleMinutesChange}
                  onFocus={handleMinutesFocus}
                  onBlur={handleMinutesBlur}
                  maxLength={2}
                  placeholder="00"
                />
              </div>
            </div>

            {isMultiDay && (
              <div className="date-time-picker-time">
                <span className="date-time-picker-time-label">End</span>
                <Clock size={16} className="date-time-picker-time-icon" />
                <div className="time-input-with-controls">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="date-time-picker-time-input"
                    value={endHours}
                    onChange={handleEndHoursChange}
                    onFocus={handleEndHoursFocus}
                    onBlur={handleEndHoursBlur}
                    maxLength={2}
                    placeholder="00"
                  />
                </div>
                <span className="date-time-picker-time-separator">:</span>
                <div className="time-input-with-controls">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="date-time-picker-time-input"
                    value={endMinutes}
                    onChange={handleEndMinutesChange}
                    onFocus={handleEndMinutesFocus}
                    onBlur={handleEndMinutesBlur}
                    maxLength={2}
                    placeholder="00"
                  />
                </div>
              </div>
            )}
          </>
        )}

        <div className="date-time-picker-done-container">
          <button className="date-time-picker-done-button" onClick={handleDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
