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
  const [newExcludedStatus, setNewExcludedStatus] = useState<string>('');
  const [newExcludedTag, setNewExcludedTag] = useState<string>('');
  const panelRef = useRef<HTMLDivElement>(null);
  const statusInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const excludedStatusInputRef = useRef<HTMLInputElement>(null);
  const excludedTagInputRef = useRef<HTMLInputElement>(null);

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

  // Generic item management functions for both statuses and tags
  type ItemField = 'includedStatuses' | 'includedTags' | 'excludedStatuses' | 'excludedTags';

  const addItem = (
    value: string,
    field: ItemField,
    setValue: React.Dispatch<React.SetStateAction<string>>,
    inputRef: React.RefObject<HTMLInputElement>
  ) => {
    if (value.trim()) {
      const currentItems = localSettings[field] || [];
      if (!currentItems.includes(value.trim())) {
        const updatedItems = [...currentItems, value.trim()];
        handleChange(field, updatedItems);
      }
      setValue('');
      inputRef.current?.focus();
    }
  };

  const removeItem = (itemToRemove: string, field: ItemField) => {
    const currentItems = localSettings[field] || [];
    const updatedItems = currentItems.filter(item => item !== itemToRemove);
    handleChange(field, updatedItems);
  };

  const handleItemKeyDown = (
    e: React.KeyboardEvent,
    value: string,
    field: ItemField,
    setValue: React.Dispatch<React.SetStateAction<string>>,
    inputRef: React.RefObject<HTMLInputElement>
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addItem(value, field, setValue, inputRef);
    }
  };

  // Function to get default name based on calendar ID
  const getDefaultName = () => {
    return `Calendar ${settings.id === 'default' ? 'Default' : ''}`;
  };

  // Helper to render item list (statuses or tags)
  const renderItemList = (
    label: string,
    field: ItemField,
    value: string,
    setValue: React.Dispatch<React.SetStateAction<string>>,
    inputRef: React.RefObject<HTMLInputElement>,
    placeholder: string,
    description: string,
    emptyMessage: string
  ) => (
    <div className="setting-item status-list-container">
      <label>{label}</label>
      <div className="setting-item-input">
        <div className="status-input-container">
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => handleItemKeyDown(e, value, field, setValue, inputRef)}
            className="status-input"
          />
          <button
            type="button"
            onClick={() => addItem(value, field, setValue, inputRef)}
            className="status-add-button"
          >
            Add
          </button>
        </div>
        <button
          type="button"
          className="setting-reset-button"
          onClick={() => resetField(field, [...(DEFAULT_CALENDAR_SETTINGS[field] || [])])}
          aria-label={`Reset ${field}`}
          title="Reset to default"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="setting-item-description">
        {description}
      </div>

      <div className="status-chips-container">
        {(localSettings[field] || []).length > 0 ? (
          (localSettings[field] || []).map((item: string, index: number) => (
            <div key={index} className="status-chip">
              <span className="status-text">{item}</span>
              <button
                type="button"
                onClick={() => removeItem(item, field)}
                className="status-remove-button"
                aria-label={`Remove ${item}`}
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <div className="empty-status-message">{emptyMessage}</div>
        )}
      </div>
    </div>
  );

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

        {/* Exclusion/Inclusion Sections using the reusable render function */}
        {renderItemList(
          "Exclude task statuses:",
          "excludedStatuses",
          newExcludedStatus,
          setNewExcludedStatus,
          excludedStatusInputRef,
          "Add status to exclude...",
          "Tasks with these statuses will be excluded from the calendar, regardless of inclusion settings.",
          "No statuses excluded."
        )}

        {renderItemList(
          "Include task statuses:",
          "includedStatuses",
          newStatus,
          setNewStatus,
          statusInputRef,
          "Add new status...",
          "Add tags to filter tasks by status. Leave empty to include all tasks regardless of statuses (except the excluded statuses).." +
          "Note that if specified this filtering will exclude tasks with statuses not included here.",
          "No statuses added. No status inclusion filtering will be applied."
        )}

        {renderItemList(
          "Exclude tags:",
          "excludedTags",
          newExcludedTag,
          setNewExcludedTag,
          excludedTagInputRef,
          "Add tag to exclude...",
          "Tasks with these tags will be excluded from the calendar, regardless of inclusion settings.",
          "No tags excluded."
        )}

        {renderItemList(
          "Include tags:",
          "includedTags",
          newTag,
          setNewTag,
          tagInputRef,
          "Add new tag...",
          "Add tags to filter tasks by tag. Leave empty to include all tasks regardless of tags (except the excluded tags)." +
          "Note that if specified this filtering will exclude tasks with tags not included here.",
          "No tags added. No tag inclusion filtering will be applied."
        )}


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
