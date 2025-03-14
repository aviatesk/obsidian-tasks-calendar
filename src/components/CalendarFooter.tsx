import React, { useState, useEffect } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { CalendarSettings } from '../TasksCalendarSettings';
import { Plus, Trash2, RefreshCw, Settings } from 'lucide-react';

interface CalendarFooterProps {
  getCalendarSettings: (calendarId: string) => Promise<CalendarSettings>;
  getCalendarsList: () => { id: string; name: string }[];
  activeCalendarId: string;
  onCalendarChange: (calendarId: string) => void;
  onCalendarAdd: () => void;
  onCalendarDelete: (calendarId: string) => void;
  onSettingsChange: (settings: CalendarSettings) => void;
  onRefresh: () => void;
}

export const CalendarFooter: React.FC<CalendarFooterProps> = ({
  getCalendarSettings,
  getCalendarsList,
  activeCalendarId,
  onCalendarChange,
  onCalendarAdd,
  onCalendarDelete,
  onSettingsChange,
  onRefresh
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettings, setActiveSettings] = useState<CalendarSettings | null>(null);
  const calendarsList = getCalendarsList();

  // Fetch active calendar settings when activeCalendarId changes
  useEffect(() => {
    const fetchSettings = async () => {
      const settings = await getCalendarSettings(activeCalendarId);
      setActiveSettings(settings);
    };

    fetchSettings();
    // Only close settings panel when calendar changes, not when settings update
  }, [activeCalendarId, getCalendarSettings]);

  // Handle settings changes without closing the panel
  const handleSettingsChange = (updatedSettings: CalendarSettings) => {
    // Update local state first
    setActiveSettings(updatedSettings);
    // Then propagate change to parent
    onSettingsChange(updatedSettings);
  };

  return (
    <div className="calendar-footer">
      <div className="calendar-selector-container">
        <span>Calendar: </span>
        <select
          className="calendar-selector"
          value={activeCalendarId}
          onChange={(e) => onCalendarChange(e.target.value)}
        >
          {calendarsList.map(cal => (
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

        {activeSettings && activeSettings.id !== 'default' && (
          <button
            className="calendar-action-button calendar-delete-button"
            onClick={() => {
              if (confirm(`Are you sure you want to delete '${activeSettings.name}'?`)) {
                onCalendarDelete(activeSettings.id);
              }
            }}
            title="Delete calendar"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {showSettings && activeSettings && (
        <SettingsPanel
          settings={activeSettings}
          onSettingsChange={handleSettingsChange}
          onDeleteCalendar={
            activeSettings.id !== 'default'
              ? () => onCalendarDelete(activeSettings.id)
              : undefined
          }
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};
