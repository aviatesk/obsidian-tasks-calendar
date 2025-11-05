import React, { useState, useEffect } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { CalendarSettings } from '../TasksCalendarSettings';
import {
  Plus,
  Trash2,
  RefreshCw,
  Settings,
  ChevronDown,
  Calendar,
} from 'lucide-react';

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
  onRefresh,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettings, setActiveSettings] = useState<CalendarSettings | null>(
    null
  );
  const calendarsList = getCalendarsList();

  // Fetch active calendar settings when activeCalendarId changes
  useEffect(() => {
    const fetchSettings = async () => {
      const settings = await getCalendarSettings(activeCalendarId);
      setActiveSettings(settings);
    };

    fetchSettings();
  }, [activeCalendarId, getCalendarSettings]);

  // Handle settings changes without closing the panel
  const handleSettingsChange = (updatedSettings: CalendarSettings) => {
    setActiveSettings(updatedSettings);
    onSettingsChange(updatedSettings);
  };

  return (
    <div className="calendar-footer">
      <div className="calendar-footer-content">
        <div className="calendar-selector-container">
          <Calendar size={18} className="calendar-selector-icon" />
          <select
            className="calendar-selector"
            value={activeCalendarId}
            onChange={e => onCalendarChange(e.target.value)}
            aria-label="Select calendar"
          >
            {calendarsList.map(cal => (
              <option key={cal.id} value={cal.id}>
                {cal.name}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="calendar-selector-chevron" />
        </div>

        <div className="calendar-actions">
          <button
            className="calendar-action-button calendar-add-button"
            onClick={onCalendarAdd}
            title="Add new calendar"
            aria-label="Add new calendar"
          >
            <Plus size={20} />
          </button>

          <button
            className={`calendar-action-button calendar-settings-button ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
            aria-label="Settings"
            aria-pressed={showSettings}
          >
            <Settings size={20} />
          </button>

          <button
            className="calendar-action-button calendar-refresh-button"
            onClick={onRefresh}
            title="Refresh tasks"
            aria-label="Refresh tasks"
          >
            <RefreshCw size={20} />
          </button>

          {activeSettings && activeSettings.id !== 'default' && (
            <button
              className="calendar-action-button calendar-delete-button"
              onClick={() => {
                if (
                  confirm(
                    `Are you sure you want to delete '${activeSettings.name}'?`
                  )
                ) {
                  onCalendarDelete(activeSettings.id);
                }
              }}
              title="Delete calendar"
              aria-label="Delete calendar"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
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
