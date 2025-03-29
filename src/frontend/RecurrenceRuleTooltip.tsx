import React, { useEffect, useState, useRef } from 'react';
import { Platform } from 'obsidian';
import { Calendar, X, Clock } from 'lucide-react';
import { DateTimePickerModal } from './DateTimePickerModal';
import { calculateOptimalPosition } from '../backend/position';
import { RecurrenceRule } from '../backend/recurrence';
import { DateTime } from 'luxon';

interface RecurrenceRuleTooltipProps {
  initialRule?: RecurrenceRule;
  position: { top: number; left: number };
  onClose: () => void;
  onDone: (rule: RecurrenceRule) => void;
}

export const RecurrenceRuleTooltip: React.FC<RecurrenceRuleTooltipProps> = ({
  initialRule,
  position,
  onClose,
  onDone,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const isMobile = Platform.isMobile;

  // State for recurrence rule
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>(
    initialRule?.frequency || 'daily'
  );
  const [interval, setInterval] = useState<number>(initialRule?.interval || 1);
  const [weekdays, setWeekdays] = useState<number[]>(initialRule?.weekdays || []);
  const [until, setUntil] = useState<DateTime | undefined>(initialRule?.until);

  // State for date picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerPosition, setDatePickerPosition] = useState({ top: 0, left: 0 });

  // Position state
  const [finalPosition, setFinalPosition] = useState(position);

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
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Handle frequency change
  const handleFrequencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFrequency = e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly';
    setFrequency(newFrequency);
    // Reset weekdays when changing from weekly to another frequency
    if (newFrequency !== 'weekly') {
      setWeekdays([]);
    }
  };

  // Handle interval change
  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setInterval(value);
    }
  };

  // Handle weekday toggle
  const handleWeekdayToggle = (day: number) => {
    setWeekdays(prev => {
      if (prev.includes(day)) {
        return prev.filter(d => d !== day);
      } else {
        return [...prev, day].sort();
      }
    });
  };

  // Handle until date click
  const handleUntilDateClick = (e: React.MouseEvent) => {
    if (isMobile) {
      setDatePickerPosition({ top: 0, left: 0 });
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setDatePickerPosition({ top: rect.bottom + 5, left: rect.left });
    }
    setShowDatePicker(true);
  };

  // Handle date picker done
  const handleDatePickerDone = (date: Date) => {
    setUntil(DateTime.fromJSDate(date));
    setShowDatePicker(false);
  };

  // Handle done button click
  const handleDone = () => {
    onDone({
      frequency,
      interval,
      weekdays: frequency === 'weekly' ? weekdays : undefined,
      until,
    });
  };

  // Format until date for display
  const formatUntilDate = (date?: DateTime) => {
    if (!date) return 'No end date';
    return date.toJSDate().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Weekday labels
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Render different container based on mobile or desktop
  return isMobile ? (
    <div className="mobile-modal-overlay">
      <div className="recurrence-rule-tooltip" ref={modalRef}>
        <div className="recurrence-rule-tooltip-header">
          <div className="recurrence-rule-tooltip-title">
            Repeat
          </div>
          <div className="recurrence-rule-tooltip-header-buttons">
            <button
              className="recurrence-rule-tooltip-close-button"
              onClick={onClose}
              title="Cancel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="recurrence-rule-tooltip-content">
          <div className="recurrence-rule-tooltip-section">
            <div className="recurrence-rule-tooltip-row">
              <Clock size={18} className="recurrence-rule-tooltip-icon" />
              <select
                value={frequency}
                onChange={handleFrequencyChange}
                className="recurrence-rule-tooltip-select"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div className="recurrence-rule-tooltip-row">
              <span className="recurrence-rule-tooltip-label">Every</span>
              <input
                type="number"
                min="1"
                value={interval}
                onChange={handleIntervalChange}
                className="recurrence-rule-tooltip-number-input"
              />
              <span className="recurrence-rule-tooltip-label">
                {frequency === 'daily' && 'days'}
                {frequency === 'weekly' && 'weeks'}
                {frequency === 'monthly' && 'months'}
                {frequency === 'yearly' && 'years'}
              </span>
            </div>
          </div>

          {frequency === 'weekly' && (
            <div className="recurrence-rule-tooltip-section">
              <div className="recurrence-rule-tooltip-weekdays">
                {weekdayLabels.map((label, index) => (
                  <button
                    key={label}
                    className={`recurrence-rule-tooltip-weekday-button ${
                      weekdays.includes(index) ? 'selected' : ''
                    }`}
                    onClick={() => handleWeekdayToggle(index)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="recurrence-rule-tooltip-section">
            <div className="recurrence-rule-tooltip-row">
              <Calendar size={18} className="recurrence-rule-tooltip-icon" />
              <button
                className="recurrence-rule-tooltip-until-button"
                onClick={handleUntilDateClick}
              >
                {formatUntilDate(until)}
              </button>
            </div>
          </div>

          <div className="recurrence-rule-tooltip-done-container">
            <button
              className="recurrence-rule-tooltip-done-button"
              onClick={handleDone}
              disabled={frequency === 'weekly' && weekdays.length === 0}
            >
              Done
            </button>
          </div>
        </div>

        {showDatePicker && (
          <DateTimePickerModal
            initialStartDate={until?.toJSDate() || new Date()}
            isAllDay={true}
            onClose={() => setShowDatePicker(false)}
            onDone={(date) => handleDatePickerDone(date)}
            position={datePickerPosition}
          />
        )}
      </div>
    </div>
  ) : (
    <div
      className="recurrence-rule-tooltip"
      style={{
        top: `${finalPosition.top}px`,
        left: `${finalPosition.left}px`,
      }}
      ref={modalRef}
    >
      <div className="recurrence-rule-tooltip-header">
        <div className="recurrence-rule-tooltip-title">
          Repeat
        </div>
        <div className="recurrence-rule-tooltip-header-buttons">
          <button
            className="recurrence-rule-tooltip-close-button"
            onClick={onClose}
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="recurrence-rule-tooltip-content">
        <div className="recurrence-rule-tooltip-section">
          <div className="recurrence-rule-tooltip-row">
            <Clock size={16} className="recurrence-rule-tooltip-icon" />
            <select
              value={frequency}
              onChange={handleFrequencyChange}
              className="recurrence-rule-tooltip-select"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div className="recurrence-rule-tooltip-row">
            <span className="recurrence-rule-tooltip-label">Every</span>
            <input
              type="number"
              min="1"
              value={interval}
              onChange={handleIntervalChange}
              className="recurrence-rule-tooltip-number-input"
            />
            <span className="recurrence-rule-tooltip-label">
              {frequency === 'daily' && 'days'}
              {frequency === 'weekly' && 'weeks'}
              {frequency === 'monthly' && 'months'}
              {frequency === 'yearly' && 'years'}
            </span>
          </div>
        </div>

        {frequency === 'weekly' && (
          <div className="recurrence-rule-tooltip-section">
            <div className="recurrence-rule-tooltip-weekdays">
              {weekdayLabels.map((label, index) => (
                <button
                  key={label}
                  className={`recurrence-rule-tooltip-weekday-button ${
                    weekdays.includes(index) ? 'selected' : ''
                  }`}
                  onClick={() => handleWeekdayToggle(index)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="recurrence-rule-tooltip-section">
          <div className="recurrence-rule-tooltip-row">
            <Calendar size={16} className="recurrence-rule-tooltip-icon" />
            <button
              className="recurrence-rule-tooltip-until-button"
              onClick={handleUntilDateClick}
            >
              {formatUntilDate(until)}
            </button>
          </div>
        </div>

        <div className="recurrence-rule-tooltip-done-container">
          <button
            className="recurrence-rule-tooltip-done-button"
            onClick={handleDone}
            disabled={frequency === 'weekly' && weekdays.length === 0}
          >
            Done
          </button>
        </div>
      </div>

      {showDatePicker && (
        <DateTimePickerModal
          initialStartDate={until?.toJSDate() || new Date()}
          isAllDay={true}
          onClose={() => setShowDatePicker(false)}
          onDone={(date) => handleDatePickerDone(date)}
          position={datePickerPosition}
        />
      )}
    </div>
  );
};
