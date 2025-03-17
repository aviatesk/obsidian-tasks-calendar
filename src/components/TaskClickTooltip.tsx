import React, { useEffect, useRef, useState } from 'react';
import { FileText, Pencil, X, Calendar, Tag, Info, Check, XCircle, Edit, Plus } from 'lucide-react';
import { DateTimePickerModal } from './DateTimePickerModal';
import { StatusPickerDropdown } from './StatusPickerDropdown';
import { formatStatus, getStatusIcon } from '../utils/status';
import { Platform } from 'obsidian';

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
  onUpdateDates?: (startDate: Date | null, endDate: Date | null, isAllDay: boolean) => void;
  onUpdateStatus?: (newStatus: string) => void;
  onUpdateText?: (newText: string, originalText: string, taskText: string) => Promise<boolean>;
  // Add hover link handler
  onHoverLink?: (event: React.MouseEvent, filePath: string, line?: number) => void;
  // New props for task creation mode
  isCreateMode?: boolean;
  selectedDate?: Date;
  onCreateTask?: (text: string, startDate: Date | null, endDate: Date | null, isAllDay: boolean, status: string) => Promise<boolean>;
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
  // New props with defaults
  isCreateMode = false,
  selectedDate,
  onCreateTask
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

  // Date picker state
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [datePickerPosition, setDatePickerPosition] = useState({ top: 0, left: 0 });
  const [statusPickerPosition, setStatusPickerPosition] = useState({ top: 0, left: 0 });

  // Add state for managing status in create mode
  const [currentStatus, setCurrentStatus] = useState<string>(status);

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
        currentStatus // Use the state variable instead of the prop
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

  // Date click handler
  const handleDateClick = (e: React.MouseEvent, isStart: boolean) => {
    if (!onUpdateDates) return;

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

    if (isStart) {
      setShowStartDatePicker(true);
      setShowEndDatePicker(false);
    } else {
      setShowStartDatePicker(false);
      setShowEndDatePicker(true);
    }

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

  // Date save handler - now automatically updates UI
  const handleDateSave = (date: Date, allDay: boolean, isStart: boolean) => {
    if (!onUpdateDates && !isCreateMode) return;

    // Update local state to reflect changes immediately
    const isoDate = date.toISOString();

    if (isStart) {
      setStartDate(isoDate);
      if (onUpdateDates && !isCreateMode) {
        const endDateObj = endDate ? new Date(endDate) : null;
        onUpdateDates(date, endDateObj, allDay);
      }
    } else {
      setEndDate(isoDate);
      if (onUpdateDates && !isCreateMode) {
        const startDateObj = startDate ? new Date(startDate) : null;
        onUpdateDates(startDateObj, date, allDay);
      }
    }

    // Update all-day state
    setIsAllDay(allDay);
  };

  // Handle picker close
  const handleDatePickerClose = () => {
    setShowStartDatePicker(false);
    setShowEndDatePicker(false);
  };

  // Format date display
  const formatDateDisplay = () => {
    if (!startDate) return null;

    if (endDate) {
      return (
        <div className="task-click-tooltip-info-item">
          <Calendar size={isMobile ? 18 : 16} className="task-click-tooltip-icon-small" />
          <div className="task-click-tooltip-date-container">
            <span
              className="task-click-tooltip-info-text task-click-tooltip-date-text"
              onClick={(e) => handleDateClick(e, true)}
              title="Click to edit start date"
            >
              {formatDateString(startDate, isAllDay)}
            </span>
            <span className="task-click-tooltip-info-text">{isAllDay ? ' to ' : ' → '}</span>
            <span
              className="task-click-tooltip-info-text task-click-tooltip-date-text"
              onClick={(e) => handleDateClick(e, false)}
              title="Click to edit end date"
            >
              {formatDateString(endDate, isAllDay)}
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="task-click-tooltip-info-item">
        <Calendar size={isMobile ? 18 : 16} className="task-click-tooltip-icon-small" />
        <span
          className="task-click-tooltip-info-text task-click-tooltip-date-text"
          onClick={(e) => handleDateClick(e, true)}
          title="Click to edit date"
        >
          {formatDateString(startDate, isAllDay)}
        </span>
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

  // Render task text display or edit form
  const renderTaskContent = () => {
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
            {!isCreateMode && (
              <button
                className="task-click-tooltip-open-button"
                onClick={onOpenFile}
                onMouseEnter={handleHover}
                title="Open file"
                disabled={isEditing}
              >
                <Pencil size={18} />
              </button>
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
                <Info size={18} className="task-click-tooltip-icon-small" />
                <span className="task-click-tooltip-info-text">Will be created in {filePath}</span>
              </div>
            )}
          </div>
        </div>

        {/* DatePicker modals */}
        {showStartDatePicker && startDate && (
          <DateTimePickerModal
            initialDate={new Date(startDate)}
            isAllDay={isAllDay}
            onClose={handleDatePickerClose}
            onSave={(date, allDay) => handleDateSave(date, allDay, true)}
            position={datePickerPosition}
            isStartDate={true}
          />
        )}

        {showEndDatePicker && endDate && (
          <DateTimePickerModal
            initialDate={new Date(endDate)}
            isAllDay={isAllDay}
            onClose={handleDatePickerClose}
            onSave={(date, allDay) => handleDateSave(date, allDay, false)}
            position={datePickerPosition}
            isStartDate={false}
          />
        )}

        {/* StatusPicker modal */}
        {showStatusPicker && (
          <StatusPickerDropdown
            currentStatus={status}
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
          {!isCreateMode && (
            <button
              className="task-click-tooltip-open-button"
              onClick={onOpenFile}
              onMouseEnter={handleHover}
              title="Open file"
              disabled={isEditing}
            >
              <Pencil size={16} />
            </button>
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
              <Info size={16} className="task-click-tooltip-icon-small" />
              <span className="task-click-tooltip-info-text">Will be created in {filePath}</span>
            </div>
          )}
        </div>
      </div>

      {/* DatePicker modals */}
      {showStartDatePicker && startDate && (
        <DateTimePickerModal
          initialDate={new Date(startDate)}
          isAllDay={isAllDay}
          onClose={handleDatePickerClose}
          onSave={(date, allDay) => handleDateSave(date, allDay, true)}
          position={datePickerPosition}
          isStartDate={true}
        />
      )}

      {showEndDatePicker && endDate && (
        <DateTimePickerModal
          initialDate={new Date(endDate)}
          isAllDay={isAllDay}
          onClose={handleDatePickerClose}
          onSave={(date, allDay) => handleDateSave(date, allDay, false)}
          position={datePickerPosition}
          isStartDate={false}
        />
      )}

      {/* StatusPicker modal */}
      {showStatusPicker && (
        <StatusPickerDropdown
          currentStatus={status}
          onClose={() => setShowStatusPicker(false)}
          onSave={handleStatusSave}
          position={statusPickerPosition}
        />
      )}
    </div>
  );
};
