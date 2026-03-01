import React, { useMemo } from 'react';
import { App } from 'obsidian';
import { CalendarSettings } from '../TasksCalendarSettings';
import {
  Plus,
  Trash2,
  RefreshCw,
  Settings,
  ChevronDown,
  Calendar,
} from 'lucide-react';
import { CalendarSettingsModal } from './CalendarSettingsModal';

interface CalendarFooterProps {
  app: App;
  getCalendarSettings: (calendarId: string) => CalendarSettings;
  getCalendarsList: () => { id: string; name: string }[];
  activeCalendarId: string;
  onCalendarChange: (calendarId: string) => void;
  onCalendarAdd: () => void;
  onCalendarDelete: (calendarId: string) => void;
  onSettingsChange: (settings: CalendarSettings) => void;
  onRefresh: () => void;
}

export const CalendarFooter: React.FC<CalendarFooterProps> = ({
  app,
  getCalendarSettings,
  getCalendarsList,
  activeCalendarId,
  onCalendarChange,
  onCalendarAdd,
  onCalendarDelete,
  onSettingsChange,
  onRefresh,
}) => {
  const activeSettings = useMemo(
    () => getCalendarSettings(activeCalendarId),
    [activeCalendarId, getCalendarSettings]
  );
  const calendarsList = getCalendarsList();

  const openSettingsModal = () => {
    new CalendarSettingsModal(
      app,
      activeSettings,
      onSettingsChange,
      activeSettings.id !== 'default'
        ? () => onCalendarDelete(activeSettings.id)
        : undefined
    ).open();
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
          <ChevronDown size={18} className="calendar-selector-chevron" />
        </div>

        <div className="calendar-actions">
          <button
            className="calendar-action-button calendar-add-button"
            onClick={onCalendarAdd}
            title="Add new calendar"
            aria-label="Add new calendar"
          >
            <Plus size={18} />
          </button>

          <button
            className="calendar-action-button calendar-settings-button"
            onClick={openSettingsModal}
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>

          <button
            className="calendar-action-button calendar-refresh-button"
            onClick={onRefresh}
            title="Refresh tasks"
            aria-label="Refresh tasks"
          >
            <RefreshCw size={18} />
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
              <Trash2 size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
