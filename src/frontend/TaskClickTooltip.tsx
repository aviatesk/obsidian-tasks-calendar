import React, { useEffect, useRef, useState } from 'react';
import { FileText, Pencil, X, Calendar, Tag, Info, Check, XCircle, Edit, Plus, Trash2, AlertCircle } from 'lucide-react';
import { DateTimePickerModal } from './DateTimePickerModal';
import { StatusPickerDropdown } from './StatusPickerDropdown';
import { formatStatus, getStatusIcon } from '../backend/status';
import { Platform } from 'obsidian';
import { DEFAULT_CALENDAR_SETTINGS } from 'src/TasksCalendarSettings';

interface TaskClickTooltipProps {
  taskText: string;
  cleanText?: string;
  filePath: string;
  position: { top: number; left: number };
  onClose: () => void;
  onOpenFile: () => void;
  startDate?: string;
  endDate?: string;
  tags?: string[];
  status?: string;
  line?: number;
  isAllDay?: boolean;
  // Add handlers for updates
  onUpdateDates?: (startDate: Date | null, endDate: Date | null, isAllDay: boolean, wasMultiDay: boolean) => void;
  onUpdateStatus?: (newStatus: string) => void;
  onUpdateText?: (newText: string, originalText: string, taskText: string) => Promise<boolean>;
  // Add hover link handler
  onHoverLink?: (event: React.MouseEvent, filePath: string, line?: number) => void;
  // Delete task callback
  onDeleteTask?: (filePath: string, line?: number) => Promise<boolean>;
  // New props for task creation mode
  isCreateMode?: boolean;
  selectedDate?: Date;
  onCreateTask?: (text: string, startDate: Date | null, endDate: Date | null, isAllDay: boolean, status: string, targetPath: string) => Promise<boolean>;
  availableDestinations?: string[]; // Added prop for available destinations
}

export const TaskClickTooltip: React.FC<TaskClickTooltipProps> = ({
  taskText,
  cleanText,
  filePath,
  position,
  onClose,
  onOpenFile,
  startDate: initialStartDate,
  endDate: initialEndDate,
  tags,
  status = ' ',
  line,
  isAllDay: initialIsAllDay = false,
  onUpdateDates,
  onUpdateStatus,
  onUpdateText,
  onHoverLink,
  onDeleteTask,
  // New props with defaults
  isCreateMode = false,
  selectedDate,
  onCreateTask,
  availableDestinations = DEFAULT_CALENDAR_SETTINGS.newTaskFilePaths,
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const fileName = filePath.split('/').pop() || filePath;
  const isMobile = Platform.isMobile;

  // State for dynamic updates of dates
  const [startDate, setStartDate] = useState<string | undefined>(
    isCreateMode && selectedDate
      ? selectedDate.toISOString()
      : initialStartDate
  );
  const [endDate, setEndDate] = useState<string | undefined>(initialEndDate);
  const [isAllDay, setIsAllDay] = useState<boolean>(!!initialIsAllDay);

  // Text editing state
  const [isEditing, setIsEditing] = useState<boolean>(isCreateMode);
  const [editedText, setEditedText] = useState<string>(isCreateMode ? "" : cleanText || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Date picker state - simplified to a single date picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [datePickerPosition, setDatePickerPosition] = useState({ top: 0, left: 0 });
  const [statusPickerPosition, setStatusPickerPosition] = useState({ top: 0, left: 0 });

  // Add state for managing status in create mode
  const [currentStatus, setCurrentStatus] = useState<string>(status);

  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  // Add state for destination selection
  const [selectedDestination, setSelectedDestination] = useState<string>(filePath || availableDestinations[0]);

  // Auto-focus and resize the textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  // Handle clicks outside the tooltip
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        // Don't close if editing to prevent accidental data loss
        if (!isEditing) {
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, isEditing]);

  // Helper to handle hover link functionality
  const handleHover = (event: React.MouseEvent) => {
    if (onHoverLink && filePath) {
      onHoverLink(event, filePath, line);
    }
  };

  // Text edit handlers
  const handleEditStart = () => {
    setEditedText(cleanText || '');
    setIsEditing(true);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedText(e.target.value);
  };

  // Handle tab key to move focus to buttons
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault(); // Prevent default tab behavior

      // If shift is held, focus the cancel button, otherwise focus the save button
      if (e.shiftKey) {
        cancelButtonRef.current?.focus();
      } else {
        saveButtonRef.current?.focus();
      }
    }
  };

  const handleTextSave = async () => {
    if (isCreateMode && onCreateTask) {
      // Handle task creation
      setIsSaving(true);

      const startDateObj = startDate ? new Date(startDate) : null;
      const endDateObj = endDate ? new Date(endDate) : null;

      const success = await onCreateTask(
        editedText,
        startDateObj,
        endDateObj,
        isAllDay,
        currentStatus,
        selectedDestination // Pass the selected destination
      );

      setIsSaving(false);

      if (success) {
        onClose();
      }
    } else if (onUpdateText && cleanText !== editedText) {
      // Handle task update (existing code)
      setIsSaving(true);
      const success = await onUpdateText(editedText, cleanText || '', taskText);
      setIsSaving(false);

      if (success) {
        setIsEditing(false);
      }
    } else {
      // No change or no update handler
      setIsEditing(false);
    }
  };

  const handleTextCancel = () => {
    if (isCreateMode) {
      onClose();
    } else {
      setEditedText(cleanText || '');
      setIsEditing(false);
    }
  };

  // Helper to adjust end date for all-day events (convert exclusive end to inclusive end for display)
  const adjustEndDateForDisplay = (dateStr: string, isAllDayFormat: boolean): string => {
    if (!dateStr || !isAllDayFormat) return dateStr;
    // For all-day events, we need to subtract a day from the end date for display
    // This converts the exclusive end date (stored value) to inclusive end date (display value)
    const date = new Date(dateStr);
    date.setDate(date.getDate() - 1);
    return date.toISOString();
  };

  // Helper to format date strings
  const formatDateString = (dateStr: string, isAllDayFormat = false) => {
    try {
      const date = new Date(dateStr);

      if (isAllDayFormat) {
        return date.toLocaleDateString(undefined, {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      }

      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  };

  // Date click handler - simplified for unified date picker
  const handleDateClick = (e: React.MouseEvent) => {
    if (!onUpdateDates && !isCreateMode) return;

    if (isMobile) {
      // For mobile, we don't need specific positioning as it will be centered
      setDatePickerPosition({ top: 0, left: 0 });
    } else {
      // Get clicked element position for the date picker
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      // Simple positioning - will be refined by calculateOptimalPosition in DateTimePickerModal
      const top = rect.bottom + 5;
      const left = rect.left;
      setDatePickerPosition({ top, left });
    }

    setShowDatePicker(true);

    e.preventDefault();
    e.stopPropagation();
  };

  // Status click handler
  const handleStatusClick = (e: React.MouseEvent) => {
    if (!onUpdateStatus && !isCreateMode) return;

    if (isMobile) {
      // For mobile, we don't need specific positioning as it will be centered
      setStatusPickerPosition({ top: 0, left: 0 });
    } else {
      // Get clicked element position for the status picker
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      // Simple positioning - will be refined by calculateOptimalPosition in StatusPickerDropdown
      const top = rect.bottom + 5;
      const left = rect.left;
      setStatusPickerPosition({ top, left });
    }

    setShowStatusPicker(true);

    e.preventDefault();
    e.stopPropagation();
  };

  // Status save handler
  const handleStatusSave = (newStatus: string) => {
    if (onUpdateStatus && !isCreateMode) {
      onUpdateStatus(newStatus);
    } else if (isCreateMode) {
      // In create mode, update the state variable rather than trying to modify the prop
      setCurrentStatus(newStatus);
    }
    setShowStatusPicker(false);
  };

  // Updated date save handler - stores changes locally without updating parent
  const handleDateDone = (newStartDate: Date, newEndDate: Date | null, newAllDay: boolean, wasMultiDay: boolean) => {
    const startDate = newStartDate.toISOString();
    const endDate = newEndDate ? newEndDate.toISOString() : undefined;

    // Update local display state
    setStartDate(startDate);
    setEndDate(endDate);
    setIsAllDay(newAllDay);

    // Only update if we're not in create mode - always update with current date values
    if (onUpdateDates && !isCreateMode) {
      // Use the current date values - whether they were explicitly changed or not
      const startDateObj = startDate ? new Date(startDate) : null;
      const endDateObj = endDate ? new Date(endDate) : null;
      onUpdateDates(startDateObj, endDateObj, newAllDay, wasMultiDay);
    }

    handleDatePickerClose();
  };

  // Date picker close handler - just close it
  const handleDatePickerClose = () => {
    setShowDatePicker(false);
  };

  // Format date display - updated to handle both single dates and ranges in one section
  const formatDateDisplay = () => {
    if (!startDate) return null;

    // Adjust end date for all-day events before formatting
    const displayEndDate = endDate ? adjustEndDateForDisplay(endDate, isAllDay) : undefined;

    return (
      <div className="task-click-tooltip-info-item">
        <Calendar size={isMobile ? 18 : 16} className="task-click-tooltip-icon-small" />
        <div
          className="task-click-tooltip-date-container"
          onClick={handleDateClick}
          title="Click to edit date"
        >
          <span className="task-click-tooltip-info-text task-click-tooltip-date-text">
            {formatDateString(startDate, isAllDay)}
            {displayEndDate && (
              <>
                <span className="task-click-tooltip-info-text">{isAllDay ? ' to ' : ' → '}</span>
                {formatDateString(displayEndDate, isAllDay)}
              </>
            )}
          </span>
        </div>
      </div>
    );
  };

  // Format tags with code-like styling
  const formatTagsDisplay = () => {
    if (!tags || tags.length === 0) return null;

    return (
      <div className="task-click-tooltip-info-item">
        <Tag size={isMobile ? 18 : 16} className="task-click-tooltip-icon-small" />
        <div className="task-click-tooltip-tags-container">
          {tags.map((tag, index) => (
            <span key={index} className="task-click-tooltip-tag-code">
              {tag}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // Delete task handlers
  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  const handleDeleteConfirm = async () => {
    if (!onDeleteTask || !filePath) return;

    setIsDeleting(true);
    try {
      const success = await onDeleteTask(filePath, line);
      if (success) {
        onClose();
      } else {
        setShowDeleteConfirm(false);
        setIsDeleting(false);
      }
    } catch (error) {
      console.error("Failed to delete task:", error);
      setShowDeleteConfirm(false);
      setIsDeleting(false);
    }
  };

  // Render delete confirmation UI
  const renderDeleteConfirmation = () => {
    if (!showDeleteConfirm) return null;

    return (
      <div className="task-click-tooltip-delete-confirm">
        <div className="task-click-tooltip-delete-message">
          <AlertCircle size={isMobile ? 20 : 18} className="task-click-tooltip-delete-icon" />
          <span>Are you sure you want to delete this task?</span>
        </div>
        <div className="task-click-tooltip-delete-actions">
          <button
            className="task-click-tooltip-cancel-button"
            onClick={handleDeleteCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            className="task-click-tooltip-delete-confirm-button"
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    );
  };

  // Render task text display or edit form or delete confirmation
  const renderTaskContent = () => {
    if (showDeleteConfirm) {
      return renderDeleteConfirmation();
    }

    if (isEditing) {
      return (
        <div className="task-click-tooltip-edit-container">
          <textarea
            ref={textareaRef}
            className="task-click-tooltip-edit-textarea"
            value={editedText}
            onChange={handleTextChange}
            onKeyDown={handleTextareaKeyDown}
            disabled={isSaving}
            placeholder={isCreateMode ? "Type your new task here..." : "Task text..."}
            spellCheck={false}
            autoFocus
          />
          <div className="task-click-tooltip-edit-actions">
            <button
              ref={cancelButtonRef}
              className="task-click-tooltip-cancel-button"
              onClick={handleTextCancel}
              disabled={isSaving}
              title={isCreateMode ? "Cancel task creation" : "Cancel editing"}
            >
              Cancel
              <XCircle size={isMobile ? 18 : 16} />
            </button>
            <button
              ref={saveButtonRef}
              className="task-click-tooltip-save-button"
              onClick={handleTextSave}
              disabled={isSaving || (isCreateMode && !editedText.trim())}
              title={isCreateMode ? "Create task" : "Save changes"}
            >
              {isSaving ? 'Saving...' : isCreateMode ? 'Create' : 'Save'}
              {!isSaving && (isCreateMode ? <Plus size={isMobile ? 18 : 16} /> : <Check size={isMobile ? 18 : 16} />)}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="task-click-tooltip-main-text-container">
        <div
          className="task-click-tooltip-main-text"
          onClick={onUpdateText ? handleEditStart : undefined}
          style={onUpdateText ? { cursor: 'pointer' } : undefined}
          title={onUpdateText ? "Click to edit task text" : undefined}
        >
          {cleanText || taskText}
        </div>
        {onUpdateText && (
          <button
            className="task-click-tooltip-edit-button"
            onClick={handleEditStart}
            title="Edit task text"
          >
            <Edit size={isMobile ? 18 : 16} />
          </button>
        )}
      </div>
    );
  };

  const renderStatusIcon = () => {
    const statusToUse = isCreateMode ? currentStatus : status;
    return React.createElement(
      getStatusIcon(statusToUse),
      {
        size: isMobile ? 18 : 16,
        className: "task-click-tooltip-icon-small"
      }
    );
  };

  // Render different container based on mobile or desktop
  return isMobile ? (
    <div className="mobile-modal-overlay">
      <div className="task-click-tooltip" ref={tooltipRef}>
        <div className="task-click-tooltip-header">
          <div className="task-click-tooltip-file-container">
            {isCreateMode ? (
              <>
                <Plus size={18} className="task-click-tooltip-icon" />
                <span className="task-click-tooltip-file">New Task in {fileName}</span>
              </>
            ) : (
              <>
                <FileText size={18} className="task-click-tooltip-icon" />
                <span className="task-click-tooltip-file">{fileName}</span>
              </>
            )}
          </div>
          <div className="task-click-tooltip-actions">
            {!isCreateMode && !showDeleteConfirm && (
              <>
                <button
                  className="task-click-tooltip-open-button"
                  onClick={onOpenFile}
                  onMouseEnter={handleHover}
                  title="Open file"
                  disabled={isEditing}
                >
                  <Pencil size={18} />
                </button>
                {onDeleteTask && (
                  <button
                    className="task-click-tooltip-delete-button"
                    onClick={handleDeleteClick}
                    title="Delete task"
                    disabled={isEditing}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </>
            )}
            <button
              className="task-click-tooltip-close-button"
              onClick={isEditing ? handleTextCancel : onClose}
              title={isEditing ? "Cancel editing" : "Close"}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="task-click-tooltip-content">
          {renderTaskContent()}

          <div className="task-click-tooltip-info">
            {(status || isCreateMode) && (
              <div className="task-click-tooltip-info-item">
                {renderStatusIcon()}
                <span
                  className="task-click-tooltip-info-text task-click-tooltip-status-text"
                  onClick={handleStatusClick}
                  title={isEditing ? "Finish editing task first" : "Click to change status"}
                >
                  <span className="task-click-tooltip-status-value">
                    {formatStatus(isCreateMode ? currentStatus : status)}
                  </span>
                </span>
              </div>
            )}

            {formatDateDisplay()}

            {formatTagsDisplay()}

            {!isCreateMode && (
              <div
                className="task-click-tooltip-info-item task-click-tooltip-file-link"
                onClick={onOpenFile}
                onMouseEnter={handleHover}
                title="Click to open task"
              >
                <Info size={18} className="task-click-tooltip-icon-small" />
                <span className="task-click-tooltip-info-text">{filePath}{line ? ` (line ${line})` : ''}</span>
              </div>
            )}

            {isCreateMode && (
              <div className="task-click-tooltip-info-item">
                <Info size={18} className="task-click-tooltip-icon-small task-click-tooltip-icon-info" />
                {availableDestinations.length <= 1 ? (
                  <span className="task-click-tooltip-info-text">
                    Will be created in {selectedDestination} {selectedDestination.endsWith('/') ? '(new task note)' : '(new task list)'}
                  </span>
                ) : (
                  <div className="task-click-tooltip-destination-select">
                    <div className="task-click-tooltip-destination-label">Will be created in</div>
                    <select
                      value={selectedDestination}
                      onChange={(e) => setSelectedDestination(e.target.value)}
                      className="task-click-tooltip-inline-dropdown"
                      disabled={isSaving}
                    >
                      {availableDestinations.map((destination, index) => (
                        <option key={index} value={destination}>
                          {destination} {destination.endsWith('/') ? '(new task note)' : '(new task list)'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Unified DatePicker modal */}
        {showDatePicker && (
          <DateTimePickerModal
            initialStartDate={startDate ? new Date(startDate) : new Date()}
            initialEndDate={endDate ? new Date(endDate) : null}
            isAllDay={isAllDay}
            onClose={handleDatePickerClose}
            onDone={handleDateDone}
            position={datePickerPosition}
          />
        )}

        {/* StatusPicker modal */}
        {showStatusPicker && (
          <StatusPickerDropdown
            currentStatus={isCreateMode ? currentStatus : status}
            onClose={() => setShowStatusPicker(false)}
            onSave={handleStatusSave}
            position={statusPickerPosition}
          />
        )}
      </div>
    </div>
  ) : (
    <div
      className="task-click-tooltip"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      ref={tooltipRef}
    >
      <div className="task-click-tooltip-header">
        <div className="task-click-tooltip-file-container">
          {isCreateMode ? (
            <>
              <Plus size={16} className="task-click-tooltip-icon" />
              <span className="task-click-tooltip-file">New Task in {fileName}</span>
            </>
          ) : (
            <>
              <FileText size={16} className="task-click-tooltip-icon" />
              <span className="task-click-tooltip-file">{fileName}</span>
            </>
          )}
        </div>
        <div className="task-click-tooltip-actions">
          {!isCreateMode && !showDeleteConfirm && (
            <>
              <button
                className="task-click-tooltip-open-button"
                onClick={onOpenFile}
                onMouseEnter={handleHover}
                title="Open file"
                disabled={isEditing}
              >
                <Pencil size={16} />
              </button>
              {onDeleteTask && (
                <button
                  className="task-click-tooltip-delete-button"
                  onClick={handleDeleteClick}
                  title="Delete task"
                  disabled={isEditing}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </>
          )}
          <button
            className="task-click-tooltip-close-button"
            onClick={isEditing ? handleTextCancel : onClose}
            title={isEditing ? "Cancel editing" : "Close"}
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="task-click-tooltip-content">
        {renderTaskContent()}

        <div className="task-click-tooltip-info">
          {(status || isCreateMode) && (
            <div className="task-click-tooltip-info-item">
              {renderStatusIcon()}
              <span
                className="task-click-tooltip-info-text task-click-tooltip-status-text"
                onClick={handleStatusClick}
                title={isEditing ? "Finish editing task first" : "Click to change status"}
              >
                <span className="task-click-tooltip-status-value">
                  {formatStatus(isCreateMode ? currentStatus : status)}
                </span>
              </span>
            </div>
          )}

          {formatDateDisplay()}

          {formatTagsDisplay()}

          {!isCreateMode && (
            <div
              className="task-click-tooltip-info-item task-click-tooltip-file-link"
              onClick={onOpenFile}
              onMouseEnter={handleHover}
              title="Click to open task"
            >
              <Info size={16} className="task-click-tooltip-icon-small" />
              <span className="task-click-tooltip-info-text">{filePath}{line ? ` (line ${line})` : ''}</span>
            </div>
          )}

          {isCreateMode && (
            <div className="task-click-tooltip-info-item">
              <Info size={16} className="task-click-tooltip-icon-small task-click-tooltip-icon-info" />
              {availableDestinations.length <= 1 ? (
                <span className="task-click-tooltip-info-text">
                  Will be created in {selectedDestination} {selectedDestination.endsWith('/') ? '(new task note)' : '(new task list)'}
                </span>
              ) : (
                <div className="task-click-tooltip-destination-select">
                  <div className="task-click-tooltip-destination-label">Will be created in</div>
                  <select
                    value={selectedDestination}
                    onChange={(e) => setSelectedDestination(e.target.value)}
                    className="task-click-tooltip-inline-dropdown"
                    disabled={isSaving}
                  >
                    {availableDestinations.map((destination, index) => (
                      <option key={index} value={destination}>
                        {destination} {destination.endsWith('/') ? '(new task note)' : '(new task list)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Unified DatePicker modal */}
      {showDatePicker && (
        <DateTimePickerModal
          initialStartDate={startDate ? new Date(startDate) : new Date()}
          initialEndDate={endDate ? new Date(endDate) : null}
          isAllDay={isAllDay}
          onClose={handleDatePickerClose}
          onDone={handleDateDone}
          position={datePickerPosition}
        />
      )}

      {/* StatusPicker modal */}
      {showStatusPicker && (
        <StatusPickerDropdown
          currentStatus={isCreateMode ? currentStatus : status}
          onClose={() => setShowStatusPicker(false)}
          onSave={handleStatusSave}
          position={statusPickerPosition}
        />
      )}
    </div>
  );
};
