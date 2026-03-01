import { Platform, setIcon } from 'obsidian';
import { DateTimePickerModal } from './DateTimePickerModal';
import { StatusPickerDropdown } from './StatusPickerDropdown';
import { formatStatus } from '../backend/status';
import { getStatusIcon } from './statusIcon';
import { DEFAULT_CALENDAR_SETTINGS } from 'src/TasksCalendarSettings';
import { createLogger } from '../logging';

export interface TaskClickTooltipProps {
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
  onUpdateDates?: (
    startDate: Date | null,
    endDate: Date | null,
    isAllDay: boolean,
    wasMultiDay: boolean
  ) => void;
  onUpdateStatus?: (newStatus: string) => void;
  onUpdateText?: (
    newText: string,
    originalText: string,
    taskText: string
  ) => Promise<boolean>;
  onHoverLink?: (event: MouseEvent, filePath: string, line?: number) => void;
  onDeleteTask?: (filePath: string, line?: number) => Promise<boolean>;
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

export class TaskClickTooltip {
  private readonly logger = createLogger('TaskClickTooltip');
  private containerEl: HTMLElement;
  private tooltipEl: HTMLElement | null = null;
  private props: TaskClickTooltipProps;
  private handleClickOutside: (event: MouseEvent) => void;

  // Stable container references for targeted updates
  private headerActionsEl: HTMLElement | null = null;
  private contentEl: HTMLElement | null = null;
  private infoEl: HTMLElement | null = null;

  private startDate: string | undefined;
  private endDate: string | undefined;
  private isAllDay: boolean;
  private isEditing: boolean;
  private editedText: string;
  private isSaving: boolean;
  private currentStatus: string;
  private isDeleting: boolean;
  private showDeleteConfirm: boolean;
  private selectedDestination: string;
  private datePickerPosition = { top: 0, left: 0 };
  private statusPickerPosition = { top: 0, left: 0 };

  private datePickerInstance: DateTimePickerModal | null = null;
  private statusPickerInstance: StatusPickerDropdown | null = null;

  private cancelBtnEl: HTMLButtonElement | null = null;
  private saveBtnEl: HTMLButtonElement | null = null;

  constructor(containerEl: HTMLElement, props: TaskClickTooltipProps) {
    this.containerEl = containerEl;
    this.props = props;

    const isCreateMode = props.isCreateMode ?? false;
    this.startDate =
      isCreateMode && props.selectedDate
        ? props.selectedDate.toISOString()
        : props.startDate;
    this.endDate = props.endDate;
    this.isAllDay = !!props.isAllDay;
    this.isEditing = isCreateMode;
    this.editedText = isCreateMode ? '' : props.cleanText || '';
    this.isSaving = false;
    this.currentStatus = props.status || ' ';
    this.isDeleting = false;
    this.showDeleteConfirm = false;
    this.selectedDestination =
      props.filePath ||
      (props.availableDestinations ??
        DEFAULT_CALENDAR_SETTINGS.newTaskFilePaths)[0];

    this.handleClickOutside = (event: MouseEvent) => {
      if (this.tooltipEl && !this.tooltipEl.contains(event.target as Node)) {
        if (!this.isEditing) {
          props.onClose();
        }
      }
    };

    document.addEventListener('mousedown', this.handleClickOutside);
    this.render();
  }

  destroy(): void {
    document.removeEventListener('mousedown', this.handleClickOutside);
    this.destroySubPickers();
    this.containerEl.empty();
  }

  private destroySubPickers(): void {
    if (this.datePickerInstance) {
      this.datePickerInstance.destroy();
      this.datePickerInstance = null;
    }
    if (this.statusPickerInstance) {
      this.statusPickerInstance.destroy();
      this.statusPickerInstance = null;
    }
  }

  private get iconSize(): number {
    return Platform.isMobile ? 18 : 16;
  }

  private get isCreateMode(): boolean {
    return this.props.isCreateMode ?? false;
  }

  // --- Initial render (called once) ---

  private render(): void {
    this.containerEl.empty();

    let tooltip: HTMLElement;
    if (Platform.isMobile) {
      const overlay = this.containerEl.createDiv({
        cls: 'mobile-modal-overlay',
      });
      tooltip = overlay.createDiv({ cls: 'task-click-tooltip' });
    } else {
      tooltip = this.containerEl.createDiv({ cls: 'task-click-tooltip' });
      tooltip.style.top = `${this.props.position.top}px`;
      tooltip.style.left = `${this.props.position.left}px`;
    }
    this.tooltipEl = tooltip;

    this.buildHeader(tooltip);

    const contentWrapper = tooltip.createDiv({
      cls: 'task-click-tooltip-content',
    });

    // Inner wrapper for task content (text display / edit form / delete confirm)
    // so it can be refreshed independently without affecting the info section
    this.contentEl = contentWrapper.createDiv({
      cls: 'task-click-tooltip-task-section',
    });
    this.buildTaskContent();

    this.infoEl = contentWrapper.createDiv({
      cls: 'task-click-tooltip-info',
    });
    this.buildInfoSection();
  }

  // --- Targeted refresh methods ---

  private refreshContent(): void {
    if (!this.contentEl) return;
    this.contentEl.empty();
    this.buildTaskContent();
  }

  private refreshHeaderActions(): void {
    if (!this.headerActionsEl) return;
    this.headerActionsEl.empty();
    this.buildHeaderActions(this.headerActionsEl);
  }

  private refreshInfo(): void {
    if (!this.infoEl) return;
    this.infoEl.empty();
    this.buildInfoSection();
  }

  // --- Build methods ---

  private buildHeader(tooltip: HTMLElement): void {
    const fileName =
      this.props.filePath.split('/').pop() || this.props.filePath;
    const header = tooltip.createDiv({ cls: 'task-click-tooltip-header' });

    const fileContainer = header.createDiv({
      cls: 'task-click-tooltip-file-container',
    });

    const headerIcon = fileContainer.createSpan({
      cls: 'task-click-tooltip-icon',
    });
    setIcon(headerIcon, this.isCreateMode ? 'plus' : 'file-text');
    this.setSvgSize(headerIcon);

    fileContainer.createSpan({
      cls: 'task-click-tooltip-file',
      text: this.isCreateMode ? `New Task in ${fileName}` : fileName,
    });

    this.headerActionsEl = header.createDiv({
      cls: 'task-click-tooltip-actions',
    });
    this.buildHeaderActions(this.headerActionsEl);
  }

  private buildHeaderActions(actions: HTMLElement): void {
    if (!this.isCreateMode && !this.showDeleteConfirm) {
      const openBtn = actions.createEl('button', {
        cls: 'task-click-tooltip-open-button',
        attr: { title: 'Open file' },
      });
      if (this.isEditing) openBtn.disabled = true;
      setIcon(openBtn, 'pencil');
      this.setSvgSize(openBtn);
      openBtn.addEventListener('click', () => this.props.onOpenFile());
      openBtn.addEventListener('mouseenter', e => this.handleHover(e));

      if (this.props.onDeleteTask) {
        const deleteBtn = actions.createEl('button', {
          cls: 'task-click-tooltip-delete-button',
          attr: { title: 'Delete task' },
        });
        if (this.isEditing) deleteBtn.disabled = true;
        setIcon(deleteBtn, 'trash-2');
        this.setSvgSize(deleteBtn);
        deleteBtn.addEventListener('click', () => {
          this.showDeleteConfirm = true;
          this.refreshContent();
          this.refreshHeaderActions();
        });
      }
    }

    const closeBtn = actions.createEl('button', {
      cls: 'task-click-tooltip-close-button',
      attr: { title: this.isEditing ? 'Cancel editing' : 'Close' },
    });
    setIcon(closeBtn, 'x');
    this.setSvgSize(closeBtn);
    closeBtn.addEventListener('click', () => {
      if (this.isEditing) {
        this.handleTextCancel();
      } else {
        this.props.onClose();
      }
    });
  }

  private buildTaskContent(): void {
    if (!this.contentEl) return;

    if (this.showDeleteConfirm) {
      this.buildDeleteConfirmation(this.contentEl);
      return;
    }

    if (this.isEditing) {
      this.buildEditForm(this.contentEl);
      return;
    }

    this.buildTextDisplay(this.contentEl);
  }

  private buildDeleteConfirmation(parent: HTMLElement): void {
    const confirm = parent.createDiv({
      cls: 'task-click-tooltip-delete-confirm',
    });

    const message = confirm.createDiv({
      cls: 'task-click-tooltip-delete-message',
    });
    const alertIcon = message.createSpan({
      cls: 'task-click-tooltip-delete-icon',
    });
    setIcon(alertIcon, 'alert-circle');
    this.setSvgSize(alertIcon);
    message.createSpan({ text: 'Are you sure you want to delete this task?' });

    const actions = confirm.createDiv({
      cls: 'task-click-tooltip-delete-actions',
    });
    const cancelBtn = actions.createEl('button', {
      cls: 'task-click-tooltip-cancel-button',
      text: 'Cancel',
    });
    cancelBtn.disabled = this.isDeleting;
    cancelBtn.addEventListener('click', () => {
      this.showDeleteConfirm = false;
      this.refreshContent();
      this.refreshHeaderActions();
    });

    const confirmBtn = actions.createEl('button', {
      cls: 'task-click-tooltip-delete-confirm-button',
      text: this.isDeleting ? 'Deleting...' : 'Delete',
    });
    confirmBtn.disabled = this.isDeleting;
    confirmBtn.addEventListener('click', () => this.handleDeleteConfirm());
  }

  private buildEditForm(parent: HTMLElement): void {
    const editContainer = parent.createDiv({
      cls: 'task-click-tooltip-edit-container',
    });

    const textarea = editContainer.createEl('textarea', {
      cls: 'task-click-tooltip-edit-textarea',
      attr: {
        placeholder: this.isCreateMode
          ? 'Type your new task here...'
          : 'Task text...',
        spellcheck: 'false',
      },
    });
    textarea.value = this.editedText;
    textarea.disabled = this.isSaving;

    textarea.addEventListener('input', () => {
      this.editedText = textarea.value;
    });

    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          this.cancelBtnEl?.focus();
        } else {
          this.saveBtnEl?.focus();
        }
      }
    });

    const editActions = editContainer.createDiv({
      cls: 'task-click-tooltip-edit-actions',
    });

    const cancelBtn = editActions.createEl('button', {
      cls: 'task-click-tooltip-cancel-button',
      attr: {
        title: this.isCreateMode ? 'Cancel task creation' : 'Cancel editing',
      },
    });
    cancelBtn.disabled = this.isSaving;
    cancelBtn.appendText('Cancel');
    const cancelIcon = cancelBtn.createSpan();
    setIcon(cancelIcon, 'x-circle');
    this.setSvgSize(cancelIcon);
    cancelBtn.addEventListener('click', () => this.handleTextCancel());
    this.cancelBtnEl = cancelBtn;

    const saveBtn = editActions.createEl('button', {
      cls: 'task-click-tooltip-save-button',
      attr: {
        title: this.isCreateMode ? 'Create task' : 'Save changes',
      },
    });
    saveBtn.disabled =
      this.isSaving || (this.isCreateMode && !this.editedText.trim());
    this.saveBtnEl = saveBtn;

    if (this.isSaving) {
      saveBtn.textContent = 'Saving...';
    } else {
      saveBtn.appendText(this.isCreateMode ? 'Create' : 'Save');
      const saveIcon = saveBtn.createSpan();
      setIcon(saveIcon, this.isCreateMode ? 'plus' : 'check');
      this.setSvgSize(saveIcon);
    }
    saveBtn.addEventListener('click', () => this.handleTextSave());

    setTimeout(() => textarea.focus(), 0);
  }

  private buildTextDisplay(parent: HTMLElement): void {
    const container = parent.createDiv({
      cls: 'task-click-tooltip-main-text-container',
    });

    const textEl = container.createDiv({
      cls: 'task-click-tooltip-main-text',
      text: this.props.cleanText || this.props.taskText,
    });

    if (this.props.onUpdateText) {
      textEl.style.cursor = 'pointer';
      textEl.title = 'Click to edit task text';
      textEl.addEventListener('click', () => this.handleEditStart());

      const editBtn = container.createEl('button', {
        cls: 'task-click-tooltip-edit-button',
        attr: { title: 'Edit task text' },
      });
      setIcon(editBtn, 'edit');
      this.setSvgSize(editBtn);
      editBtn.addEventListener('click', () => this.handleEditStart());
    }
  }

  private buildInfoSection(): void {
    if (!this.infoEl) return;
    const info = this.infoEl;
    const status = this.props.status;

    // Status row
    if (status || this.isCreateMode) {
      const statusItem = info.createDiv({
        cls: 'task-click-tooltip-info-item',
      });

      const statusIconEl = statusItem.createSpan({
        cls: 'task-click-tooltip-icon-small',
      });
      const statusToUse = this.isCreateMode
        ? this.currentStatus
        : (status ?? ' ');
      setIcon(statusIconEl, getStatusIcon(statusToUse));
      this.setSvgSize(statusIconEl);

      const statusText = statusItem.createSpan({
        cls: 'task-click-tooltip-info-text task-click-tooltip-status-text',
        attr: {
          title: this.isEditing
            ? 'Finish editing task first'
            : 'Click to change status',
        },
      });
      statusText.createSpan({
        cls: 'task-click-tooltip-status-value',
        text: formatStatus(this.isCreateMode ? this.currentStatus : status),
      });
      statusText.addEventListener('click', e => this.handleStatusClick(e));
    }

    // Date row
    this.buildDateDisplay(info);

    // Tags row
    this.buildTagsDisplay(info);

    // File link row (non-create mode)
    if (!this.isCreateMode) {
      const fileItem = info.createDiv({
        cls: 'task-click-tooltip-info-item task-click-tooltip-file-link',
        attr: { title: 'Click to open task' },
      });
      fileItem.addEventListener('click', () => this.props.onOpenFile());
      fileItem.addEventListener('mouseenter', e => this.handleHover(e));

      const fileIcon = fileItem.createSpan({
        cls: 'task-click-tooltip-icon-small',
      });
      setIcon(fileIcon, 'info');
      this.setSvgSize(fileIcon);

      fileItem.createSpan({
        cls: 'task-click-tooltip-info-text',
        text: `${this.props.filePath}${this.props.line ? ` (line ${this.props.line})` : ''}`,
      });
    }

    // Destination selector (create mode)
    if (this.isCreateMode) {
      this.buildDestinationSelector(info);
    }
  }

  private buildDateDisplay(info: HTMLElement): void {
    if (!this.startDate) return;

    const displayEndDate = this.endDate
      ? this.adjustEndDateForDisplay(this.endDate, this.isAllDay)
      : undefined;

    const dateItem = info.createDiv({ cls: 'task-click-tooltip-info-item' });

    const calIcon = dateItem.createSpan({
      cls: 'task-click-tooltip-icon-small',
    });
    setIcon(calIcon, 'calendar');
    this.setSvgSize(calIcon);

    const dateContainer = dateItem.createDiv({
      cls: 'task-click-tooltip-date-container',
      attr: { title: 'Click to edit date' },
    });
    dateContainer.addEventListener('click', e => this.handleDateClick(e));

    const dateText = dateContainer.createSpan({
      cls: 'task-click-tooltip-info-text task-click-tooltip-date-text',
    });

    dateText.appendText(this.formatDateString(this.startDate, this.isAllDay));

    if (displayEndDate) {
      dateText.createSpan({
        cls: 'task-click-tooltip-info-text',
        text: this.isAllDay ? ' to ' : ' → ',
      });
      dateText.appendText(this.formatDateString(displayEndDate, this.isAllDay));
    }
  }

  private buildTagsDisplay(info: HTMLElement): void {
    const tags = this.props.tags;
    if (!tags || tags.length === 0) return;

    const tagItem = info.createDiv({ cls: 'task-click-tooltip-info-item' });
    const tagIcon = tagItem.createSpan({
      cls: 'task-click-tooltip-icon-small',
    });
    setIcon(tagIcon, 'tag');
    this.setSvgSize(tagIcon);

    const tagsContainer = tagItem.createDiv({
      cls: 'task-click-tooltip-tags-container',
    });
    for (const tag of tags) {
      tagsContainer.createSpan({
        cls: 'task-click-tooltip-tag-code',
        text: tag,
      });
    }
  }

  private buildDestinationSelector(info: HTMLElement): void {
    const availableDestinations =
      this.props.availableDestinations ??
      DEFAULT_CALENDAR_SETTINGS.newTaskFilePaths;

    const destItem = info.createDiv({ cls: 'task-click-tooltip-info-item' });
    const infoIcon = destItem.createSpan({
      cls: 'task-click-tooltip-icon-small task-click-tooltip-icon-info',
    });
    setIcon(infoIcon, 'info');
    this.setSvgSize(infoIcon);

    if (availableDestinations.length <= 1) {
      const suffix = this.selectedDestination.endsWith('/')
        ? '(new task note)'
        : '(new task list)';
      destItem.createSpan({
        cls: 'task-click-tooltip-info-text',
        text: `Will be created in ${this.selectedDestination} ${suffix}`,
      });
    } else {
      const selectContainer = destItem.createDiv({
        cls: 'task-click-tooltip-destination-select',
      });
      selectContainer.createDiv({
        cls: 'task-click-tooltip-destination-label',
        text: 'Will be created in',
      });

      const select = selectContainer.createEl('select', {
        cls: 'task-click-tooltip-inline-dropdown',
      });
      select.disabled = this.isSaving;
      select.value = this.selectedDestination;

      for (const destination of availableDestinations) {
        const suffix = destination.endsWith('/')
          ? '(new task note)'
          : '(new task list)';
        select.createEl('option', {
          value: destination,
          text: `${destination} ${suffix}`,
        });
      }
      select.value = this.selectedDestination;

      select.addEventListener('change', () => {
        this.selectedDestination = select.value;
      });
    }
  }

  // --- Event handlers ---

  private handleHover(event: MouseEvent): void {
    if (this.props.onHoverLink && this.props.filePath) {
      this.props.onHoverLink(event, this.props.filePath, this.props.line);
    }
  }

  private handleEditStart(): void {
    this.editedText = this.props.cleanText || '';
    this.isEditing = true;
    this.refreshContent();
    this.refreshHeaderActions();
  }

  private handleTextCancel(): void {
    if (this.isCreateMode) {
      this.props.onClose();
    } else {
      this.editedText = this.props.cleanText || '';
      this.isEditing = false;
      this.refreshContent();
      this.refreshHeaderActions();
    }
  }

  private async handleTextSave(): Promise<void> {
    if (this.isCreateMode && this.props.onCreateTask) {
      this.isSaving = true;
      this.refreshContent();

      const startDateObj = this.startDate ? new Date(this.startDate) : null;
      const endDateObj = this.endDate ? new Date(this.endDate) : null;

      const success = await this.props.onCreateTask(
        this.editedText,
        startDateObj,
        endDateObj,
        this.isAllDay,
        this.currentStatus,
        this.selectedDestination
      );

      this.isSaving = false;
      if (success) {
        this.props.onClose();
      } else {
        this.refreshContent();
      }
    } else if (
      this.props.onUpdateText &&
      this.props.cleanText !== this.editedText
    ) {
      this.isSaving = true;
      this.refreshContent();

      const success = await this.props.onUpdateText(
        this.editedText,
        this.props.cleanText || '',
        this.props.taskText
      );

      this.isSaving = false;
      if (success) {
        this.isEditing = false;
      }
      this.refreshContent();
      this.refreshHeaderActions();
    } else {
      this.isEditing = false;
      this.refreshContent();
      this.refreshHeaderActions();
    }
  }

  private async handleDeleteConfirm(): Promise<void> {
    if (!this.props.onDeleteTask || !this.props.filePath) return;

    this.isDeleting = true;
    this.refreshContent();

    try {
      const success = await this.props.onDeleteTask(
        this.props.filePath,
        this.props.line
      );
      if (success) {
        this.props.onClose();
      } else {
        this.showDeleteConfirm = false;
        this.isDeleting = false;
        this.refreshContent();
        this.refreshHeaderActions();
      }
    } catch (error) {
      this.logger.error(`Failed to delete task: ${error}`);
      this.showDeleteConfirm = false;
      this.isDeleting = false;
      this.refreshContent();
      this.refreshHeaderActions();
    }
  }

  private handleDateClick(e: MouseEvent): void {
    if (!this.props.onUpdateDates && !this.isCreateMode) return;

    if (Platform.isMobile) {
      this.datePickerPosition = { top: 0, left: 0 };
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      this.datePickerPosition = { top: rect.bottom + 5, left: rect.left };
    }

    e.preventDefault();
    e.stopPropagation();
    this.openDatePicker();
  }

  private handleStatusClick(e: MouseEvent): void {
    if (!this.props.onUpdateStatus && !this.isCreateMode) return;

    if (Platform.isMobile) {
      this.statusPickerPosition = { top: 0, left: 0 };
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      this.statusPickerPosition = { top: rect.bottom + 5, left: rect.left };
    }

    e.preventDefault();
    e.stopPropagation();
    this.openStatusPicker();
  }

  private openDatePicker(): void {
    if (this.datePickerInstance) {
      this.datePickerInstance.destroy();
      this.datePickerInstance = null;
    }

    const pickerContainer = document.createElement('div');
    this.tooltipEl?.appendChild(pickerContainer);

    this.datePickerInstance = new DateTimePickerModal(pickerContainer, {
      initialStartDate: this.startDate ? new Date(this.startDate) : new Date(),
      initialEndDate: this.endDate ? new Date(this.endDate) : null,
      isAllDay: this.isAllDay,
      onClose: () => {
        if (this.datePickerInstance) {
          this.datePickerInstance.destroy();
          this.datePickerInstance = null;
        }
      },
      onDone: (
        newStartDate: Date,
        newEndDate: Date | null,
        newAllDay: boolean,
        wasMultiDay: boolean
      ) => {
        const startDateStr = newStartDate.toISOString();
        const endDateStr = newEndDate ? newEndDate.toISOString() : undefined;

        this.startDate = startDateStr;
        this.endDate = endDateStr;
        this.isAllDay = newAllDay;

        if (this.props.onUpdateDates && !this.isCreateMode) {
          const startDateObj = startDateStr ? new Date(startDateStr) : null;
          const endDateObj = endDateStr ? new Date(endDateStr) : null;
          this.props.onUpdateDates(
            startDateObj,
            endDateObj,
            newAllDay,
            wasMultiDay
          );
        }

        if (this.datePickerInstance) {
          this.datePickerInstance.destroy();
          this.datePickerInstance = null;
        }
        this.refreshInfo();
      },
      position: this.datePickerPosition,
    });
  }

  private openStatusPicker(): void {
    if (this.statusPickerInstance) {
      this.statusPickerInstance.destroy();
      this.statusPickerInstance = null;
    }

    const pickerContainer = document.createElement('div');
    this.tooltipEl?.appendChild(pickerContainer);

    this.statusPickerInstance = new StatusPickerDropdown(pickerContainer, {
      currentStatus: this.isCreateMode
        ? this.currentStatus
        : (this.props.status ?? ' '),
      onClose: () => {
        if (this.statusPickerInstance) {
          this.statusPickerInstance.destroy();
          this.statusPickerInstance = null;
        }
      },
      onSave: (newStatus: string) => {
        if (this.props.onUpdateStatus && !this.isCreateMode) {
          this.props.onUpdateStatus(newStatus);
        } else if (this.isCreateMode) {
          this.currentStatus = newStatus;
        }
        if (this.statusPickerInstance) {
          this.statusPickerInstance.destroy();
          this.statusPickerInstance = null;
        }
        this.refreshInfo();
      },
      position: this.statusPickerPosition,
    });
  }

  // --- Helpers ---

  private setSvgSize(el: HTMLElement): void {
    const svg = el.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', String(this.iconSize));
      svg.setAttribute('height', String(this.iconSize));
    }
  }

  private adjustEndDateForDisplay(
    dateStr: string,
    isAllDayFormat: boolean
  ): string {
    if (!dateStr || !isAllDayFormat) return dateStr;
    const date = new Date(dateStr);
    date.setDate(date.getDate() - 1);
    return date.toISOString();
  }

  private formatDateString(dateStr: string, isAllDayFormat = false): string {
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
  }
}
