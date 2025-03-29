import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarSettings, DEFAULT_CALENDAR_SETTINGS } from '../TasksCalendarSettings';
import { RefreshCw, X } from 'lucide-react';
import { normalizeTag } from 'src/backend/tag';

interface SettingsPanelProps {
  settings: CalendarSettings;
  onSettingsChange: (settings: CalendarSettings) => void;
  onDeleteCalendar?: () => void;
  onClose: () => void;
}

// Modal container component using createPortal
const SettingsModal: React.FC<React.PropsWithChildren<object>> = ({ children }) => {
  const modalRoot = document.body;
  const el = useRef<HTMLDivElement | null>(null);

  // Create element only once to prevent flickering
  if (!el.current) {
    el.current = document.createElement('div');
    el.current.className = 'tasks-calendar-settings-modal-portal';
  }

  useEffect(() => {
    const element = el.current!;
    modalRoot.appendChild(element);

    // Prevent background scrolling when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      modalRoot.removeChild(element);
      document.body.style.overflow = '';
    };
  }, [modalRoot]);

  return createPortal(children, el.current);
};

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
  const [newPath, setNewPath] = useState<string>(''); // Add state for new path input
  const modalRef = useRef<HTMLDivElement>(null);
  const statusInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const excludedStatusInputRef = useRef<HTMLInputElement>(null);
  const excludedTagInputRef = useRef<HTMLInputElement>(null);

  // Update local settings when props change
  useEffect(() => {
    setLocalSettings({...settings});
  }, [settings]);

  // Handle outside clicks to close modal
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Handle escape key press to close modal
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
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
      // Normalize tags by ensuring they have a '#' prefix
      const processedValue = field.includes('Tags') ? normalizeTag(value) : value.trim();

      const currentItems = localSettings[field] || [];
      if (!currentItems.includes(processedValue)) {
        const updatedItems = [...currentItems, processedValue];
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
    return settings.id.toUpperCase();
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
    <div className="field-container">
      <label className="label">{label}</label>
      <div className="description">
        {description}
        {field.includes('Tags') && (
          <span> Tags should start with <code>#</code> (will be added automatically if omitted).</span>
        )}
      </div>
      <div className="input-wrapper">
        <div className="input-container">
          <input
            ref={inputRef}
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => handleItemKeyDown(e, value, field, setValue, inputRef)}
          />
          <button
            type="button"
            onClick={() => addItem(value, field, setValue, inputRef)}
            className="add-button"
          >
            Add
          </button>
        </div>
        <button
          type="button"
          className="reset-button"
          onClick={() => resetField(field, [...(DEFAULT_CALENDAR_SETTINGS[field] || [])])}
          aria-label={`Reset ${field}`}
          title="Reset to default"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="chips-container">
        {(localSettings[field] || []).length > 0 ? (
          (localSettings[field] || []).map((item: string, index: number) => (
            <div key={index} className="chip">
              <span className="text">{item}</span>
              <button
                type="button"
                onClick={() => removeItem(item, field)}
                className="remove-button"
                aria-label={`Remove ${item}`}
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <div className="empty-message">{emptyMessage}</div>
        )}
      </div>
    </div>
  );

  return (
    <SettingsModal>
      <div className="tasks-calendar-settings-modal">
        <div className="backdrop" onClick={onClose}></div>
        <div className="content" ref={modalRef}>
          <div className="header">
            <h2>Calendar Settings</h2>
            <button className="close-button" onClick={onClose} aria-label="Close modal">
              <X size={20} />
            </button>
          </div>

          <div className="body">
            <form className="form" onSubmit={(e) => e.preventDefault()}>
              <div className="section">
                <div className="section-title">Basic Configuration</div>

                <div className="field-container">
                  <label className="label">Calendar Name</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      value={localSettings.name || ''}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder={getDefaultName()}
                    />
                    <button
                      type="button"
                      className="reset-button"
                      onClick={() => resetField('name', getDefaultName())}
                      aria-label="Reset name"
                      title="Reset to default"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>

                {/* Task Creation Destinations - Multiple File Paths */}
                <div className="field-container">
                  <label className="label">Task Creation Destinations</label>
                  <div className="description">
                    Destinations where new tasks will be created when clicking on dates.
                    When a file path (ending with <code>.md</code>) is specified, Markdown list format tasks will be appended to that file.
                    When a folder (ending with <code>/</code>) is specified, new notes with task properties will be created with task text as the name.
                  </div>

                  {/* List of current paths */}
                  <div className="chips-container">
                    {(localSettings.newTaskFilePaths || []).length > 0 ? (
                      (localSettings.newTaskFilePaths || []).map((path: string, index: number) => (
                        <div key={index} className="chip">
                          <span className="text">{path}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const updatedPaths = [...(localSettings.newTaskFilePaths || [])];
                              updatedPaths.splice(index, 1);
                              handleChange('newTaskFilePaths', updatedPaths);
                            }}
                            className="remove-button"
                            aria-label={`Remove ${path}`}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="empty-message">No destinations added. Default "Tasks.md" will be used.</div>
                    )}
                  </div>

                  {/* Add new path input */}
                  <div className="input-wrapper">
                    <div className="input-container">
                      <input
                        type="text"
                        placeholder="Add new destination path..."
                        value={newPath}
                        onChange={(e) => setNewPath(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newPath.trim()) {
                            const updatedPaths = [...(localSettings.newTaskFilePaths || []), newPath.trim()];
                            handleChange('newTaskFilePaths', updatedPaths);
                            setNewPath('');
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newPath.trim()) {
                            const updatedPaths = [...(localSettings.newTaskFilePaths || []), newPath.trim()];
                            handleChange('newTaskFilePaths', updatedPaths);
                            setNewPath('');
                          }
                        }}
                        className="add-button"
                      >
                        Add
                      </button>
                    </div>
                    <button
                      type="button"
                      className="reset-button"
                      onClick={() => resetField('newTaskFilePaths', [...DEFAULT_CALENDAR_SETTINGS.newTaskFilePaths])}
                      aria-label="Reset task file paths"
                      title="Reset to default"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>

                <div className="field-container">
                  <label className="label">Due Date Property</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      value={localSettings.dateProperty || ''}
                      placeholder={DEFAULT_CALENDAR_SETTINGS.dateProperty}
                      onChange={(e) => handleChange('dateProperty', e.target.value)}
                    />
                    <button
                      type="button"
                      className="reset-button"
                      onClick={() => resetField('dateProperty', DEFAULT_CALENDAR_SETTINGS.dateProperty)}
                      aria-label="Reset to default date property"
                      title="Reset to default"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>

                <div className="field-container">
                  <label className="label">Start Date Property</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      value={localSettings.startDateProperty || ''}
                      placeholder={DEFAULT_CALENDAR_SETTINGS.startDateProperty}
                      onChange={(e) => handleChange('startDateProperty', e.target.value)}
                    />
                    <button
                      type="button"
                      className="reset-button"
                      onClick={() => resetField('startDateProperty', DEFAULT_CALENDAR_SETTINGS.startDateProperty)}
                      aria-label="Reset to default start date property"
                      title="Reset to default"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>

                <div className="field-container">
                  <label className="label">Dataview Query</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      value={localSettings.query || ''}
                      placeholder={DEFAULT_CALENDAR_SETTINGS.query}
                      onChange={(e) => handleChange('query', e.target.value)}
                    />
                    <button
                      type="button"
                      className="reset-button"
                      onClick={() => resetField('query', DEFAULT_CALENDAR_SETTINGS.query)}
                      aria-label="Reset to default query"
                      title="Reset to default"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                  <div className="description">
                    Examples: "" (all files), "work" (work folder), -"work" (folders excluding work), #tag (files with tag)
                  </div>
                </div>
              </div>

              <div className="section">
                <div className="section-title">Task Filtering</div>

                {renderItemList(
                  "Excluded Task Statuses",
                  "excludedStatuses",
                  newExcludedStatus,
                  setNewExcludedStatus,
                  excludedStatusInputRef,
                  "Add status to exclude...",
                  "Tasks with these statuses will be excluded from the calendar, regardless of inclusion settings.",
                  "No statuses added. No status exclusion filtering will be applied."
                )}

                {renderItemList(
                  "Included Task Statuses",
                  "includedStatuses",
                  newStatus,
                  setNewStatus,
                  statusInputRef,
                  "Add status to include...",
                  "Add statuses to filter tasks. Leave empty to include all tasks regardless of status (except excluded ones).",
                  "No statuses added. No status inclusion filtering will be applied."
                )}

                {renderItemList(
                  "Excluded Tags",
                  "excludedTags",
                  newExcludedTag,
                  setNewExcludedTag,
                  excludedTagInputRef,
                  "Add tag to exclude...",
                  "Tasks with these tags will be excluded from the calendar, regardless of inclusion settings.",
                  "No tags added. No tag exclusion filtering will be applied."
                )}

                {renderItemList(
                  "Included Tags",
                  "includedTags",
                  newTag,
                  setNewTag,
                  tagInputRef,
                  "Add tag to include...",
                  "Add tags to filter tasks. Leave empty to include all tasks regardless of tags (except excluded ones).",
                  "No tags added. No tag inclusion filtering will be applied."
                )}
              </div>

              {settings.id !== 'default' && onDeleteCalendar && (
                <div className="delete-container">
                  <button
                    type="button"
                    className="delete-button"
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

              {/* Done button for easy closing */}
              <div className="done-button-container">
                <button
                  type="button"
                  className="done-button"
                  onClick={(e) => {
                    e.preventDefault();
                    onClose();
                  }}
                >
                  Done
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </SettingsModal>
  );
};
