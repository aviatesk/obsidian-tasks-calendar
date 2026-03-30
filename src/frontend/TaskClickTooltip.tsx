import React, { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Pencil,
  Calendar,
  CalendarClock,
  Tag,
  Info,
  Check,
  XCircle,
  Edit,
  Plus,
  Trash2,
  AlertCircle,
  Repeat,
} from 'lucide-react';
import { DateTimePickerNativeModal } from './DateTimePickerModal';
import { StatusPickerNativeModal } from './StatusPickerDropdown';
import { formatStatus } from '../backend/status';
import { getStatusIcon } from './statusIcon';
import { type App, Modal, Platform } from 'obsidian';
import { DEFAULT_CALENDAR_SETTINGS } from 'src/TasksCalendarSettings';
import { createLogger } from '../logging';

export interface TaskClickTooltipProps {
  app: App;
  taskText: string;
  cleanText?: string;
  filePath: string;
  onClose: () => void;
  onOpenFile: () => void;
  startDate?: string;
  endDate?: string;
  tags?: string[];
  status?: string;
  line?: number;
  isAllDay?: boolean;
  onUpdateDates?: (
    startDate: Date | null,
    endDate: Date | null,
    isAllDay: boolean,
    wasMultiDay: boolean
  ) => void;
  onUpdateStatus?: (newStatus: string) => void;
  onUpdateText?: (newText: string, originalText: string) => Promise<boolean>;
  onHoverLink?: (
    event: React.MouseEvent,
    filePath: string,
    line?: number
  ) => void;
  onDeleteTask?: (filePath: string, line?: number) => Promise<boolean>;
  recurrence?: string;
  onUpdateRecurrence?: (newPattern: string) => void;
  onUpdateProperty?: (propertyName: string, newValue: string) => void;
  isCreateMode?: boolean;
  selectedDate?: Date;
  onCreateTask?: (
    text: string,
    startDate: Date | null,
    endDate: Date | null,
    isAllDay: boolean,
    status: string,
    targetPath: string
  ) => Promise<boolean>;
  availableDestinations?: string[];
}

export const TaskClickTooltip: React.FC<TaskClickTooltipProps> = ({
  app,
  taskText,
  cleanText,
  filePath,
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
  recurrence,
  onUpdateRecurrence,
  onUpdateProperty,
  isCreateMode = false,
  selectedDate,
  onCreateTask,
  availableDestinations = DEFAULT_CALENDAR_SETTINGS.newTaskFilePaths,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const fileName = filePath.split('/').pop() || filePath;
  const isMobile = Platform.isMobile;
  const logger = createLogger('TaskClickTooltip');

  const [startDate, setStartDate] = useState<string | undefined>(
    isCreateMode && selectedDate ? selectedDate.toISOString() : initialStartDate
  );
  const [endDate, setEndDate] = useState<string | undefined>(initialEndDate);
  const [isAllDay, setIsAllDay] = useState<boolean>(!!initialIsAllDay);

  const [isEditing, setIsEditing] = useState<boolean>(isCreateMode);
  const [editedText, setEditedText] = useState<string>(
    isCreateMode ? '' : cleanText || ''
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [currentStatus, setCurrentStatus] = useState<string>(status);
  const [currentCleanText, setCurrentCleanText] = useState<string>(
    cleanText || ''
  );
  const [currentRecurrence, setCurrentRecurrence] = useState<string>(
    recurrence ?? ''
  );

  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  const [isEditingRecurrence, setIsEditingRecurrence] =
    useState<boolean>(false);
  const [editedRecurrence, setEditedRecurrence] =
    useState<string>(currentRecurrence);

  const [selectedDestination, setSelectedDestination] = useState<string>(
    filePath || availableDestinations[0]
  );

  const [createdValue, setCreatedValue] = useState<string | null>(() => {
    const match = taskText.match(/\[created::\s*(\d{4}-\d{2}-\d{2})\]/);
    return match ? match[1] : null;
  });

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleHover = (event: React.MouseEvent) => {
    if (onHoverLink && filePath) {
      onHoverLink(event, filePath, line);
    }
  };

  const handleEditStart = () => {
    setEditedText(currentCleanText);
    setIsEditing(true);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedText(e.target.value);
  };

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        cancelButtonRef.current?.focus();
      } else {
        saveButtonRef.current?.focus();
      }
    }
  };

  const handleTextSave = async () => {
    if (isCreateMode && onCreateTask) {
      setIsSaving(true);

      const startDateObj = startDate ? new Date(startDate) : null;
      const endDateObj = endDate ? new Date(endDate) : null;

      const success = await onCreateTask(
        editedText,
        startDateObj,
        endDateObj,
        isAllDay,
        currentStatus,
        selectedDestination
      );

      setIsSaving(false);

      if (success) {
        onClose();
      }
    } else if (onUpdateText && currentCleanText !== editedText) {
      setIsSaving(true);
      const success = await onUpdateText(editedText, currentCleanText);
      setIsSaving(false);

      if (success) {
        setCurrentCleanText(editedText);
        setIsEditing(false);
      }
    } else {
      setIsEditing(false);
    }
  };

  const handleTextCancel = () => {
    if (isCreateMode) {
      onClose();
    } else {
      setEditedText(currentCleanText);
      setIsEditing(false);
    }
  };

  const adjustEndDateForDisplay = (
    dateStr: string,
    isAllDayFormat: boolean
  ): string => {
    if (!dateStr || !isAllDayFormat) return dateStr;
    const date = new Date(dateStr);
    date.setDate(date.getDate() - 1);
    return date.toISOString();
  };

  const formatDateString = (dateStr: string, isAllDayFormat = false) => {
    try {
      const date = new Date(dateStr);

      if (isAllDayFormat) {
        return date.toLocaleDateString(undefined, {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      }

      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const handleDateClick = (e: React.MouseEvent) => {
    if (!onUpdateDates && !isCreateMode) return;

    new DateTimePickerNativeModal(app, {
      title: cleanText || undefined,
      initialStartDate: startDate ? new Date(startDate) : new Date(),
      initialEndDate: endDate ? new Date(endDate) : null,
      isAllDay,
      onDone: handleDateDone,
    }).open();

    e.preventDefault();
    e.stopPropagation();
  };

  const handleStatusClick = (e: React.MouseEvent) => {
    if (!onUpdateStatus && !isCreateMode) return;

    new StatusPickerNativeModal(app, {
      currentStatus,
      onSave: handleStatusSave,
    }).open();

    e.preventDefault();
    e.stopPropagation();
  };

  const handleStatusSave = (newStatus: string) => {
    setCurrentStatus(newStatus);
    if (onUpdateStatus && !isCreateMode) {
      onUpdateStatus(newStatus);
    }
  };

  const handleDateDone = (
    newStartDate: Date,
    newEndDate: Date | null,
    newAllDay: boolean,
    wasMultiDay: boolean
  ) => {
    const newStartStr = newStartDate.toISOString();
    const newEndStr = newEndDate ? newEndDate.toISOString() : undefined;

    setStartDate(newStartStr);
    setEndDate(newEndStr);
    setIsAllDay(newAllDay);

    if (onUpdateDates && !isCreateMode) {
      const startDateObj = newStartStr ? new Date(newStartStr) : null;
      const endDateObj = newEndStr ? new Date(newEndStr) : null;
      onUpdateDates(startDateObj, endDateObj, newAllDay, wasMultiDay);
    }
  };

  const formatDateDisplay = () => {
    if (!startDate) return null;

    const displayEndDate = endDate
      ? adjustEndDateForDisplay(endDate, isAllDay)
      : undefined;

    return (
      <div className="task-click-tooltip-info-item">
        <Calendar size={18} className="task-click-tooltip-icon-small" />
        <div
          className="task-click-tooltip-date-container"
          onClick={handleDateClick}
          title="Click to edit date"
        >
          <span className="task-click-tooltip-info-text task-click-tooltip-date-text">
            {formatDateString(startDate, isAllDay)}
            {displayEndDate && (
              <>
                <span className="task-click-tooltip-info-text">
                  {isAllDay ? ' to ' : ' → '}
                </span>
                {formatDateString(displayEndDate, isAllDay)}
              </>
            )}
          </span>
        </div>
      </div>
    );
  };

  const handleCreatedClick = (e: React.MouseEvent) => {
    if (!onUpdateProperty || !createdValue) return;

    const createdDate = new Date(createdValue + 'T00:00:00');
    if (isNaN(createdDate.getTime())) return;

    new DateTimePickerNativeModal(app, {
      title: cleanText || undefined,
      initialStartDate: createdDate,
      initialEndDate: null,
      isAllDay: true,
      onDone: (newDate: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        const formatted = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())}`;
        setCreatedValue(formatted);
        onUpdateProperty('created', formatted);
      },
    }).open();

    e.preventDefault();
    e.stopPropagation();
  };

  const formatCreatedDisplay = () => {
    if (!createdValue) return null;

    const createdDate = new Date(createdValue + 'T00:00:00');
    if (isNaN(createdDate.getTime())) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = today.getTime() - createdDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const formattedDate = createdDate.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const daysLabel =
      diffDays === 0
        ? 'today'
        : diffDays === 1
          ? '1 day ago'
          : `${diffDays} days ago`;

    const clickable = !!onUpdateProperty;

    return (
      <div className="task-click-tooltip-info-item">
        <CalendarClock size={18} className="task-click-tooltip-icon-small" />
        <span
          className={`task-click-tooltip-info-text${clickable ? ' task-click-tooltip-date-text' : ''}`}
          onClick={clickable ? handleCreatedClick : undefined}
          style={clickable ? { cursor: 'pointer' } : undefined}
          title={clickable ? 'Click to edit created date' : undefined}
        >
          {formattedDate} ({daysLabel})
        </span>
      </div>
    );
  };

  const formatTagsDisplay = () => {
    if (!tags || tags.length === 0) return null;

    return (
      <div className="task-click-tooltip-info-item">
        <Tag size={18} className="task-click-tooltip-icon-small" />
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

  const handleRecurrenceSave = () => {
    const trimmed = editedRecurrence.trim();
    setCurrentRecurrence(trimmed);
    if (onUpdateRecurrence) {
      onUpdateRecurrence(trimmed);
    }
    setIsEditingRecurrence(false);
  };

  const formatRecurrenceDisplay = () => {
    if (!currentRecurrence && !isEditingRecurrence) return null;

    if (isEditingRecurrence) {
      return (
        <div className="task-click-tooltip-info-item">
          <Repeat size={18} className="task-click-tooltip-icon-small" />
          <div className="task-click-tooltip-recurrence-edit">
            <input
              type="text"
              className="task-click-tooltip-recurrence-input"
              value={editedRecurrence}
              onChange={e => setEditedRecurrence(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleRecurrenceSave();
                if (e.key === 'Escape') {
                  setIsEditingRecurrence(false);
                  setEditedRecurrence(currentRecurrence);
                }
              }}
              placeholder="e.g. every week"
              autoFocus
            />
            <button
              className="task-click-tooltip-recurrence-save"
              onClick={handleRecurrenceSave}
              title="Save recurrence"
            >
              <Check size={18} />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="task-click-tooltip-info-item">
        <Repeat size={18} className="task-click-tooltip-icon-small" />
        <span
          className="task-click-tooltip-info-text"
          onClick={
            onUpdateRecurrence
              ? () => {
                  setIsEditingRecurrence(true);
                  setEditedRecurrence(currentRecurrence);
                }
              : undefined
          }
          style={onUpdateRecurrence ? { cursor: 'pointer' } : undefined}
          title={onUpdateRecurrence ? 'Click to edit recurrence' : undefined}
        >
          {currentRecurrence}
        </span>
      </div>
    );
  };

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
      logger.warn(`Failed to delete task: ${error}`);
      setShowDeleteConfirm(false);
      setIsDeleting(false);
    }
  };

  const renderDeleteConfirmation = () => {
    if (!showDeleteConfirm) return null;

    return (
      <div className="task-click-tooltip-delete-confirm">
        <div className="task-click-tooltip-delete-message">
          <AlertCircle size={18} className="task-click-tooltip-delete-icon" />
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
            onClick={() => void handleDeleteConfirm()}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    );
  };

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
            placeholder={
              isCreateMode ? 'Type your new task here...' : 'Task text...'
            }
            spellCheck={false}
            autoFocus
          />
          <div className="task-click-tooltip-edit-actions">
            <button
              ref={cancelButtonRef}
              className="task-click-tooltip-cancel-button"
              onClick={handleTextCancel}
              disabled={isSaving}
              title={isCreateMode ? 'Cancel task creation' : 'Cancel editing'}
            >
              Cancel
              <XCircle size={isMobile ? 18 : 16} />
            </button>
            <button
              ref={saveButtonRef}
              className="task-click-tooltip-save-button"
              onClick={() => void handleTextSave()}
              disabled={isSaving || (isCreateMode && !editedText.trim())}
              title={isCreateMode ? 'Create task' : 'Save changes'}
            >
              {isSaving ? 'Saving...' : isCreateMode ? 'Create' : 'Save'}
              {!isSaving &&
                (isCreateMode ? (
                  <Plus size={isMobile ? 18 : 16} />
                ) : (
                  <Check size={isMobile ? 18 : 16} />
                ))}
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
          title={onUpdateText ? 'Click to edit task text' : undefined}
        >
          {currentCleanText || taskText}
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
    return React.createElement(getStatusIcon(currentStatus), {
      size: 18,
      className: 'task-click-tooltip-icon-small',
    });
  };

  return (
    <div className="task-click-tooltip">
      <div className="task-click-tooltip-title">
        <div className="task-click-tooltip-title-text">
          {isCreateMode ? (
            <Plus size={18} className="task-click-tooltip-title-icon" />
          ) : (
            <FileText size={18} className="task-click-tooltip-title-icon" />
          )}
          <span>
            {isCreateMode
              ? `New task in ${selectedDestination.split('/').pop() || selectedDestination}`
              : fileName}
          </span>
        </div>
        {!isCreateMode && !showDeleteConfirm && (
          <div className="task-click-tooltip-title-actions">
            <button
              className="task-click-tooltip-title-action"
              onClick={onOpenFile}
              onMouseEnter={handleHover}
              title="Open file"
              disabled={isEditing}
            >
              <Pencil size={14} />
            </button>
            {onDeleteTask && (
              <button
                className="task-click-tooltip-title-action task-click-tooltip-title-action-delete"
                onClick={handleDeleteClick}
                title="Delete task"
                disabled={isEditing}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="task-click-tooltip-content">
        {renderTaskContent()}

        <div className="task-click-tooltip-info">
          {currentStatus && (
            <div className="task-click-tooltip-info-item">
              {renderStatusIcon()}
              <span
                className="task-click-tooltip-info-text task-click-tooltip-status-text"
                onClick={handleStatusClick}
                title={
                  isEditing
                    ? 'Finish editing task first'
                    : 'Click to change status'
                }
              >
                <span className="task-click-tooltip-status-value">
                  {formatStatus(currentStatus)}
                </span>
              </span>
            </div>
          )}

          {formatDateDisplay()}

          {formatRecurrenceDisplay()}

          {formatCreatedDisplay()}

          {formatTagsDisplay()}

          {!isCreateMode && (
            <div
              className="task-click-tooltip-info-item task-click-tooltip-file-link"
              onClick={onOpenFile}
              onMouseEnter={handleHover}
              title="Click to open task"
            >
              <Info size={18} className="task-click-tooltip-icon-small" />
              <span className="task-click-tooltip-info-text">
                {filePath}
                {line ? ` (line ${line})` : ''}
              </span>
            </div>
          )}

          {isCreateMode && (
            <div className="task-click-tooltip-info-item">
              <Info
                size={18}
                className="task-click-tooltip-icon-small task-click-tooltip-icon-info"
              />
              {availableDestinations.length <= 1 ? (
                <span className="task-click-tooltip-info-text">
                  Will be created in {selectedDestination}{' '}
                  {selectedDestination.endsWith('/')
                    ? '(new task note)'
                    : '(new task list)'}
                </span>
              ) : (
                <div className="task-click-tooltip-destination-select">
                  <span className="task-click-tooltip-destination-label">
                    Will be created in
                  </span>
                  <select
                    value={selectedDestination}
                    onChange={e => setSelectedDestination(e.target.value)}
                    className="task-click-tooltip-inline-dropdown"
                    disabled={isSaving}
                  >
                    {availableDestinations.map((destination, index) => (
                      <option key={index} value={destination}>
                        {destination}{' '}
                        {destination.endsWith('/')
                          ? '(new task note)'
                          : '(new task list)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import { EventApi } from '@fullcalendar/core';
import { ReactRenderer } from './ReactRoot';

type TaskTooltipModalProps = Omit<TaskClickTooltipProps, 'onClose' | 'app'> & {
  event?: EventApi;
};

export class TaskTooltipModal extends Modal {
  private renderer: ReactRenderer | null = null;
  private readonly props: TaskTooltipModalProps;

  constructor(app: App, props: TaskTooltipModalProps) {
    super(app);
    this.props = props;
    this.modalEl.addClass('tasks-calendar-task-tooltip-modal');
  }

  onOpen(): void {
    this.renderer = new ReactRenderer(this.contentEl);
    this.renderer.render(
      React.createElement(TaskClickTooltip, {
        ...this.props,
        app: this.app,
        onClose: () => this.close(),
      })
    );
  }

  onClose(): void {
    this.renderer?.unmount();
    this.renderer = null;
    this.contentEl.empty();
  }
}
