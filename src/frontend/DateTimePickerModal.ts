import { Platform, setIcon } from 'obsidian';
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { FIRST_DAY } from 'src/TasksCalendarSettings';
import { calculateOptimalPosition } from '../backend/position';

export interface DateTimePickerModalProps {
  initialStartDate: Date;
  initialEndDate?: Date | null;
  isAllDay: boolean;
  onClose: () => void;
  onDone: (
    startDate: Date,
    endDate: Date | null,
    isAllDay: boolean,
    wasMultiDay: boolean
  ) => void;
  position: { top: number; left: number };
}

export class DateTimePickerModal {
  private containerEl: HTMLElement;
  private modalEl: HTMLElement;
  private calendarEl: HTMLElement | null = null;
  private calendarInstance: Calendar | null = null;
  private props: DateTimePickerModalProps;
  private handleClickOutside: (event: MouseEvent) => void;
  private timeInputDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  private wasMultiDay: boolean;
  private startDate: Date;
  private endDate: Date | null;
  private isAllDay: boolean;
  private hours: string;
  private minutes: string;
  private endHours: string;
  private endMinutes: string;

  private timeSectionEl: HTMLElement | null = null;

  constructor(containerEl: HTMLElement, props: DateTimePickerModalProps) {
    this.containerEl = containerEl;
    this.props = props;

    this.wasMultiDay = !!props.initialEndDate;
    this.startDate = new Date(props.initialStartDate);
    this.isAllDay = props.isAllDay;
    this.hours = props.initialStartDate.getHours().toString().padStart(2, '0');
    this.minutes = props.initialStartDate
      .getMinutes()
      .toString()
      .padStart(2, '0');

    if (props.initialEndDate) {
      const endDate = new Date(props.initialEndDate);
      if (props.isAllDay) endDate.setDate(endDate.getDate() - 1);
      this.endDate = endDate;
      this.endHours = props.initialEndDate
        .getHours()
        .toString()
        .padStart(2, '0');
      this.endMinutes = props.initialEndDate
        .getMinutes()
        .toString()
        .padStart(2, '0');
    } else {
      this.endDate = null;
      this.endHours = this.hours;
      this.endMinutes = this.minutes;
    }

    this.handleClickOutside = (event: MouseEvent) => {
      const modal = this.getModalElement();
      if (modal && !modal.contains(event.target as Node)) {
        this.handleCancel();
      }
    };

    this.modalEl = this.buildModal();
    this.containerEl.appendChild(this.modalEl);

    document.addEventListener('mousedown', this.handleClickOutside);

    if (!Platform.isMobile) {
      this.calculatePosition();
    }

    this.initCalendar();
  }

  destroy(): void {
    document.removeEventListener('mousedown', this.handleClickOutside);
    if (this.timeInputDebounceTimer) {
      clearTimeout(this.timeInputDebounceTimer);
    }
    if (this.calendarInstance) {
      this.calendarInstance.destroy();
      this.calendarInstance = null;
    }
    this.modalEl.remove();
  }

  private getModalElement(): HTMLElement | null {
    if (Platform.isMobile) {
      return this.modalEl.querySelector('.date-time-picker-modal');
    }
    return this.modalEl;
  }

  private get isMultiDay(): boolean {
    return (
      !!this.endDate &&
      this.endDate.toDateString() !== this.startDate.toDateString()
    );
  }

  private buildModal(): HTMLElement {
    if (Platform.isMobile) {
      const overlay = document.createElement('div');
      overlay.className = 'mobile-modal-overlay';
      overlay.appendChild(this.buildModalContent());
      return overlay;
    }
    return this.buildModalContent();
  }

  private buildModalContent(): HTMLElement {
    const isMobile = Platform.isMobile;
    const iconSize = isMobile ? 18 : 16;

    const modal = document.createElement('div');
    modal.className = 'date-time-picker-modal';

    // Header
    const header = modal.createDiv({ cls: 'date-time-picker-header' });
    header.createDiv({
      cls: 'date-time-picker-title',
      text: this.endDate ? 'Date range' : 'Select date',
    });

    const headerButtons = header.createDiv({
      cls: 'date-time-picker-header-buttons',
    });
    const closeBtn = headerButtons.createEl('button', {
      cls: 'date-time-picker-close-button',
      attr: { title: 'Cancel' },
    });
    setIcon(closeBtn, 'x');
    const closeSvg = closeBtn.querySelector('svg');
    if (closeSvg) {
      closeSvg.setAttribute('width', String(iconSize));
      closeSvg.setAttribute('height', String(iconSize));
    }
    closeBtn.addEventListener('click', () => this.handleCancel());

    // Date range summary
    this.buildDateRangeSummary(modal);

    // Calendar container
    const calendarContainer = modal.createDiv({
      cls: 'date-time-picker-calendar-container',
    });
    this.calendarEl = calendarContainer.createDiv({
      cls: 'date-time-picker-calendar',
    });

    // Time container
    this.timeSectionEl = modal.createDiv({
      cls: 'date-time-picker-time-container',
    });
    this.rebuildTimeSection();

    return modal;
  }

  private buildDateRangeSummary(parent: HTMLElement): void {
    const existing = parent.querySelector('.date-range-summary');
    if (existing) existing.remove();

    if (!this.endDate) return;

    const titleEl = parent.querySelector('.date-time-picker-title');
    if (titleEl) titleEl.textContent = 'Date range';

    const summary = document.createElement('div');
    summary.className = 'date-range-summary';

    const textDiv = summary.createDiv();
    const strong = textDiv.createEl('strong');
    strong.textContent = `${this.startDate.toLocaleDateString()} - ${this.endDate.toLocaleDateString()}`;

    const clearBtn = summary.createEl('button', {
      cls: 'date-range-clear',
      text: 'Clear End Date',
      attr: { title: 'Convert to single day' },
    });
    clearBtn.addEventListener('click', () => {
      this.endDate = null;
      this.handleDataChange();
      this.rebuildTimeSectionAndSummary();
      this.updateSelectedDateHighlight();
    });

    // Insert after calendar container or after header
    const calendarContainer = parent.querySelector(
      '.date-time-picker-calendar-container'
    );
    if (calendarContainer) {
      parent.insertBefore(summary, calendarContainer);
    } else {
      parent.appendChild(summary);
    }
  }

  private rebuildTimeSectionAndSummary(): void {
    const modal = this.getModalElement();
    if (modal) {
      this.buildDateRangeSummary(modal);
      const titleEl = modal.querySelector('.date-time-picker-title');
      if (titleEl) {
        titleEl.textContent = this.endDate ? 'Date range' : 'Select date';
      }
    }
    this.rebuildTimeSection();
  }

  private rebuildTimeSection(): void {
    if (!this.timeSectionEl) return;
    this.timeSectionEl.empty();

    const isMobile = Platform.isMobile;

    // All-day checkbox
    const allDayDiv = this.timeSectionEl.createDiv({
      cls: 'date-time-picker-all-day',
    });
    const label = allDayDiv.createEl('label');
    const checkbox = label.createEl('input', { type: 'checkbox' });
    checkbox.checked = this.isAllDay;
    checkbox.addEventListener('change', () => {
      this.isAllDay = checkbox.checked;
      this.handleDataChange();
      this.rebuildTimeSection();
    });
    label.appendText(' All day');

    // Time inputs
    if (!this.isAllDay) {
      if (isMobile) {
        this.buildMobileTimeInputs();
      } else {
        this.buildDesktopTimeInputs();
      }
    }

    // Done button
    const doneContainer = this.timeSectionEl.createDiv({
      cls: 'date-time-picker-done-container',
    });
    const doneBtn = doneContainer.createEl('button', {
      cls: 'date-time-picker-done-button',
      text: 'Done',
    });
    doneBtn.addEventListener('click', () => this.handleDone());
  }

  private buildMobileTimeInputs(): void {
    if (!this.timeSectionEl) return;

    // Start time
    const startTimeDiv = this.timeSectionEl.createDiv({
      cls: 'date-time-picker-time',
    });
    if (this.isMultiDay) {
      startTimeDiv.createSpan({
        cls: 'date-time-picker-time-label',
        text: 'Start',
      });
    }

    const startClockIcon = startTimeDiv.createSpan({
      cls: 'date-time-picker-time-icon',
    });
    setIcon(startClockIcon, 'clock');
    const startClockSvg = startClockIcon.querySelector('svg');
    if (startClockSvg) {
      startClockSvg.setAttribute('width', '18');
      startClockSvg.setAttribute('height', '18');
    }

    this.buildSelectTimeInput(startTimeDiv, this.hours, 24, val => {
      this.hours = val;
      this.handleDataChange();
    });

    startTimeDiv.createSpan({
      cls: 'date-time-picker-time-separator',
      text: ':',
    });

    this.buildSelectTimeInput(
      startTimeDiv,
      this.minutes,
      12,
      val => {
        this.minutes = val;
        this.handleDataChange();
      },
      true
    );

    // End time (multi-day only)
    if (this.isMultiDay) {
      const endTimeDiv = this.timeSectionEl.createDiv({
        cls: 'date-time-picker-time',
      });
      endTimeDiv.createSpan({
        cls: 'date-time-picker-time-label',
        text: 'End',
      });

      const endClockIcon = endTimeDiv.createSpan({
        cls: 'date-time-picker-time-icon',
      });
      setIcon(endClockIcon, 'clock');
      const endClockSvg = endClockIcon.querySelector('svg');
      if (endClockSvg) {
        endClockSvg.setAttribute('width', '18');
        endClockSvg.setAttribute('height', '18');
      }

      this.buildSelectTimeInput(endTimeDiv, this.endHours, 24, val => {
        this.endHours = val;
        this.handleDataChange();
      });

      endTimeDiv.createSpan({
        cls: 'date-time-picker-time-separator',
        text: ':',
      });

      this.buildSelectTimeInput(
        endTimeDiv,
        this.endMinutes,
        12,
        val => {
          this.endMinutes = val;
          this.handleDataChange();
        },
        true
      );
    }
  }

  private buildSelectTimeInput(
    parent: HTMLElement,
    currentValue: string,
    count: number,
    onChange: (val: string) => void,
    isMinutes = false
  ): void {
    const wrapper = parent.createDiv({ cls: 'time-input-with-controls' });
    const select = wrapper.createEl('select');
    select.value = currentValue;

    for (let i = 0; i < count; i++) {
      const val = isMinutes
        ? (i * 5).toString().padStart(2, '0')
        : i.toString().padStart(2, '0');
      select.createEl('option', { value: val, text: val });
    }
    select.value = currentValue;

    select.addEventListener('change', () => {
      onChange(select.value);
    });
  }

  private buildDesktopTimeInputs(): void {
    if (!this.timeSectionEl) return;

    // Start time
    const startTimeDiv = this.timeSectionEl.createDiv({
      cls: 'date-time-picker-time',
    });
    if (this.isMultiDay) {
      startTimeDiv.createSpan({
        cls: 'date-time-picker-time-label',
        text: 'Start',
      });
    }

    const startClockIcon = startTimeDiv.createSpan({
      cls: 'date-time-picker-time-icon',
    });
    setIcon(startClockIcon, 'clock');
    const startClockSvg = startClockIcon.querySelector('svg');
    if (startClockSvg) {
      startClockSvg.setAttribute('width', '18');
      startClockSvg.setAttribute('height', '18');
    }

    this.buildTextTimeInput(startTimeDiv, this.hours, 23, val => {
      this.hours = val;
    });

    startTimeDiv.createSpan({
      cls: 'date-time-picker-time-separator',
      text: ':',
    });

    this.buildTextTimeInput(startTimeDiv, this.minutes, 59, val => {
      this.minutes = val;
    });

    // End time (multi-day only)
    if (this.isMultiDay) {
      const endTimeDiv = this.timeSectionEl.createDiv({
        cls: 'date-time-picker-time',
      });
      endTimeDiv.createSpan({
        cls: 'date-time-picker-time-label',
        text: 'End',
      });

      const endClockIcon = endTimeDiv.createSpan({
        cls: 'date-time-picker-time-icon',
      });
      setIcon(endClockIcon, 'clock');
      const endClockSvg = endClockIcon.querySelector('svg');
      if (endClockSvg) {
        endClockSvg.setAttribute('width', '18');
        endClockSvg.setAttribute('height', '18');
      }

      this.buildTextTimeInput(endTimeDiv, this.endHours, 23, val => {
        this.endHours = val;
      });

      endTimeDiv.createSpan({
        cls: 'date-time-picker-time-separator',
        text: ':',
      });

      this.buildTextTimeInput(endTimeDiv, this.endMinutes, 59, val => {
        this.endMinutes = val;
      });
    }
  }

  private buildTextTimeInput(
    parent: HTMLElement,
    initialValue: string,
    maxValue: number,
    onChange: (val: string) => void
  ): void {
    const wrapper = parent.createDiv({ cls: 'time-input-with-controls' });
    const input = wrapper.createEl('input', {
      type: 'text',
      cls: 'date-time-picker-time-input',
      attr: { inputmode: 'numeric', maxlength: '2', placeholder: '00' },
      value: initialValue,
    });

    let isFocused = false;

    input.addEventListener('focus', () => {
      isFocused = true;
      if (input.value.startsWith('0') && input.value !== '0') {
        input.value = input.value.replace(/^0+/, '');
      }
    });

    input.addEventListener('blur', () => {
      isFocused = false;
      if (input.value !== '') {
        const numValue = parseInt(input.value, 10);
        if (!isNaN(numValue) && numValue >= 0 && numValue <= maxValue) {
          input.value = numValue.toString().padStart(2, '0');
          onChange(input.value);
          this.handleDataChange();
        }
      }
    });

    input.addEventListener('input', () => {
      const value = input.value;

      if (value === '') {
        onChange('');
        this.handleTimeInputDebounce();
        return;
      }

      const numericValue = value.replace(/[^0-9]/g, '');
      const numValue = parseInt(numericValue, 10);

      if (isNaN(numValue)) return;

      if (isFocused) {
        if (numValue <= maxValue) {
          input.value = numericValue;
          onChange(numericValue);
          this.handleTimeInputDebounce();
        }
      } else {
        if (numValue >= 0 && numValue <= maxValue) {
          input.value = numValue.toString().padStart(2, '0');
          onChange(input.value);
          this.handleTimeInputDebounce();
        }
      }
    });
  }

  private handleTimeInputDebounce(): void {
    if (this.timeInputDebounceTimer) {
      clearTimeout(this.timeInputDebounceTimer);
    }
    this.timeInputDebounceTimer = setTimeout(() => {
      this.timeInputDebounceTimer = null;
    }, 300);
  }

  private handleDataChange(): void {
    if (this.timeInputDebounceTimer) {
      clearTimeout(this.timeInputDebounceTimer);
      this.timeInputDebounceTimer = null;
    }
  }

  private handleCancel(): void {
    if (this.timeInputDebounceTimer) {
      clearTimeout(this.timeInputDebounceTimer);
      this.timeInputDebounceTimer = null;
    }
    this.props.onClose();
  }

  private handleDone(): void {
    if (this.timeInputDebounceTimer) {
      clearTimeout(this.timeInputDebounceTimer);
      this.timeInputDebounceTimer = null;
    }

    const { startDate: resultStart, endDate: resultEnd } =
      this.createResultDates();

    const isNowMultiDay = !!resultEnd;
    const needsMultiDayConversion = this.wasMultiDay && !isNowMultiDay;

    this.props.onDone(
      resultStart,
      resultEnd,
      this.isAllDay,
      needsMultiDayConversion
    );
  }

  private createResultDates(): {
    startDate: Date;
    endDate: Date | null;
  } {
    const resultStartDate = new Date(this.startDate);

    if (!this.isAllDay) {
      const parsedHours = parseInt(this.hours, 10);
      const parsedMinutes = parseInt(this.minutes, 10);
      resultStartDate.setHours(isNaN(parsedHours) ? 0 : parsedHours);
      resultStartDate.setMinutes(isNaN(parsedMinutes) ? 0 : parsedMinutes);
    } else {
      resultStartDate.setHours(0, 0, 0, 0);
    }

    let resultEndDate: Date | null = null;

    if (this.endDate) {
      if (this.isAllDay) {
        resultEndDate = new Date(this.endDate);
        resultEndDate.setDate(resultEndDate.getDate() + 1);
        resultEndDate.setHours(0, 0, 0, 0);
      } else {
        resultEndDate = new Date(this.endDate);
        if (this.isMultiDay) {
          const parsedHours = parseInt(this.endHours, 10);
          const parsedMinutes = parseInt(this.endMinutes, 10);
          resultEndDate.setHours(isNaN(parsedHours) ? 0 : parsedHours);
          resultEndDate.setMinutes(isNaN(parsedMinutes) ? 0 : parsedMinutes);
        } else {
          resultEndDate.setHours(resultStartDate.getHours());
          resultEndDate.setMinutes(resultStartDate.getMinutes());
        }
      }
    }

    return { startDate: resultStartDate, endDate: resultEndDate };
  }

  private initCalendar(): void {
    if (!this.calendarEl) return;

    const calendar = new Calendar(this.calendarEl, {
      plugins: [dayGridPlugin, interactionPlugin],
      initialView: 'dayGridMonth',
      initialDate: this.startDate,
      headerToolbar: {
        left: 'prev',
        center: 'title',
        right: 'next',
      },
      height: 'auto',
      contentHeight: 'auto',
      selectable: true,
      selectMirror: true,
      unselectAuto: false,
      events: [],
      navLinks: false,
      firstDay: FIRST_DAY,
      dayCellDidMount: info => {
        const cellDate = info.date;
        const isStart =
          cellDate.getFullYear() === this.startDate.getFullYear() &&
          cellDate.getMonth() === this.startDate.getMonth() &&
          cellDate.getDate() === this.startDate.getDate();

        const isEnd =
          this.endDate &&
          cellDate.getFullYear() === this.endDate.getFullYear() &&
          cellDate.getMonth() === this.endDate.getMonth() &&
          cellDate.getDate() === this.endDate.getDate();

        let isBetween = false;
        if (this.endDate && this.startDate < this.endDate) {
          const cellTime = cellDate.getTime();
          isBetween =
            cellTime > this.startDate.getTime() &&
            cellTime < this.endDate.getTime();
        }

        if (isStart) {
          info.el.classList.add('fc-day-selected-start', 'fc-day-selected');
        } else if (isEnd) {
          info.el.classList.add('fc-day-selected-end', 'fc-day-selected');
        } else if (isBetween) {
          info.el.classList.add('fc-day-in-range');
        }
      },
      dateClick: info => {
        const clickedDate = new Date(info.dateStr);
        clickedDate.setHours(this.startDate.getHours());
        clickedDate.setMinutes(this.startDate.getMinutes());

        if (
          clickedDate.toDateString() === this.startDate.toDateString() &&
          this.endDate
        ) {
          this.endDate = null;
        } else {
          this.startDate = clickedDate;
          this.endDate = null;
        }
        this.handleDataChange();
        this.rebuildTimeSectionAndSummary();
        this.updateSelectedDateHighlight();
      },
      select: info => {
        const newStartDate = new Date(info.start);
        const inclusiveEnd = new Date(info.end);
        inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);

        newStartDate.setHours(this.startDate.getHours());
        newStartDate.setMinutes(this.startDate.getMinutes());

        this.startDate = newStartDate;
        this.endDate =
          newStartDate.toDateString() !== inclusiveEnd.toDateString()
            ? inclusiveEnd
            : null;

        this.handleDataChange();
        calendar.unselect();
        this.rebuildTimeSectionAndSummary();
        this.updateSelectedDateHighlight();
      },
      datesSet: () => {
        setTimeout(() => {
          calendar.updateSize();
          this.updateSelectedDateHighlight();
        }, 0);
      },
      dayHeaderFormat: { weekday: 'narrow' },
      fixedWeekCount: false,
    });

    calendar.render();
    this.calendarInstance = calendar;

    setTimeout(() => {
      calendar.updateSize();
      this.updateSelectedDateHighlight();
    }, 0);
  }

  private updateSelectedDateHighlight(): void {
    if (!this.calendarEl) return;

    const selectedCells = this.calendarEl.querySelectorAll(
      '.fc-day-selected, .fc-day-selected-start, .fc-day-selected-end, .fc-day-in-range'
    );
    selectedCells.forEach(el => {
      el.classList.remove(
        'fc-day-selected',
        'fc-day-selected-start',
        'fc-day-selected-end',
        'fc-day-in-range'
      );
    });

    const todayCells = this.calendarEl.querySelectorAll('.fc-day-today');
    todayCells.forEach(el => el.classList.remove('fc-day-today'));

    const formatDate = (date: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    };

    const startDateStr = formatDate(this.startDate);
    const startCell = this.calendarEl.querySelector(
      `[data-date="${startDateStr}"]`
    );
    if (startCell) {
      startCell.classList.add('fc-day-selected-start', 'fc-day-selected');
    }

    if (this.endDate) {
      const endDateStr = formatDate(this.endDate);
      const endCell = this.calendarEl.querySelector(
        `[data-date="${endDateStr}"]`
      );
      if (endCell) {
        endCell.classList.add('fc-day-selected-end', 'fc-day-selected');
      }

      if (this.startDate < this.endDate) {
        const d = new Date(this.startDate);
        d.setDate(d.getDate() + 1);
        const end = new Date(this.endDate);
        for (; d < end; d.setDate(d.getDate() + 1)) {
          const dateStr = formatDate(d);
          const dayCell = this.calendarEl.querySelector(
            `[data-date="${dateStr}"]`
          );
          if (dayCell) {
            dayCell.classList.add('fc-day-in-range');
          }
        }
      }
    }
  }

  private calculatePosition(): void {
    const modal = this.getModalElement();
    if (!modal) return;

    const { position } = this.props;
    const sourceEl = document.createElement('div');
    sourceEl.style.position = 'absolute';
    sourceEl.style.left = `${position.left}px`;
    sourceEl.style.top = `${position.top - 5}px`;
    sourceEl.style.width = '100px';
    sourceEl.style.height = '20px';
    document.body.appendChild(sourceEl);

    calculateOptimalPosition(sourceEl, modal, 10);

    document.body.removeChild(sourceEl);
  }
}
