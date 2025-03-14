import React, { useEffect, useRef, useState } from 'react';
import { FileText, Pencil, X, Calendar, Tag, Info, CheckCircle } from 'lucide-react';
import { DateTimePickerModal } from './DateTimePickerModal';
import { StatusPickerModal } from './StatusPickerModal';
import { formatStatus } from '../utils/status';
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
}

export const TaskClickTooltip: React.FC<TaskClickTooltipProps> = ({
  taskText,
  cleanText,
  filePath,
  position,
  onClose,
  onOpenFile,
  startDate,
  endDate,
  tags,
  status = ' ',
  line,
  isAllDay,
  onUpdateDates,
  onUpdateStatus
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const fileName = filePath.split('/').pop() || filePath;
  const isMobile = Platform.isMobile;

  // Handle clicks outside the tooltip
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Date picker state
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [datePickerPosition, setDatePickerPosition] = useState({ top: 0, left: 0 });
  const [statusPickerPosition, setStatusPickerPosition] = useState({ top: 0, left: 0 });

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
    if (!onUpdateStatus) return;

    if (isMobile) {
      // For mobile, we don't need specific positioning as it will be centered
      setStatusPickerPosition({ top: 0, left: 0 });
    } else {
    // Get clicked element position for the status picker
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Simple positioning - will be refined by calculateOptimalPosition in StatusPickerModal
    const top = rect.bottom + 5;
    const left = rect.left;
    setStatusPickerPosition({ top, left });
    }

    setShowStatusPicker(true);

    e.preventDefault();
    e.stopPropagation();
  };

  // Date save handler
  const handleDateSave = (date: Date, isAllDay: boolean, isStart: boolean) => {
    if (!onUpdateDates) return;

    if (isStart) {
      let endDateObj = null;
      if (endDate) {
        endDateObj = new Date(endDate);
      }
      onUpdateDates(date, endDateObj, isAllDay);
    } else {
      let startDateObj = null;
      if (startDate) {
        startDateObj = new Date(startDate);
      }
      onUpdateDates(startDateObj, date, isAllDay);
    }

    setShowStartDatePicker(false);
    setShowEndDatePicker(false);
  };

  // Status save handler
  const handleStatusSave = (newStatus: string) => {
    if (onUpdateStatus) {
      onUpdateStatus(newStatus);
    }
    setShowStatusPicker(false);
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

  // Render different container based on mobile or desktop
  return isMobile ? (
    <div className="mobile-modal-overlay">
      <div className="task-click-tooltip" ref={tooltipRef}>
        <div className="task-click-tooltip-header">
          <div className="task-click-tooltip-file-container">
            <FileText size={18} className="task-click-tooltip-icon" />
            <span className="task-click-tooltip-file">{fileName}</span>
          </div>
          <div className="task-click-tooltip-actions">
            <button
              className="task-click-tooltip-open-button"
              onClick={onOpenFile}
              title="Open file"
            >
              <Pencil size={18} />
            </button>
            <button
              className="task-click-tooltip-close-button"
              onClick={onClose}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="task-click-tooltip-content">
          <div className="task-click-tooltip-main-text">
            {cleanText || taskText}
          </div>

          <div className="task-click-tooltip-info">
            {status && (
              <div className="task-click-tooltip-info-item">
                <CheckCircle size={18} className="task-click-tooltip-icon-small" />
                <span
                  className="task-click-tooltip-info-text task-click-tooltip-status-text"
                  onClick={(e) => onUpdateStatus && handleStatusClick(e)}
                  title="Click to change status"
                >
                  <span className="task-click-tooltip-status-value">{formatStatus(status)}</span>
                </span>
              </div>
            )}

            {tags && tags.length > 0 && (
              <div className="task-click-tooltip-info-item">
                <Tag size={18} className="task-click-tooltip-icon-small" />
                <span className="task-click-tooltip-info-text">{tags.join(', ')}</span>
              </div>
            )}

            {formatDateDisplay()}

            <div
              className="task-click-tooltip-info-item task-click-tooltip-file-link"
              onClick={onOpenFile}
              title="Click to open task"
            >
              <Info size={18} className="task-click-tooltip-icon-small" />
              <span className="task-click-tooltip-info-text">{filePath}{line ? ` (line ${line})` : ''}</span>
            </div>
          </div>
        </div>

        {/* DatePicker modals */}
        {showStartDatePicker && startDate && (
          <DateTimePickerModal
            initialDate={new Date(startDate)}
            isAllDay={!!isAllDay}
            onClose={() => setShowStartDatePicker(false)}
            onSave={(date, isAllDay) => handleDateSave(date, isAllDay, true)}
            position={datePickerPosition}
            isStartDate={true}
          />
        )}

        {showEndDatePicker && endDate && (
          <DateTimePickerModal
            initialDate={new Date(endDate)}
            isAllDay={!!isAllDay}
            onClose={() => setShowEndDatePicker(false)}
            onSave={(date, isAllDay) => handleDateSave(date, isAllDay, false)}
            position={datePickerPosition}
            isStartDate={false}
          />
        )}

        {/* StatusPicker modal */}
        {showStatusPicker && (
          <StatusPickerModal
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
          <FileText size={16} className="task-click-tooltip-icon" />
          <span className="task-click-tooltip-file">{fileName}</span>
        </div>
        <div className="task-click-tooltip-actions">
          <button
            className="task-click-tooltip-open-button"
            onClick={onOpenFile}
            title="Open file"
          >
            <Pencil size={16} />
          </button>
          <button
            className="task-click-tooltip-close-button"
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="task-click-tooltip-content">
        <div className="task-click-tooltip-main-text">
          {cleanText || taskText}
        </div>

        <div className="task-click-tooltip-info">
          {status && (
            <div className="task-click-tooltip-info-item">
              <CheckCircle size={16} className="task-click-tooltip-icon-small" />
              <span
                className="task-click-tooltip-info-text task-click-tooltip-status-text"
                onClick={(e) => onUpdateStatus && handleStatusClick(e)}
                title="Click to change status"
              >
                <span className="task-click-tooltip-status-value">{formatStatus(status)}</span>
              </span>
            </div>
          )}

          {tags && tags.length > 0 && (
            <div className="task-click-tooltip-info-item">
              <Tag size={16} className="task-click-tooltip-icon-small" />
              <span className="task-click-tooltip-info-text">{tags.join(', ')}</span>
            </div>
          )}

          {formatDateDisplay()}

          <div
            className="task-click-tooltip-info-item task-click-tooltip-file-link"
            onClick={onOpenFile}
            title="Click to open task"
          >
            <Info size={16} className="task-click-tooltip-icon-small" />
            <span className="task-click-tooltip-info-text">{filePath}{line ? ` (line ${line})` : ''}</span>
          </div>
        </div>
      </div>

      {/* DatePicker modals */}
      {showStartDatePicker && startDate && (
        <DateTimePickerModal
          initialDate={new Date(startDate)}
          isAllDay={!!isAllDay}
          onClose={() => setShowStartDatePicker(false)}
          onSave={(date, isAllDay) => handleDateSave(date, isAllDay, true)}
          position={datePickerPosition}
          isStartDate={true}
        />
      )}

      {showEndDatePicker && endDate && (
        <DateTimePickerModal
          initialDate={new Date(endDate)}
          isAllDay={!!isAllDay}
          onClose={() => setShowEndDatePicker(false)}
          onSave={(date, isAllDay) => handleDateSave(date, isAllDay, false)}
          position={datePickerPosition}
          isStartDate={false}
        />
      )}

      {/* StatusPicker modal */}
      {showStatusPicker && (
        <StatusPickerModal
          currentStatus={status}
          onClose={() => setShowStatusPicker(false)}
          onSave={handleStatusSave}
          position={statusPickerPosition}
        />
      )}
    </div>
  );
};
