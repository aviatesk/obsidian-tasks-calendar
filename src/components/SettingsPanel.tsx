import React, { useState, useEffect, useRef } from 'react';
import { CalendarSettings, DEFAULT_CALENDAR_SETTINGS } from '../TasksCalendarSettings';
import { RefreshCw, X } from 'lucide-react';

interface SettingsPanelProps {
  settings: CalendarSettings;
  onSettingsChange: (settings: CalendarSettings) => void;
  onDeleteCalendar?: () => void;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSettingsChange,
  onDeleteCalendar,
  onClose
}) => {
  // Create a deep copy of settings to avoid direct modification
  const [localSettings, setLocalSettings] = useState<CalendarSettings>({...settings});
  const [newStatus, setNewStatus] = useState<string>('');
  const [newTag, setNewTag] = useState<string>('');
  const panelRef = useRef<HTMLDivElement>(null);
  const statusInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // Update local settings when props change
  useEffect(() => {
    setLocalSettings({...settings});
  }, [settings]);

  // Handle outside clicks
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Add with a delay to avoid immediate closing
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Update local settings and notify parent component
  const handleChange = (field: keyof CalendarSettings, value: any) => {
    const newSettings = { ...localSettings, [field]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  // Reset individual field to default value
  const resetField = (field: keyof CalendarSettings, defaultValue: any) => {
    handleChange(field, defaultValue);
  };

  // Status management functions
  const addStatus = () => {
    if (newStatus.trim()) {
      const currentStatuses = localSettings.includedStatuses || [];
      if (!currentStatuses.includes(newStatus.trim())) {
        const updatedStatuses = [...currentStatuses, newStatus.trim()];
        handleChange('includedStatuses', updatedStatuses);
      }
      setNewStatus('');
      // Focus back to input field
      statusInputRef.current?.focus();
    }
  };

  const removeStatus = (statusToRemove: string) => {
    const currentStatuses = localSettings.includedStatuses || [];
    const updatedStatuses = currentStatuses.filter(status => status !== statusToRemove);
    handleChange('includedStatuses', updatedStatuses);
  };

  // Add status on Enter key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addStatus();
    }
  };

  // Tag management functions
  const addTag = () => {
    if (newTag.trim()) {
      const currentTags = localSettings.includedTags || [];
      if (!currentTags.includes(newTag.trim())) {
        const updatedTags = [...currentTags, newTag.trim()];
        handleChange('includedTags', updatedTags);
      }
      setNewTag('');
      // Focus back to input field
      tagInputRef.current?.focus();
    }
  };

  const removeTag = (tagToRemove: string) => {
    const currentTags = localSettings.includedTags || [];
    const updatedTags = currentTags.filter(tag => tag !== tagToRemove);
    handleChange('includedTags', updatedTags);
  };

  // Add tag on Enter key press
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  // Function to get default name based on calendar ID
  const getDefaultName = () => {
    return `Calendar ${settings.id === 'default' ? 'Default' : ''}`;
  };

  return (
    <div className="calendar-settings-panel" ref={panelRef}>
      <div className="settings-header">
        <h4>Calendar Settings</h4>
        <button className="settings-close-button" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <form className="tasks-calendar-settings-form" onSubmit={(e) => e.preventDefault()}>
        {/* Basic Settings Section */}
        <div className="settings-section">
          <div className="setting-item">
            <label>Name:</label>
            <div className="setting-item-input">
              <input
                type="text"
                value={localSettings.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder={getDefaultName()}
              />
              <button
                type="button"
                className="setting-reset-button"
                onClick={() => resetField('name', getDefaultName())}
                aria-label="Reset name"
                title="Reset name"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          <div className="setting-item">
            <label>Date property:</label>
            <div className="setting-item-input">
              <input
                type="text"
                value={localSettings.dateProperty || ''}
                placeholder={DEFAULT_CALENDAR_SETTINGS.dateProperty}
                onChange={(e) => handleChange('dateProperty', e.target.value)}
              />
              <button
                type="button"
                className="setting-reset-button"
                onClick={() => resetField('dateProperty', DEFAULT_CALENDAR_SETTINGS.dateProperty)}
                aria-label="Reset to default date property"
                title="Reset to default"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          <div className="setting-item">
            <label>Start date property:</label>
            <div className="setting-item-input">
              <input
                type="text"
                value={localSettings.startDateProperty || ''}
                placeholder={DEFAULT_CALENDAR_SETTINGS.startDateProperty}
                onChange={(e) => handleChange('startDateProperty', e.target.value)}
              />
              <button
                type="button"
                className="setting-reset-button"
                onClick={() => resetField('startDateProperty', DEFAULT_CALENDAR_SETTINGS.startDateProperty)}
                aria-label="Reset to default start date property"
                title="Reset to default"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          <div className="setting-item">
            <label>Dataview query:</label>
            <div className="setting-item-input">
              <input
                type="text"
                value={localSettings.query || ''}
                placeholder={DEFAULT_CALENDAR_SETTINGS.query}
                onChange={(e) => handleChange('query', e.target.value)}
              />
              <button
                type="button"
                className="setting-reset-button"
                onClick={() => resetField('query', DEFAULT_CALENDAR_SETTINGS.query)}
                aria-label="Reset to default query"
                title="Reset to default"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <div className="setting-item-description">
              Examples: "" (all files), "work" (work folder), -"work" (folders excluding work), #tag (files with tag)
            </div>
          </div>
        </div>

        {/* Status Filter Section */}
        <div className="setting-item status-list-container">
          <label>Include task statuses:</label>
          <div className="setting-item-input">
            <div className="status-input-container">
              <input
                ref={statusInputRef}
                type="text"
                value={newStatus}
                placeholder="Add new status..."
                onChange={(e) => setNewStatus(e.target.value)}
                onKeyDown={handleKeyDown}
                className="status-input"
              />
              <button
                type="button"
                onClick={addStatus}
                className="status-add-button"
              >
                Add
              </button>
            </div>
            <button
              type="button"
              className="setting-reset-button"
              onClick={() => resetField('includedStatuses', [...DEFAULT_CALENDAR_SETTINGS.includedStatuses])}
              aria-label="Reset to default statuses"
              title="Reset to default"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="setting-item-description">
            Current statuses shown below. Add or remove as needed.
          </div>

          {/* Status list display */}
          <div className="status-chips-container">
            {(localSettings.includedStatuses || []).length > 0 ? (
              (localSettings.includedStatuses || []).map((status, index) => (
                <div key={index} className="status-chip">
                  <span className="status-text">{status}</span>
                  <button
                    type="button"
                    onClick={() => removeStatus(status)}
                    className="status-remove-button"
                    aria-label={`Remove ${status}`}
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-status-message">No statuses added. No status filtering will be applied.</div>
            )}
          </div>
        </div>

        {/* Tag Filter Section */}
        <div className="setting-item status-list-container">
          <label>Include tags:</label>
          <div className="setting-item-input">
            <div className="status-input-container">
              <input
                ref={tagInputRef}
                type="text"
                value={newTag}
                placeholder="Add new tag..."
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleTagKeyDown}
                className="status-input"
              />
              <button
                type="button"
                onClick={addTag}
                className="status-add-button"
              >
                Add
              </button>
            </div>
            <button
              type="button"
              className="setting-reset-button"
              onClick={() => resetField('includedTags', [...(DEFAULT_CALENDAR_SETTINGS.includedTags || [])])}
              aria-label="Reset to default tags"
              title="Reset to default"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="setting-item-description">
            Add tags to filter tasks by tag. Leave empty to include all tasks regardless of tags.
          </div>

          {/* Tags list display */}
          <div className="status-chips-container">
            {(localSettings.includedTags || []).length > 0 ? (
              (localSettings.includedTags || []).map((tag, index) => (
                <div key={index} className="status-chip">
                  <span className="status-text">{tag}</span>
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="status-remove-button"
                    aria-label={`Remove ${tag}`}
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-status-message">No tags added. No tag filtering will be applied.</div>
            )}
          </div>
        </div>

        {/* Delete Calendar Button (only for non-default calendars) */}
        {settings.id !== 'default' && onDeleteCalendar && (
          <div className="setting-item">
            <button
              type="button"
              className="calendar-delete-button"
              onClick={(e) => {
                e.preventDefault();
                if (confirm(`Are you sure you want to delete '${settings.name}'?`)) {
                  onDeleteCalendar();
                }
              }}
            >
              Delete Calendar
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
