import { Platform } from 'obsidian';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import { X, Clock } from 'lucide-react';
import { FIRST_DAY } from 'src/TasksCalendarSettings';
import { calculateOptimalPosition } from '../utils/position';

interface DateTimePickerModalProps {
  initialDate: Date;
  isAllDay: boolean;
  onClose: () => void;
  onSave: (date: Date, isAllDay: boolean) => void;
  position: { top: number; left: number };
  isStartDate?: boolean; // Whether this is start date or end date
}

export const DateTimePickerModal: React.FC<DateTimePickerModalProps> = ({
  initialDate,
  isAllDay: initialIsAllDay,
  onClose,
  onSave,
  position,
  isStartDate = true
}) => {
  // State for current values
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(initialDate));
  const [isAllDay, setIsAllDay] = useState<boolean>(initialIsAllDay);
  const [hours, setHours] = useState<string>(
    initialDate.getHours().toString().padStart(2, '0')
  );
  const [minutes, setMinutes] = useState<string>(
    initialDate.getMinutes().toString().padStart(2, '0')
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

  // Position state
  const [finalPosition, setFinalPosition] = useState(position);

  // Determine if on mobile or desktop
  const isMobile = Platform.isMobile;

  // Create a result date from current state
  const createResultDate = useCallback(() => {
    const resultDate = new Date(selectedDate);

    if (!isAllDay) {
      const parsedHours = parseInt(hours, 10);
      const parsedMinutes = parseInt(minutes, 10);

      resultDate.setHours(isNaN(parsedHours) ? 0 : parsedHours);
      resultDate.setMinutes(isNaN(parsedMinutes) ? 0 : parsedMinutes);
    } else {
      resultDate.setHours(0);
      resultDate.setMinutes(0);
      resultDate.setSeconds(0);
      resultDate.setMilliseconds(0);
    }

    return resultDate;
  }, [selectedDate, isAllDay, hours, minutes]);

  // Handle date changes - update immediately
  const handleDateChange = useCallback((newDate: Date) => {
    setSelectedDate(newDate);

    // Cancel any pending time input debounce
    if (timeInputDebounceTimerRef.current) {
      clearTimeout(timeInputDebounceTimerRef.current);
      timeInputDebounceTimerRef.current = null;
    }

    // Save immediately
    const resultDate = new Date(newDate);

    if (!isAllDay) {
      const parsedHours = parseInt(hours, 10);
      const parsedMinutes = parseInt(minutes, 10);

      resultDate.setHours(isNaN(parsedHours) ? 0 : parsedHours);
      resultDate.setMinutes(isNaN(parsedMinutes) ? 0 : parsedMinutes);
    } else {
      resultDate.setHours(0);
      resultDate.setMinutes(0);
      resultDate.setSeconds(0);
      resultDate.setMilliseconds(0);
    }

    onSave(resultDate, isAllDay);
  }, [isAllDay, hours, minutes, onSave]);

  // Handle all-day toggle - update immediately
  const handleAllDayChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newIsAllDay = e.target.checked;
    setIsAllDay(newIsAllDay);

    // Cancel any pending time input debounce
    if (timeInputDebounceTimerRef.current) {
      clearTimeout(timeInputDebounceTimerRef.current);
      timeInputDebounceTimerRef.current = null;
    }

    // Save immediately
    const resultDate = createResultDate();

    if (newIsAllDay) {
      resultDate.setHours(0);
      resultDate.setMinutes(0);
      resultDate.setSeconds(0);
      resultDate.setMilliseconds(0);
    }

    onSave(resultDate, newIsAllDay);
  }, [createResultDate, onSave]);

  // Handle time input changes with a short debounce
  const handleTimeInputChange = useCallback((newValue: string, setter: React.Dispatch<React.SetStateAction<string>>, isHoursSetter: boolean) => {
    setter(newValue);

    // Use a short debounce for time inputs to avoid excessive updates while typing
    if (timeInputDebounceTimerRef.current) {
      clearTimeout(timeInputDebounceTimerRef.current);
    }

    timeInputDebounceTimerRef.current = setTimeout(() => {
      const resultDate = createResultDate();
      onSave(resultDate, isAllDay);
      timeInputDebounceTimerRef.current = null;
    }, 300); // Much shorter debounce time
  }, [createResultDate, isAllDay, onSave]);

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
        // If there's a pending time input save, execute it now
        if (timeInputDebounceTimerRef.current) {
          clearTimeout(timeInputDebounceTimerRef.current);
          timeInputDebounceTimerRef.current = null;

          const resultDate = createResultDate();
          onSave(resultDate, isAllDay);
        }

        onClose();
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
  }, [onClose, createResultDate, isAllDay, onSave]);

  // Initialize calendar
  useEffect(() => {
    if (calendarRef.current) {
      const calendar = new Calendar(calendarRef.current, {
        plugins: [dayGridPlugin],
        initialView: 'dayGridMonth',
        initialDate: selectedDate,
        headerToolbar: {
          left: 'prev',
          center: 'title',
          right: 'next'
        },
        aspectRatio: 0.75,
        selectable: false,
        events: [],
        navLinks: false,
        firstDay: FIRST_DAY,
        dayCellDidMount: (info) => {
          const cellDate = info.date;
          const isSelected =
            cellDate.getFullYear() === selectedDate.getFullYear() &&
            cellDate.getMonth() === selectedDate.getMonth() &&
            cellDate.getDate() === selectedDate.getDate();

          if (isSelected) {
            info.el.classList.add('fc-day-selected');
          }
        },
        dayHeaderFormat: { weekday: 'narrow' },
        fixedWeekCount: false
      });

      calendar.render();
      calendarInstance.current = calendar;

      setTimeout(() => {
        if (calendarRef.current) {
          updateSelectedDateHighlight(selectedDate);

          const days = calendarRef.current.querySelectorAll('.fc-daygrid-day');
          days.forEach(day => {
            day.addEventListener('click', (e) => {
              e.stopPropagation();
              const dateStr = day.getAttribute('data-date');
              if (dateStr) {
                handleDateClick(dateStr);
              }
            });
          });
        }
      }, 100);

      return () => {
        calendar.destroy();
      };
    }
  }, []); // Only run once on mount

  // Update calendar when selected date changes
  useEffect(() => {
    if (calendarInstance.current) {
      updateSelectedDateHighlight(selectedDate);
      calendarInstance.current.gotoDate(selectedDate);
    }
  }, [selectedDate]);

  // Function to highlight the selected date
  const updateSelectedDateHighlight = (date: Date) => {
    if (!calendarRef.current) return;

    // Remove existing selections
    const selectedCells = calendarRef.current.querySelectorAll('.fc-day-selected');
    selectedCells.forEach(el => el.classList.remove('fc-day-selected'));

    // Remove today highlights
    const todayCells = calendarRef.current.querySelectorAll('.fc-day-today');
    todayCells.forEach(el => el.classList.remove('fc-day-today'));

    // Add new selection
    const dateStr = date.toISOString().split('T')[0];
    const newSelectedCell = calendarRef.current.querySelector(`[data-date="${dateStr}"]`);
    if (newSelectedCell) {
      newSelectedCell.classList.add('fc-day-selected');
    }
  };

  // Handle date click (immediate update)
  const handleDateClick = (dateStr: string) => {
    const clickedDate = new Date(dateStr);
    const newDate = new Date(selectedDate);
    newDate.setFullYear(clickedDate.getFullYear());
    newDate.setMonth(clickedDate.getMonth());
    newDate.setDate(clickedDate.getDate());

    // Preserve existing time
    const currentHours = parseInt(hours, 10) || 0;
    const currentMinutes = parseInt(minutes, 10) || 0;
    newDate.setHours(currentHours);
    newDate.setMinutes(currentMinutes);

    // Update UI and save immediately
    handleDateChange(newDate);
  };

  // Hours input change handler with validation
  const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (value === '') {
      handleTimeInputChange('', setHours, true);
      return;
    }

    const numericValue = value.replace(/[^0-9]/g, '');
    const numValue = parseInt(numericValue, 10);

    if (isNaN(numValue)) return;

    if (hoursInputFocused) {
      if (numValue <= 23) {
        handleTimeInputChange(numericValue, setHours, true);
      }
    } else {
      if (numValue >= 0 && numValue <= 23) {
        handleTimeInputChange(numValue.toString().padStart(2, '0'), setHours, true);
      }
    }
  };

  // Minutes input change handler with validation
  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (value === '') {
      handleTimeInputChange('', setMinutes, false);
      return;
    }

    const numericValue = value.replace(/[^0-9]/g, '');
    const numValue = parseInt(numericValue, 10);

    if (isNaN(numValue)) return;

    if (minutesInputFocused) {
      if (numValue <= 59) {
        handleTimeInputChange(numericValue, setMinutes, false);
      }
    } else {
      if (numValue >= 0 && numValue <= 59) {
        handleTimeInputChange(numValue.toString().padStart(2, '0'), setMinutes, false);
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
        const resultDate = createResultDate();
        onSave(resultDate, isAllDay);
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
        const resultDate = createResultDate();
        onSave(resultDate, isAllDay);
      }
    }
  };

  // Handle select changes for mobile (immediate update)
  const handleSelectChange = (value: string, setter: React.Dispatch<React.SetStateAction<string>>, isHours: boolean) => {
    setter(value);

    // Save immediately
    setTimeout(() => {
      const resultDate = createResultDate();
      onSave(resultDate, isAllDay);
    }, 0);
  };

  // Render different container based on mobile or desktop
  return isMobile ? (
    <div className="mobile-modal-overlay">
      <div className="date-time-picker-modal" ref={modalRef}>
        <div className="date-time-picker-header">
          <div className="date-time-picker-title">
            {isStartDate ? 'Start' : 'End'} Date
          </div>
          <div className="date-time-picker-header-buttons">
            <button
              className="date-time-picker-close-button"
              onClick={onClose}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

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
            <div className="date-time-picker-time">
              <Clock size={16} className="date-time-picker-time-icon" />
              <div className="time-input-with-controls">
                <select
                  value={hours}
                  onChange={(e) => handleSelectChange(e.target.value, setHours, true)}
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
                  onChange={(e) => handleSelectChange(e.target.value, setMinutes, false)}
                >
                  {Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0')).map((val) => (
                    <option key={val} value={val}>{val}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
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
          {isStartDate ? 'Start' : 'End'} Date
        </div>
        <div className="date-time-picker-header-buttons">
          <button
            className="date-time-picker-close-button"
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

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
          <div className="date-time-picker-time">
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
        )}
      </div>
    </div>
  );
};
