import { DateTime } from 'luxon';
import { Platform } from 'obsidian';
import React, { useEffect, useRef, useState } from 'react';
import { X, Calendar, Check } from 'lucide-react';
import {
  RecurrenceFrequency,
  RecurrenceRule,
  describeRecurrenceRule
} from '../backend/recurrence';
import { calculateOptimalPosition } from '../backend/position';

interface RecurrenceEditorProps {
  initialRule?: RecurrenceRule;
  onClose: () => void;
  onSave: (rule: RecurrenceRule) => void;
  position: { top: number; left: number };
  startDate: Date;
}

export const RecurrenceEditor: React.FC<RecurrenceEditorProps> = ({
  initialRule,
  onClose,
  onSave,
  position,
  startDate
}) => {
  // State for recurrence options
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    initialRule?.frequency || 'daily'
  );
  const [interval, setInterval] = useState<number>(
    initialRule?.interval || 1
  );
  const [endType, setEndType] = useState<'count' | 'until'>(
    initialRule?.until ? 'until' : 'count'
  );
  const [count, setCount] = useState<number>(
    initialRule?.count || 5
  );
  const [untilDate, setUntilDate] = useState<Date>(
    initialRule?.until ? new Date(initialRule.until.toJSDate()) : new Date(startDate)
  );

  // Weekly options
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(
    initialRule?.weekdays || [1, 2, 3, 4, 5] // Monday-Friday by default
  );

  // Monthly options
  const [monthlyOptionType, setMonthlyOptionType] = useState<'day' | 'weekday'>(
    initialRule?.monthDay ? 'day' : 'weekday'
  );
  const [monthDay, setMonthDay] = useState<number>(
    initialRule?.monthDay || startDate.getDate()
  );
  const [monthWeek, setMonthWeek] = useState<number>(
    initialRule?.monthWeek !== undefined ? initialRule.monthWeek : 1
  );
  const [monthWeekday, setMonthWeekday] = useState<number>(
    initialRule?.monthWeekday !== undefined ? initialRule.monthWeekday : startDate.getDay()
  );

  // Modal positioning
  const [finalPosition, setFinalPosition] = useState(position);
  const modalRef = useRef<HTMLDivElement>(null);
  const isMobile = Platform.isMobile;

  // Update until date when endType changes
  useEffect(() => {
    if (endType === 'until' && !initialRule?.until) {
      // Set default until date to 1 year from start date
      const defaultUntilDate = new Date(startDate);
      defaultUntilDate.setFullYear(defaultUntilDate.getFullYear() + 1);
      setUntilDate(defaultUntilDate);
    }
  }, [endType, startDate, initialRule]);

  // Calculate optimal position on mount
  useEffect(() => {
    if (!isMobile && modalRef.current) {
      const sourceEl = document.createElement('div');
      sourceEl.style.position = 'absolute';
      sourceEl.style.left = `${position.left}px`;
      sourceEl.style.top = `${position.top}px`;
      document.body.appendChild(sourceEl);

      const optimalPosition = calculateOptimalPosition(sourceEl, modalRef.current, 10);
      setFinalPosition(optimalPosition);

      document.body.removeChild(sourceEl);
    }
  }, [position, isMobile]);

  // Handle save button click
  const handleSave = () => {
    const rule: RecurrenceRule = {
      frequency,
      interval
    };

    if (endType === 'count') {
      rule.count = count;
    } else {
      // Create a DateTime object for the until date
      const dateObj = new Date(untilDate);
      // Make sure it's set to end of day
      dateObj.setHours(23, 59, 59, 999);
      // Convert to DateTime format expected by backend
      rule.until = DateTime.fromJSDate(dateObj);
    }

    // Add frequency-specific options
    if (frequency === 'weekly' && selectedWeekdays.length > 0) {
      rule.weekdays = selectedWeekdays;
    }

    if (frequency === 'monthly') {
      if (monthlyOptionType === 'day') {
        rule.monthDay = monthDay;
      } else {
        rule.monthWeek = monthWeek;
        rule.monthWeekday = monthWeekday;
      }
    }

    onSave(rule);
  };

  // Handle weekday toggle
  const toggleWeekday = (day: number) => {
    setSelectedWeekdays(prev => {
      if (prev.includes(day)) {
        return prev.filter(d => d !== day);
      } else {
        return [...prev, day].sort();
      }
    });
  };

  // Generate interval options
  const intervalOptions = Array.from({ length: 30 }, (_, i) => i + 1).map(val => (
    <option key={val} value={val}>{val}</option>
  ));

  // Generate month day options (1-31)
  const monthDayOptions = Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
    <option key={day} value={day}>{day}</option>
  ));

  // Generate week number options (1-5 + last)
  const weekNumberOptions = [
    { value: 1, label: "First" },
    { value: 2, label: "Second" },
    { value: 3, label: "Third" },
    { value: 4, label: "Fourth" },
    { value: 5, label: "Fifth" },
    { value: -1, label: "Last" }
  ];

  // Generate weekday options
  const weekdayOptions = [
    { value: 0, label: "Sunday" },
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" }
  ];

  // Generate a preview of the recurrence rule
  const getRecurrencePreview = () => {
    const previewRule: RecurrenceRule = {
      frequency,
      interval
    };

    if (endType === 'count') {
      previewRule.count = count;
    } else {
      const dateObj = new Date(untilDate);
      dateObj.setHours(23, 59, 59, 999);
      previewRule.until = DateTime.fromJSDate(dateObj);
    }

    if (frequency === 'weekly' && selectedWeekdays.length > 0) {
      previewRule.weekdays = selectedWeekdays;
    }

    if (frequency === 'monthly') {
      if (monthlyOptionType === 'day') {
        previewRule.monthDay = monthDay;
      } else {
        previewRule.monthWeek = monthWeek;
        previewRule.monthWeekday = monthWeekday;
      }
    }

    return describeRecurrenceRule(previewRule);
  };

  const handleFrequencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFrequency = e.target.value as RecurrenceFrequency;
    setFrequency(newFrequency);

    // Reset some options when frequency changes
    if (newFrequency === 'weekly') {
      setSelectedWeekdays([1, 2, 3, 4, 5]); // Mon-Fri by default
    }
  };

  // Render different container based on mobile or desktop
  return isMobile ? (
    <div className="mobile-modal-overlay">
      <div className="recurrence-editor-modal" ref={modalRef}>
        <div className="recurrence-editor-header">
          <div className="recurrence-editor-title">
            Edit Recurrence
          </div>
          <div className="recurrence-editor-header-buttons">
            <button
              className="recurrence-editor-close-button"
              onClick={onClose}
              title="Cancel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="recurrence-editor-content">
          <div className="recurrence-editor-group">
            <label className="recurrence-editor-label">Repeat every</label>
            <div className="recurrence-editor-input-group">
              <select
                className="recurrence-editor-select recurrence-editor-interval"
                value={interval}
                onChange={(e) => setInterval(parseInt(e.target.value))}
              >
                {intervalOptions}
              </select>
              <select
                className="recurrence-editor-select recurrence-editor-frequency"
                value={frequency}
                onChange={handleFrequencyChange}
              >
                <option value="daily">day(s)</option>
                <option value="weekly">week(s)</option>
                <option value="monthly">month(s)</option>
                <option value="yearly">year(s)</option>
              </select>
            </div>
          </div>

          {/* Weekly options */}
          {frequency === 'weekly' && (
            <div className="recurrence-editor-group">
              <label className="recurrence-editor-label">Repeat on</label>
              <div className="recurrence-editor-weekdays">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                  <button
                    key={index}
                    className={`recurrence-editor-weekday-button ${selectedWeekdays.includes(index) ? 'active' : ''}`}
                    onClick={() => toggleWeekday(index)}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Monthly options */}
          {frequency === 'monthly' && (
            <div className="recurrence-editor-group">
              <label className="recurrence-editor-label">Repeat by</label>
              <div className="recurrence-editor-monthly-options">
                <label className="recurrence-editor-radio-label">
                  <input
                    type="radio"
                    name="monthlyType"
                    checked={monthlyOptionType === 'day'}
                    onChange={() => setMonthlyOptionType('day')}
                  />
                  Day of month
                </label>
                {monthlyOptionType === 'day' && (
                  <div className="recurrence-editor-input-group">
                    <select
                      className="recurrence-editor-select"
                      value={monthDay}
                      onChange={(e) => setMonthDay(parseInt(e.target.value))}
                    >
                      {monthDayOptions}
                    </select>
                  </div>
                )}

                <label className="recurrence-editor-radio-label">
                  <input
                    type="radio"
                    name="monthlyType"
                    checked={monthlyOptionType === 'weekday'}
                    onChange={() => setMonthlyOptionType('weekday')}
                  />
                  Day of week
                </label>
                {monthlyOptionType === 'weekday' && (
                  <div className="recurrence-editor-input-group">
                    <select
                      className="recurrence-editor-select"
                      value={monthWeek}
                      onChange={(e) => setMonthWeek(parseInt(e.target.value))}
                    >
                      {weekNumberOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <select
                      className="recurrence-editor-select"
                      value={monthWeekday}
                      onChange={(e) => setMonthWeekday(parseInt(e.target.value))}
                    >
                      {weekdayOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="recurrence-editor-group">
            <label className="recurrence-editor-label">Ends</label>
            <div className="recurrence-editor-end-options">
              <label className="recurrence-editor-radio-label">
                <input
                  type="radio"
                  name="endType"
                  checked={endType === 'count'}
                  onChange={() => setEndType('count')}
                />
                After
                <input
                  type="number"
                  className="recurrence-editor-number-input"
                  value={count}
                  min={1}
                  max={100}
                  onChange={(e) => setCount(parseInt(e.target.value) || 5)}
                  disabled={endType !== 'count'}
                />
                occurrences
              </label>

              <label className="recurrence-editor-radio-label">
                <input
                  type="radio"
                  name="endType"
                  checked={endType === 'until'}
                  onChange={() => setEndType('until')}
                />
                On date
              </label>
              {endType === 'until' && (
                <div className="recurrence-editor-date-container">
                  <div className="recurrence-editor-date-display">
                    <Calendar size={18} className="recurrence-editor-date-icon" />
                    <input
                      type="date"
                      className="recurrence-editor-date-input"
                      value={untilDate.toISOString().split('T')[0]}
                      onChange={(e) => setUntilDate(new Date(e.target.value))}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="recurrence-editor-preview">
            <div className="recurrence-editor-preview-label">Summary:</div>
            <div className="recurrence-editor-preview-text">{getRecurrencePreview()}</div>
          </div>

          <div className="recurrence-editor-actions">
            <button
              className="recurrence-editor-cancel-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="recurrence-editor-save-button"
              onClick={handleSave}
            >
              Save
              <Check size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div
      className="recurrence-editor-modal"
      style={{
        top: `${finalPosition.top}px`,
        left: `${finalPosition.left}px`,
      }}
      ref={modalRef}
    >
      <div className="recurrence-editor-header">
        <div className="recurrence-editor-title">
          Edit Recurrence
        </div>
        <div className="recurrence-editor-header-buttons">
          <button
            className="recurrence-editor-close-button"
            onClick={onClose}
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="recurrence-editor-content">
        <div className="recurrence-editor-group">
          <label className="recurrence-editor-label">Repeat every</label>
          <div className="recurrence-editor-input-group">
            <select
              className="recurrence-editor-select recurrence-editor-interval"
              value={interval}
              onChange={(e) => setInterval(parseInt(e.target.value))}
            >
              {intervalOptions}
            </select>
            <select
              className="recurrence-editor-select recurrence-editor-frequency"
              value={frequency}
              onChange={handleFrequencyChange}
            >
              <option value="daily">day(s)</option>
              <option value="weekly">week(s)</option>
              <option value="monthly">month(s)</option>
              <option value="yearly">year(s)</option>
            </select>
          </div>
        </div>

        {/* Weekly options */}
        {frequency === 'weekly' && (
          <div className="recurrence-editor-group">
            <label className="recurrence-editor-label">Repeat on</label>
            <div className="recurrence-editor-weekdays">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <button
                  key={index}
                  className={`recurrence-editor-weekday-button ${selectedWeekdays.includes(index) ? 'active' : ''}`}
                  onClick={() => toggleWeekday(index)}
                  title={weekdayOptions[index].label}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Monthly options */}
        {frequency === 'monthly' && (
          <div className="recurrence-editor-group">
            <label className="recurrence-editor-label">Repeat by</label>
            <div className="recurrence-editor-monthly-options">
              <label className="recurrence-editor-radio-label">
                <input
                  type="radio"
                  name="monthlyType"
                  checked={monthlyOptionType === 'day'}
                  onChange={() => setMonthlyOptionType('day')}
                />
                Day of month
              </label>
              {monthlyOptionType === 'day' && (
                <div className="recurrence-editor-input-group">
                  <select
                    className="recurrence-editor-select"
                    value={monthDay}
                    onChange={(e) => setMonthDay(parseInt(e.target.value))}
                  >
                    {monthDayOptions}
                  </select>
                </div>
              )}

              <label className="recurrence-editor-radio-label">
                <input
                  type="radio"
                  name="monthlyType"
                  checked={monthlyOptionType === 'weekday'}
                  onChange={() => setMonthlyOptionType('weekday')}
                />
                Day of week
              </label>
              {monthlyOptionType === 'weekday' && (
                <div className="recurrence-editor-input-group">
                  <select
                    className="recurrence-editor-select"
                    value={monthWeek}
                    onChange={(e) => setMonthWeek(parseInt(e.target.value))}
                  >
                    {weekNumberOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <select
                    className="recurrence-editor-select"
                    value={monthWeekday}
                    onChange={(e) => setMonthWeekday(parseInt(e.target.value))}
                  >
                    {weekdayOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="recurrence-editor-group">
          <label className="recurrence-editor-label">Ends</label>
          <div className="recurrence-editor-end-options">
            <label className="recurrence-editor-radio-label">
              <input
                type="radio"
                name="endType"
                checked={endType === 'count'}
                onChange={() => setEndType('count')}
              />
              After
              <input
                type="number"
                className="recurrence-editor-number-input"
                value={count}
                min={1}
                max={100}
                onChange={(e) => setCount(parseInt(e.target.value) || 5)}
                disabled={endType !== 'count'}
              />
              occurrences
            </label>

            <label className="recurrence-editor-radio-label">
              <input
                type="radio"
                name="endType"
                checked={endType === 'until'}
                onChange={() => setEndType('until')}
              />
              On date
            </label>
            {endType === 'until' && (
              <div className="recurrence-editor-date-container">
                <div className="recurrence-editor-date-display">
                  <Calendar size={16} className="recurrence-editor-date-icon" />
                  <input
                    type="date"
                    className="recurrence-editor-date-input"
                    value={untilDate.toISOString().split('T')[0]}
                    onChange={(e) => setUntilDate(new Date(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="recurrence-editor-preview">
          <div className="recurrence-editor-preview-label">Summary:</div>
          <div className="recurrence-editor-preview-text">{getRecurrencePreview()}</div>
        </div>

        <div className="recurrence-editor-actions">
          <button
            className="recurrence-editor-cancel-button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="recurrence-editor-save-button"
            onClick={handleSave}
          >
            Save
            <Check size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
