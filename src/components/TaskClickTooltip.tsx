import React, { useEffect, useRef, useState } from 'react';
import { FileText, Pencil, X, Calendar, Tag, Info, CheckCircle } from 'lucide-react';
import { DateTimePickerModal } from './DateTimePickerModal';

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
  // 追加：日付更新ハンドラー
  onUpdateDates?: (startDate: Date | null, endDate: Date | null, isAllDay: boolean) => void;
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
  isAllDay,
  onUpdateDates
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
  const formatDateString = (dateStr: string, isAllDayFormat = false) => {
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

  // 日付選択モーダル表示用のステート
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [datePickerPosition, setDatePickerPosition] = useState({ top: 0, left: 0 });

  // Format date display
  const formatDateDisplay = () => {
    if (!startDate) return null;

    if (endDate) {
      return (
        <div className="task-click-tooltip-info-item">
          <Calendar size={16} className="task-click-tooltip-icon-small" />
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
        <Calendar size={16} className="task-click-tooltip-icon-small" />
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

  // 日付クリックイベントハンドラ
  const handleDateClick = (e: React.MouseEvent, isStart: boolean) => {
    if (!onUpdateDates) return;

    // クリックした要素の位置を取得
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // カレンダーの推定サイズ（高さ約420px、幅280px）
    const calendarHeight = 420;
    const calendarWidth = 280;

    // 位置を計算
    let top = rect.bottom + 5;
    let left = rect.left;

    // 下部に表示すると画面からはみ出す場合は上部に表示
    if (top + calendarHeight > viewportHeight - 20) {
      top = rect.top - calendarHeight - 5;
    }

    // 左端が画面からはみ出す場合は調整
    if (left < 10) {
      left = 10;
    }

    // 右端が画面からはみ出す場合は調整
    if (left + calendarWidth > viewportWidth - 10) {
      left = viewportWidth - calendarWidth - 10;
    }

    const position = { top, left };
    setDatePickerPosition(position);

    // モーダル表示フラグを設定
    if (isStart) {
      setShowStartDatePicker(true);
      setShowEndDatePicker(false);
    } else {
      setShowStartDatePicker(false);
      setShowEndDatePicker(true);
    }

    // イベントの伝播を停止
    e.preventDefault();
    e.stopPropagation();
  };

  // 日付更新ハンドラ
  const handleDateSave = (date: Date, isAllDay: boolean, isStart: boolean) => {
    if (!onUpdateDates) return;

    if (isStart) {
      // 開始日の更新
      let endDateObj = null;
      if (endDate) {
        endDateObj = new Date(endDate);
      }
      onUpdateDates(date, endDateObj, isAllDay);
    } else {
      // 終了日の更新
      let startDateObj = null;
      if (startDate) {
        startDateObj = new Date(startDate);
      }
      onUpdateDates(startDateObj, date, isAllDay);
    }

    // モーダルを閉じる
    setShowStartDatePicker(false);
    setShowEndDatePicker(false);
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

      {/* DatePicker モーダル */}
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
    </div>
  );
};
