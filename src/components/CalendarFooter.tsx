import React, { useState, useEffect } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { CalendarSettings } from '../TasksCalendarSettings';
import { Plus, Trash2, RefreshCw, Settings } from 'lucide-react';

interface CalendarFooterProps {
  calendars: CalendarSettings[];
  activeCalendarId: string;
  onCalendarChange: (calendarId: string) => void;
  onCalendarAdd: () => void;
  onCalendarDelete: (calendarId: string) => void;
  onSettingsChange: (settings: CalendarSettings) => void;
  onRefresh: () => void;
}

export const CalendarFooter: React.FC<CalendarFooterProps> = ({
  calendars,
  activeCalendarId,
  onCalendarChange,
  onCalendarAdd,
  onCalendarDelete,
  onSettingsChange,
  onRefresh
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const activeCalendar = calendars.find(cal => cal.id === activeCalendarId) || calendars[0];

  // activeCalendarIdが変わったらsettingsパネルを閉じる
  useEffect(() => {
    setShowSettings(false);
  }, [activeCalendarId]);

  return (
    <div className="calendar-footer">
      <div className="calendar-selector-container">
        <span>Calendar: </span>
        <select
          key={activeCalendarId} // 強制的に再マウントするためのkey
          className="calendar-selector"
          value={activeCalendarId}
          onChange={(e) => onCalendarChange(e.target.value)}
        >
          {calendars.map(cal => (
            <option key={cal.id} value={cal.id}>
              {cal.name}
            </option>
          ))}
        </select>
      </div>

      <div className="calendar-actions">
        <button
          className="calendar-action-button calendar-add-button"
          onClick={onCalendarAdd}
          title="Add new calendar"
        >
          <Plus size={16} />
        </button>

        <button
          className="calendar-action-button calendar-settings-button"
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
        >
          <Settings size={16} />
        </button>

        <button
          className="calendar-action-button calendar-refresh-button"
          onClick={onRefresh}
          title="Refresh tasks"
        >
          <RefreshCw size={16} />
        </button>

        {activeCalendar.id !== 'default' && (
          <button
            className="calendar-action-button calendar-delete-button"
            onClick={() => {
              if (confirm(`Are you sure you want to delete '${activeCalendar.name}'?`)) {
                onCalendarDelete(activeCalendar.id);
              }
            }}
            title="Delete calendar"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {showSettings && (
        <SettingsPanel
          settings={activeCalendar}
          onSettingsChange={onSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};
