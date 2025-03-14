import { Platform } from 'obsidian';
import React, { useEffect, useState, useRef } from 'react';
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import { X, Check, Clock } from 'lucide-react';
import { FIRST_DAY } from 'src/TasksCalendarSettings';
import { calculateOptimalPosition } from '../utils/position';

interface DateTimePickerModalProps {
  initialDate: Date;
  isAllDay: boolean;
  onClose: () => void;
  onSave: (date: Date, isAllDay: boolean) => void;
  position: { top: number; left: number };
  isStartDate?: boolean; // 開始日か終了日か
}

export const DateTimePickerModal: React.FC<DateTimePickerModalProps> = ({
  initialDate,
  isAllDay: initialIsAllDay,
  onClose,
  onSave,
  position,
  isStartDate = true
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [isAllDay, setIsAllDay] = useState<boolean>(initialIsAllDay);
  const calendarRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const calendarInstance = useRef<Calendar | null>(null);
  const [finalPosition, setFinalPosition] = useState(position);

  const [hours, setHours] = useState<string>(
    initialDate.getHours().toString().padStart(2, '0')
  );
  const [minutes, setMinutes] = useState<string>(
    initialDate.getMinutes().toString().padStart(2, '0')
  );

  // 入力フォーカス状態を追加
  const [hoursInputFocused, setHoursInputFocused] = useState(false);
  const [minutesInputFocused, setMinutesInputFocused] = useState(false);

  // Determine if on mobile or desktop
  const isMobile = Platform.isMobile;

  useEffect(() => {
    // Calculate optimal position after the component mounts
    if (modalRef.current) {
      // Create a temporary element to represent the source of the click
      const sourceEl = document.createElement('div');
      sourceEl.style.position = 'absolute';
      sourceEl.style.left = `${position.left}px`;
      sourceEl.style.top = `${position.top - 5}px`;  // 5px offset to represent the original element
      sourceEl.style.width = '100px';  // Approximate width
      sourceEl.style.height = '20px';  // Approximate height
      document.body.appendChild(sourceEl);

      // Calculate optimal position
      const optimalPosition = calculateOptimalPosition(sourceEl, modalRef.current, 10);
      setFinalPosition(optimalPosition);

      // Clean up temporary element
      document.body.removeChild(sourceEl);
    }
  }, [position]);

  useEffect(() => {
    // モーダルの外側をクリックした時に閉じる処理
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    if (calendarRef.current) {
      // FullCalendarのインスタンスを作成
      const calendar = new Calendar(calendarRef.current, {
        plugins: [dayGridPlugin],
        initialView: 'dayGridMonth',
        initialDate: selectedDate,
        headerToolbar: {
          left: 'prev',
          center: 'title',
          right: 'next'
        },
        height: 'auto',
        selectable: false,  // 選択機能を無効化
        events: [],         // イベントを空に
        navLinks: false,    // ナビゲーションリンクを無効化
        firstDay: FIRST_DAY,
        // 今日の日付のハイライトを無効化
        dayCellDidMount: (info) => {
          // 選択中の日付とマッチするならハイライト
          const cellDate = info.date;
          const isSelected =
            cellDate.getFullYear() === selectedDate.getFullYear() &&
            cellDate.getMonth() === selectedDate.getMonth() &&
            cellDate.getDate() === selectedDate.getDate();

          if (isSelected) {
            info.el.classList.add('fc-day-selected');
          }
        }
      });

      calendar.render();
      calendarInstance.current = calendar;

      // 手動でクリックイベントリスナーを追加
      setTimeout(() => {
        if (calendarRef.current) {
          // 既存の選択ハイライトを適用
          updateSelectedDateHighlight(selectedDate);

          const days = calendarRef.current.querySelectorAll('.fc-daygrid-day');
          days.forEach(day => {
            day.addEventListener('click', (e) => {
              // イベント伝播を停止してmodalが閉じるのを防ぐ
              e.stopPropagation();

              const dateStr = day.getAttribute('data-date');
              if (dateStr) {
                const clickedDate = new Date(dateStr);
                const newDate = new Date(selectedDate);
                newDate.setFullYear(clickedDate.getFullYear());
                newDate.setMonth(clickedDate.getMonth());
                newDate.setDate(clickedDate.getDate());

                // 既存の時間を保持
                const currentHours = parseInt(hours, 10) || 0;
                const currentMinutes = parseInt(minutes, 10) || 0;
                newDate.setHours(currentHours);
                newDate.setMinutes(currentMinutes);

                // 選択された日付を更新してハイライト
                setSelectedDate(newDate);
                updateSelectedDateHighlight(newDate);
              }
            });
          });
        }
      }, 100);

      return () => {
        calendar.destroy();
      };
    }
  }, [selectedDate, hours, minutes]);

  // 選択中の日付をハイライトする関数
  const updateSelectedDateHighlight = (date: Date) => {
    if (!calendarRef.current) return;

    // 既存の選択を削除
    const selectedCells = calendarRef.current.querySelectorAll('.fc-day-selected');
    selectedCells.forEach(el => el.classList.remove('fc-day-selected'));

    // 今日のハイライトも削除
    const todayCells = calendarRef.current.querySelectorAll('.fc-day-today');
    todayCells.forEach(el => el.classList.remove('fc-day-today'));

    // 新しい選択を追加
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD形式
    const newSelectedCell = calendarRef.current.querySelector(`[data-date="${dateStr}"]`);
    if (newSelectedCell) {
      newSelectedCell.classList.add('fc-day-selected');
    }
  };

  const handleHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // 空入力を許可
    if (value === '') {
      setHours('');
      return;
    }

    // 数値のみを抽出
    const numericValue = value.replace(/[^0-9]/g, '');
    const numValue = parseInt(numericValue, 10);

    if (isNaN(numValue)) {
      return;
    }

    // フォーカス状態ならパディングなしで値を設定
    if (hoursInputFocused) {
      // 0-23の範囲で制限
      if (numValue <= 23) {
        setHours(numericValue);
      }
    } else {
      // フォーカス外れた時は0埋め
      if (numValue >= 0 && numValue <= 23) {
        setHours(numValue.toString().padStart(2, '0'));
      }
    }
  };

  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // 空入力を許可
    if (value === '') {
      setMinutes('');
      return;
    }

    // 数値のみを抽出
    const numericValue = value.replace(/[^0-9]/g, '');
    const numValue = parseInt(numericValue, 10);

    if (isNaN(numValue)) {
      return;
    }

    // フォーカス状態ならパディングなしで値を設定
    if (minutesInputFocused) {
      // 0-59の範囲で制限
      if (numValue <= 59) {
        setMinutes(numericValue);
      }
    } else {
      // フォーカス外れた時は0埋め
      if (numValue >= 0 && numValue <= 59) {
        setMinutes(numValue.toString().padStart(2, '0'));
      }
    }
  };

  // フォーカス状態の変更ハンドラ
  const handleHoursFocus = () => {
    setHoursInputFocused(true);
    // 先頭が0の場合は削除して表示
    if (hours.startsWith('0') && hours !== '0') {
      setHours(hours.replace(/^0+/, ''));
    }
  };

  const handleHoursBlur = () => {
    setHoursInputFocused(false);
    // 入力値を0埋めで整形
    if (hours !== '') {
      const numValue = parseInt(hours, 10);
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 23) {
        setHours(numValue.toString().padStart(2, '0'));
      }
    }
  };

  const handleMinutesFocus = () => {
    setMinutesInputFocused(true);
    // 先頭が0の場合は削除して表示
    if (minutes.startsWith('0') && minutes !== '0') {
      setMinutes(minutes.replace(/^0+/, ''));
    }
  };

  const handleMinutesBlur = () => {
    setMinutesInputFocused(false);
    // 入力値を0埋めで整形
    if (minutes !== '') {
      const numValue = parseInt(minutes, 10);
      if (!isNaN(numValue) && numValue >= 0 && numValue <= 59) {
        setMinutes(numValue.toString().padStart(2, '0'));
      }
    }
  };

  const handleSave = () => {
    const resultDate = new Date(selectedDate);
    if (!isAllDay) {
      // デフォルト値を設定
      const parsedHours = parseInt(hours, 10);
      const parsedMinutes = parseInt(minutes, 10);

      resultDate.setHours(isNaN(parsedHours) ? 0 : parsedHours);
      resultDate.setMinutes(isNaN(parsedMinutes) ? 0 : parsedMinutes);
    } else {
      // 終日イベントの場合、時間を0:00に設定
      resultDate.setHours(0);
      resultDate.setMinutes(0);
      resultDate.setSeconds(0);
      resultDate.setMilliseconds(0);
    }

    onSave(resultDate, isAllDay);
  };

  return (
    <div
      className="date-time-picker-modal"
      style={{
        top: `${finalPosition.top}px`,
        left: `${finalPosition.left}px`,
      }}
      ref={modalRef}
    >
      <div className="date-time-picker-header">
        <div className="date-time-picker-title">
          {isStartDate ? 'Start' : 'End'} Date
        </div>
        <div className="date-time-picker-header-buttons">
          <button
            className="date-time-picker-save-button"
            onClick={handleSave}
            title="Save changes"
          >
            <Check size={16} />
          </button>
          <button
            className="date-time-picker-close-button"
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="date-time-picker-calendar-container">
        <div className="date-time-picker-calendar" ref={calendarRef}></div>
      </div>

      <div className="date-time-picker-time-container">
        <div className="date-time-picker-all-day">
          <label>
            <input
              type="checkbox"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
            />
            All day
          </label>
        </div>

        {!isAllDay && !isMobile && (
          <div className="date-time-picker-time">
            <Clock size={16} className="date-time-picker-time-icon" />
            <div className="time-input-with-controls">
              <input
                type="text"
                inputMode="numeric"
                className="date-time-picker-time-input"
                value={hours}
                onChange={handleHoursChange}
                onFocus={handleHoursFocus}
                onBlur={handleHoursBlur}
                maxLength={2}
                placeholder="00"
              />
            </div>
            <span className="date-time-picker-time-separator">:</span>
            <div className="time-input-with-controls">
              <input
                type="text"
                inputMode="numeric"
                className="date-time-picker-time-input"
                value={minutes}
                onChange={handleMinutesChange}
                onFocus={handleMinutesFocus}
                onBlur={handleMinutesBlur}
                maxLength={2}
                placeholder="00"
              />
            </div>
          </div>
        )}

        {!isAllDay && isMobile && (
          <div className="date-time-picker-time">
            <Clock size={16} className="date-time-picker-time-icon" />
            <div className="time-input-with-controls">
              <select
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              >
                {Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')).map((val) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
            </div>
            <span className="date-time-picker-time-separator">:</span>
            <div className="time-input-with-controls">
              <select
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              >
                {Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0')).map((val) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
