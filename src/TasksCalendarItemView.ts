import { ItemView, Notice, WorkspaceLeaf, debounce, TFile } from 'obsidian';
import { Calendar, EventApi, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import {
  CalendarSettings,
  DEFAULT_CALENDAR_SETTINGS,
  VIEW_TYPE,
  HOVER_LINK_SOURCE,
  FIRST_DAY,
} from './TasksCalendarSettings';
import TasksCalendarPlugin from './main';
import React from 'react';
import {
  CalendarFooter,
  CalendarFooterCallbacks,
} from './frontend/CalendarFooter';
import { TaskTooltipModal } from './frontend/TaskClickTooltip';
import getTasksAsEvents from './backend/query';
import openTask from './backend/open';
import updateTaskDates, {
  updateTaskStatus,
  updateTaskText,
  updateTaskRecurrence,
  updateTaskProperty,
  UpdateStatusResult,
} from './backend/update';
import { createTask } from './backend/create';
import { deleteTask } from './backend/delete';
import handleError from './backend/error-handling';
import { parseIcsEvents } from './backend/ics';
import { createLogger } from './logging';

export class TasksCalendarItemView extends ItemView {
  private readonly logger = createLogger('ItemView');
  calendar: Calendar | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private activeTooltipModal: TaskTooltipModal | null = null;
  private calendarFooter: CalendarFooter | null = null;
  private settings: CalendarSettings = DEFAULT_CALENDAR_SETTINGS;
  private plugin: TasksCalendarPlugin;
  private footerEl: HTMLElement | null = null;
  private closeDropdown: (event: MouseEvent) => void;

  constructor(leaf: WorkspaceLeaf, plugin: TasksCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Tasks calendar';
  }

  getIcon(): string {
    return 'lucide-calendar-check';
  }

  async onOpen() {
    await super.onOpen();
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('tasks-calendar-container');

    const calendarEl = container.createDiv('calendar-container');

    this.footerEl = container.createDiv('calendar-footer-container');
    this.renderFooter();

    // Delay calendar initialization to ensure container is properly sized
    setTimeout(() => {
      this.settings = this.plugin.configManager.getCalendarSettings();
      this.initializeCalendar(calendarEl);
    }, 100);
  }

  private onKeydown = (event: KeyboardEvent) => {
    if (event.metaKey) {
      // Reserved for future meta key handling
    }
  };

  private onHoverLink = (
    event: React.MouseEvent,
    hoverFilePath: string,
    hoverLine: number
  ) => {
    this.app.workspace.trigger('hover-link', {
      event: event.nativeEvent,
      source: HOVER_LINK_SOURCE,
      targetEl: event.currentTarget as HTMLElement,
      hoverParent: {
        hoverPopover: null,
      },
      linktext: hoverFilePath,
      sourcePath: hoverFilePath,
      state: {
        scroll: hoverLine,
      },
    });
  };

  private initializeCalendar(calendarEl: HTMLElement) {
    const calendar = new Calendar(calendarEl, {
      plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
      initialView: this.settings.viewType,
      headerToolbar: {
        left: 'prev,next todayButton',
        center: 'title',
        right: 'viewMenu',
      },
      views: {
        timeGridThreeDay: {
          type: 'timeGrid',
          duration: { days: 3 },
          buttonText: '3 days',
        },
      },
      nowIndicator: true,
      dateClick: info => {
        const isTimeGridView = info.view.type.includes('timeGrid');
        this.showTaskCreationTooltip(info.date, !isTimeGridView);
      },
      editable: true,
      dayMaxEvents: true,
      events: (_fetchInfo, successCallback, failureCallback) => {
        this.fetchCalendarEvents(successCallback, failureCallback);
      },
      eventOrder: (a: EventApi, b: EventApi) => {
        return a.extendedProps.priority - b.extendedProps.priority > 0 ? -1 : 1;
      },
      firstDay: FIRST_DAY,
      eventTimeFormat: {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      },
      eventDidMount: info => {
        const opacity = info.event.extendedProps.opacity as number | undefined;
        if (opacity !== undefined) {
          info.el.style.opacity = String(opacity);
        }
      },
      eventDrop: info => {
        if (info.event && info.oldEvent)
          void this.handleTaskDateChange(info.event, info.oldEvent);
      },
      eventResize: info => {
        if (info.event && info.oldEvent)
          void this.handleTaskDateChange(info.event, info.oldEvent);
      },
      eventClick: info => {
        this.closeActiveTooltip();

        const filePath = info.event.extendedProps.filePath;
        const line = info.event.extendedProps.line;
        const taskText = info.event.extendedProps.taskText;
        const cleanText =
          info.event.extendedProps.cleanText || info.event.title;
        const startDate = info.event.startStr;
        const endDate = info.event.endStr;
        const tags = info.event.extendedProps.tags;
        const status = info.event.extendedProps.status;
        const isAllDay = info.event.allDay;
        const recurrence = info.event.extendedProps.recurrence;
        const isGhost = info.event.extendedProps.isGhost;

        if (filePath) {
          this.openTaskTooltip({
            taskText: taskText || 'Task details not available',
            cleanText,
            filePath,
            startDate,
            endDate,
            tags,
            status,
            line,
            isAllDay,
            event: info.event,
            recurrence,
            isGhost,
          });
        }
      },
      customButtons: {
        todayButton: {
          text: '📅',
          hint: 'Go to today',
          click: () => {
            if (this.calendar) {
              this.calendar.today();
            }
          },
        },
        viewMenu: {
          text: 'Views',
          click: e => {
            const button = e.currentTarget as HTMLElement;
            let dropdown = button.querySelector<HTMLElement>('.view-dropdown');

            if (!dropdown) {
              dropdown = document.createElement('div');
              dropdown.className = 'view-dropdown';
              button.appendChild(dropdown);

              this.closeDropdown = (event: MouseEvent) => {
                if (!button.contains(event.target as Node)) {
                  dropdown!.classList.remove('show');
                }
              };
              document.addEventListener('click', this.closeDropdown);
            }

            dropdown.empty();
            const currentView =
              this.calendar?.view.type ?? this.settings.viewType;
            const views = [
              { name: 'Month', value: 'dayGridMonth' },
              { name: 'Week', value: 'timeGridWeek' },
              { name: '3 Days', value: 'timeGridThreeDay' },
              { name: 'Day', value: 'timeGridDay' },
              { name: 'List', value: 'listWeek' },
            ];

            views.forEach(view => {
              const option = dropdown.createDiv({
                cls:
                  'view-option' +
                  (view.value === currentView ? ' is-active' : ''),
                text: view.name,
              });
              option.addEventListener('click', () => {
                if (this.calendar) {
                  this.calendar.changeView(view.value);
                  dropdown.classList.remove('show');
                  this.settings.viewType = view.value;
                  void this.plugin.configManager.saveCalendarSettings(
                    this.settings
                  );
                }
              });
            });

            dropdown.classList.toggle('show');
          },
        },
      },
      eventMouseEnter: info => {
        const filePath = info.event.extendedProps.filePath;
        const line = info.event.extendedProps.line;

        if (filePath && line) {
          this.app.workspace.trigger('hover-link', {
            event: info.jsEvent,
            source: HOVER_LINK_SOURCE,
            targetEl: info.el,
            hoverParent: {
              hoverPopover: null,
            },
            linktext: filePath,
            sourcePath: filePath,
            state: {
              scroll: line,
            },
          });
        }
      },
    });

    document.addEventListener('keydown', this.onKeydown);

    this.calendar = calendar;

    this.plugin._onChangeCallback = debounce(
      () => {
        calendar.refetchEvents();
      },
      3000,
      true
    );

    this.calendar.render();

    setTimeout(() => {
      if (this.calendar) {
        this.calendar.updateSize();
      }
    }, 200);

    this.setupResizeObserver(calendarEl);

    const deferUpdateSize = () => {
      setTimeout(() => {
        if (this.calendar) {
          this.calendar.updateSize();
        }
      }, 100);
    };
    this.registerEvent(this.app.workspace.on('resize', deferUpdateSize));
    this.registerEvent(this.app.workspace.on('layout-change', deferUpdateSize));

    this.registerEvent(
      this.app.vault.on('modify', file => {
        if (
          this.settings.externalSources.some(s => s.path === file.path) &&
          this.calendar
        ) {
          this.calendar.refetchEvents();
        }
      })
    );
  }

  private openTaskTooltip(props: {
    taskText: string;
    cleanText: string;
    filePath: string;
    startDate: string;
    endDate: string | undefined;
    tags: string[];
    status: string;
    line?: number;
    isAllDay: boolean;
    event?: EventApi;
    recurrence?: string;
    isGhost?: boolean;
  }) {
    const isGhost = props.isGhost ?? false;

    this.activeTooltipModal = new TaskTooltipModal(this.app, {
      taskText: props.taskText || 'Task details not available',
      cleanText: props.cleanText,
      filePath: props.filePath,
      onOpenFile: () => {
        void openTask(this.app, props.filePath, props.line);
        this.closeActiveTooltip();
      },
      startDate: props.startDate,
      endDate: props.endDate,
      tags: props.tags,
      status: props.status,
      line: props.line,
      isAllDay: props.isAllDay,
      recurrence: props.recurrence,
      onUpdateDates: isGhost
        ? undefined
        : (
            newStartDate: Date | null,
            newEndDate: Date | null,
            isAllDay: boolean,
            wasMultiDay: boolean
          ) => {
            void this.handleTaskDateUpdate(
              props.event || ({} as EventApi),
              newStartDate,
              newEndDate,
              isAllDay,
              wasMultiDay,
              props.filePath,
              props.line
            );
          },
      onUpdateRecurrence: (newPattern: string) => {
        void this.handleTaskRecurrenceUpdate(
          props.event || ({} as EventApi),
          newPattern,
          props.filePath,
          props.line
        );
      },
      onUpdateProperty: isGhost
        ? undefined
        : (propertyName: string, newValue: string) => {
            void this.handleTaskPropertyUpdate(
              propertyName,
              newValue,
              props.filePath,
              props.line
            );
          },
      onUpdateStatus: (newStatus: string) => {
        void this.handleTaskStatusUpdate(newStatus, props.filePath, props.line);
      },
      onUpdateText: (newText: string, originalText: string) => {
        return this.handleTaskTextUpdate(
          newText,
          originalText,
          props.filePath,
          props.line
        );
      },
      onDeleteTask: (filePath: string, line?: number) => {
        return this.handleTaskDeletion(filePath, line);
      },
      onHoverLink: this.onHoverLink,
    });

    this.activeTooltipModal.open();
  }

  private async handleTaskDateUpdate(
    event: EventApi,
    newStartDate: Date | null,
    newEndDate: Date | null,
    isAllDay: boolean,
    wasMultiDay: boolean,
    filePath: string,
    line?: number
  ): Promise<void> {
    if (!filePath || !newStartDate) {
      this.logger.warn('Unable to update task: missing required information');
      new Notice('Unable to update task: missing required information');
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      this.logger.warn(`File not found: ${filePath}`);
      new Notice(`File not found: ${filePath}`);
      return;
    }

    const dateProperty = this.settings.dateProperty;
    const startDateProperty = this.settings.startDateProperty;

    try {
      await updateTaskDates(
        this.app,
        file,
        line,
        newStartDate,
        newEndDate || null,
        isAllDay,
        startDateProperty,
        dateProperty,
        event.allDay,
        wasMultiDay
      );

      new Notice('Task date updated successfully');
      this.calendar?.refetchEvents();
    } catch (error) {
      handleError(error, 'Failed to update task date', this.logger);
    }
  }

  private async handleTaskRecurrenceUpdate(
    _event: EventApi,
    newPattern: string,
    filePath: string,
    line?: number
  ): Promise<void> {
    if (!filePath) {
      this.logger.warn('Unable to update task: missing file information');
      new Notice('Unable to update task: missing file information');
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      this.logger.warn(`File not found: ${filePath}`);
      new Notice(`File not found: ${filePath}`);
      return;
    }

    try {
      await updateTaskRecurrence(this.app, file, line, newPattern);
      new Notice(
        newPattern ? 'Task recurrence updated' : 'Task recurrence removed'
      );
      this.calendar?.refetchEvents();
    } catch (error) {
      handleError(error, 'Failed to update task recurrence', this.logger);
    }
  }

  private async handleTaskPropertyUpdate(
    propertyName: string,
    newValue: string,
    filePath: string,
    line?: number
  ): Promise<void> {
    if (!filePath) {
      this.logger.warn('Unable to update task: missing file information');
      new Notice('Unable to update task: missing file information');
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      this.logger.warn(`File not found: ${filePath}`);
      new Notice(`File not found: ${filePath}`);
      return;
    }

    try {
      await updateTaskProperty(this.app, file, line, propertyName, newValue);
      new Notice(`Task ${propertyName} updated`);
      this.calendar?.refetchEvents();
    } catch (error) {
      handleError(error, `Failed to update task ${propertyName}`, this.logger);
    }
  }

  private async handleTaskStatusUpdate(
    newStatus: string,
    filePath: string,
    line?: number
  ): Promise<void> {
    if (!filePath) {
      this.logger.warn('Unable to update task: missing file information');
      new Notice('Unable to update task: missing file information');
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      this.logger.warn(`File not found: ${filePath}`);
      new Notice(`File not found: ${filePath}`);
      return;
    }

    try {
      const statusResult: UpdateStatusResult = await updateTaskStatus(
        this.app,
        file,
        line,
        newStatus,
        this.settings.dateProperty,
        this.settings.startDateProperty
      );

      if (statusResult.recurringTaskCreated) {
        new Notice('Task completed — next recurrence created');
      } else {
        new Notice('Task status updated successfully');
      }

      this.calendar?.refetchEvents();
    } catch (error) {
      handleError(error, 'Failed to update task status', this.logger);
    }
  }

  private async handleTaskTextUpdate(
    newText: string,
    originalText: string,
    filePath: string,
    line?: number
  ): Promise<boolean> {
    if (!filePath) {
      this.logger.warn('Unable to update task: missing file information');
      new Notice('Unable to update task: missing file information');
      return false;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      this.logger.warn(`File not found: ${filePath}`);
      new Notice(`File not found: ${filePath}`);
      return false;
    }

    try {
      const newFilePath = await updateTaskText(
        this.app,
        file,
        line,
        originalText,
        newText
      );

      if (newFilePath) {
        new Notice('Task text updated successfully');
        this.calendar?.refetchEvents();
        return true;
      }

      return false;
    } catch (error) {
      handleError(error, 'Failed to update task text', this.logger);
      return false;
    }
  }

  private async handleTaskCreation(
    taskText: string,
    startDate: Date | null,
    endDate: Date | null,
    isAllDay: boolean,
    status: string,
    targetPath: string
  ): Promise<boolean> {
    if (!taskText.trim()) {
      new Notice('Task text cannot be empty');
      return false;
    }

    try {
      const success = await createTask(
        this.app,
        targetPath,
        taskText,
        status,
        startDate,
        endDate,
        isAllDay,
        this.settings.startDateProperty,
        this.settings.dateProperty
      );

      if (success) {
        this.calendar?.refetchEvents();
        new Notice('Task created successfully');
        return true;
      }

      return false;
    } catch (error) {
      handleError(error, 'Failed to create task', this.logger);
      return false;
    }
  }

  private async handleTaskDateChange(newEvent: EventApi, oldEvent: EventApi) {
    const filePath = newEvent.extendedProps.filePath;
    const line = newEvent.extendedProps.line;

    if (!filePath) {
      this.logger.warn('Unable to update task: missing file information');
      new Notice('Unable to update task: missing file information');
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      this.logger.warn(`File not found: ${filePath}`);
      new Notice(`File not found: ${filePath}`);
      return;
    }

    const dateProperty = this.settings.dateProperty;
    const startDateProperty = this.settings.startDateProperty;

    const newStart = newEvent.start;
    const newEnd = newEvent.end;
    const isAllDay = newEvent.allDay;
    const wasAllDay = oldEvent.allDay;

    if (!newStart) {
      this.logger.warn('Event without start date cannot be updated');
      new Notice('Event without start date cannot be updated');
      return;
    }

    try {
      await updateTaskDates(
        this.app,
        file,
        line,
        newStart,
        newEnd,
        isAllDay,
        startDateProperty,
        dateProperty,
        wasAllDay
      );

      new Notice('Task date updated successfully');
    } catch (error) {
      handleError(error, 'Failed to update task date', this.logger);
    }
  }

  private async handleTaskDeletion(
    filePath: string,
    line?: number
  ): Promise<boolean> {
    if (!filePath) {
      this.logger.warn('Unable to delete task: missing file information');
      new Notice('Unable to delete task: missing file information');
      return false;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      this.logger.warn(`File not found: ${filePath}`);
      new Notice(`File not found: ${filePath}`);
      return false;
    }

    const dateProperty = this.settings.dateProperty;
    const startDateProperty = this.settings.startDateProperty;

    try {
      const success = await deleteTask(
        this.app,
        file,
        line,
        dateProperty,
        startDateProperty
      );

      if (success) {
        new Notice('Task deleted successfully');

        this.calendar?.refetchEvents();
        return true;
      }

      this.logger.warn('Failed to delete task');
      new Notice('Failed to delete task');
      return false;
    } catch (error) {
      handleError(error, 'Failed to delete task', this.logger);
      return false;
    }
  }

  private closeActiveTooltip() {
    if (this.activeTooltipModal) {
      this.activeTooltipModal.close();
      this.activeTooltipModal = null;
    }
  }

  private fetchCalendarEvents(
    successCallback: (events: EventInput[]) => void,
    failureCallback: (error: Error) => void
  ) {
    void (async () => {
      const dataviewApi = this.plugin.dataviewApi;
      if (!dataviewApi) {
        this.logger.warn('Dataview plugin not available');
        new Notice(
          'Dataview plugin is not available. Tasks calendar may not work correctly.'
        );
        failureCallback(new Error('Dataview plugin is not available'));
        return;
      }
      let taskEvents: EventInput[];
      try {
        taskEvents = getTasksAsEvents(dataviewApi, this.settings);
      } catch (error) {
        this.logger.warn(`Failed to fetch task events: ${error}`);
        failureCallback(
          error instanceof Error ? error : new Error(String(error))
        );
        return;
      }
      const externalEvents = await this.fetchExternalEvents();
      this.logger.log(
        `Fetched ${taskEvents.length} task events, ${externalEvents.length} external events`
      );
      successCallback([...taskEvents, ...externalEvents]);
    })();
  }

  private async fetchExternalEvents(): Promise<EventInput[]> {
    const sources = this.settings.externalSources;
    if (sources.length === 0) return [];

    const results: EventInput[] = [];
    for (const source of sources) {
      const file = this.app.vault.getAbstractFileByPath(source.path);
      if (!(file instanceof TFile)) {
        this.logger.warn(`External source file not found: ${source.path}`);
        continue;
      }
      let content: string;
      try {
        content = await this.app.vault.read(file);
      } catch (error) {
        this.logger.warn(
          `Failed to read external source ${source.path}: ${error}`
        );
        continue;
      }
      const events = parseIcsEvents(content, source);
      results.push(...events);
    }
    return results;
  }

  private setupResizeObserver(calendarEl: HTMLElement) {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (this.calendar) {
        this.calendar.updateSize();
      }
    });

    this.resizeObserver.observe(calendarEl);
    this.resizeObserver.observe(this.containerEl);
  }

  async onClose() {
    await super.onClose();
    this.closeActiveTooltip();

    if (this.calendarFooter) {
      this.calendarFooter.destroy();
      this.calendarFooter = null;
    }

    if (this.calendar) {
      this.calendar.destroy();
      this.calendar = null;
    }

    if (this.closeDropdown) {
      document.removeEventListener('click', this.closeDropdown);
    }

    document.removeEventListener('keydown', this.onKeydown);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  onResize() {
    if (this.calendar) {
      this.calendar.updateSize();
    }
  }

  private renderFooter() {
    if (!this.footerEl) return;

    const callbacks: CalendarFooterCallbacks = {
      app: this.app,
      getCalendarSettings: (calendarId: string) => {
        return this.plugin.configManager.getCalendarSettings(calendarId);
      },
      getCalendarsList: () => {
        return this.plugin.configManager.getCalendarsList();
      },
      activeCalendarId: this.settings.id,
      onCalendarChange: calendarId => {
        void this.plugin.configManager.setActiveCalendarId(calendarId);

        this.settings = this.plugin.configManager.getCalendarSettings();
        if (this.calendar) {
          this.calendar.changeView(this.settings.viewType);
          this.calendar.refetchEvents();
        }

        this.renderFooter();
      },
      onCalendarAdd: () => {
        const newId = `calendar-${Date.now()}`;
        const newCalendarSettings: CalendarSettings = {
          ...DEFAULT_CALENDAR_SETTINGS,
          id: newId,
          name: `New Calendar ${this.plugin.configManager.getCalendarsList().length + 1}`,
        };

        void this.plugin.configManager.addCalendar(newCalendarSettings);
        void this.plugin.configManager.setActiveCalendarId(newId);
        this.settings = newCalendarSettings;

        this.renderFooter();
        if (this.calendar) {
          this.calendar.refetchEvents();
        }
      },
      onCalendarDelete: calendarId => {
        void this.plugin.configManager.deleteCalendar(calendarId);

        this.settings = this.plugin.configManager.getCalendarSettings();

        this.renderFooter();
        if (this.calendar) {
          this.calendar.refetchEvents();
        }
      },
      onSettingsChange: (settings: CalendarSettings) => {
        this.settings = settings;
        void this.plugin.configManager.saveCalendarSettings(settings);

        if (this.calendar) {
          this.calendar.refetchEvents();
        }
      },
      onRefresh: () => {
        this.settings = this.plugin.configManager.getCalendarSettings();
        if (this.calendar) {
          this.calendar.refetchEvents();
        }
      },
    };

    if (this.calendarFooter) {
      this.calendarFooter.render(callbacks);
    } else {
      this.calendarFooter = new CalendarFooter(this.footerEl, callbacks);
    }
  }

  private showTaskCreationTooltip(date: Date, isAllDay: boolean = true) {
    this.closeActiveTooltip();

    const availableDestinations =
      this.settings.newTaskFilePaths &&
      this.settings.newTaskFilePaths.length > 0
        ? this.settings.newTaskFilePaths
        : ['Tasks.md'];

    const defaultPath = availableDestinations[0];

    this.activeTooltipModal = new TaskTooltipModal(this.app, {
      taskText: '',
      cleanText: '',
      filePath: defaultPath,
      onOpenFile: () => {},
      startDate: date.toISOString(),
      endDate: undefined,
      tags: [],
      line: 0,
      isAllDay: isAllDay,
      status: ' ',
      isCreateMode: true,
      selectedDate: date,
      availableDestinations: availableDestinations,
      onCreateTask: (text, startDate, endDate, isAllDay, status, targetPath) =>
        this.handleTaskCreation(
          text,
          startDate,
          endDate,
          isAllDay,
          status,
          targetPath
        ),
      onUpdateDates: () => {},
      onUpdateStatus: () => {},
      onHoverLink: this.onHoverLink,
      onUpdateText: () => Promise.resolve(false),
    });

    this.activeTooltipModal.open();
  }
}
