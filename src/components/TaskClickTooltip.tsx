import React, { useEffect, useRef } from 'react';
import { FileText, Pencil, X, Calendar, Tag, Info, CheckCircle } from 'lucide-react';

interface TaskClickTooltipProps {
  taskText: string;
  cleanText?: string; // Added cleanText property
  filePath: string;
  position: { top: number; left: number };
  onClose: () => void;
  onOpenFile: () => void;
  startDate?: string;
  endDate?: string;
  tags?: string[];
  status?: string;
  line?: number; // Added line number property
  isAllDay?: boolean; // 追加: 終日イベントかどうかのフラグ
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
  status,
  line,
  isAllDay
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const fileName = filePath.split('/').pop() || filePath;

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

  // Format status display
  const formatStatus = (status?: string) => {
    if (!status) return 'Unknown';

    switch(status.trim()) {
      case '': return 'Incomplete';
      case ' ': return 'Incomplete';
      case 'x': return 'Complete';
      case 'X': return 'Complete';
      case '-': return 'Cancelled';
      case '/': return 'In Progress';
      default: return status;
    }
  };

  // Helper to format date strings
  const formatDateString = (dateStr: string, isAllDayFormat: boolean = false) => {
    try {
      const date = new Date(dateStr);

      // 終日イベントの場合は時間を表示しない
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

  // Format date display
  const formatDateDisplay = () => {
    if (!startDate) return null;

    if (endDate) {
      return (
        <div className="task-click-tooltip-info-item">
          <Calendar size={16} className="task-click-tooltip-icon-small" />
          <span>
            {formatDateString(startDate, isAllDay)}
            {isAllDay ? ' to ' : ' → '}
            {formatDateString(endDate, isAllDay)}
          </span>
        </div>
      );
    }

    return (
      <div className="task-click-tooltip-info-item">
        <Calendar size={16} className="task-click-tooltip-icon-small" />
        <span>{formatDateString(startDate, isAllDay)}</span>
      </div>
    );
  };

  return (
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
              <span className="task-click-tooltip-info-text">Status: {formatStatus(status)}</span>
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
    </div>
  );
};
