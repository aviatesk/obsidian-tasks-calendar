import {
  ItemView,
  Notice,
  WorkspaceLeaf,
  debounce,
  TFile,
  Platform,
} from 'obsidian';
import { Calendar, EventApi } from '@fullcalendar/core';
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
import { ReactRenderer } from './frontend/ReactRoot';
import React from 'react';
import { CalendarFooter } from './frontend/CalendarFooter';
import { TaskClickTooltip } from './frontend/TaskClickTooltip';
import getTasksAsEvents from './backend/query';
import openTask from './backend/open';
import updateTaskDates, {
  updateTaskStatus,
  updateTaskText,
} from './backend/update';
import { calculateOptimalPosition } from './backend/position';
import { createTask } from './backend/create';
import { deleteTask } from './backend/delete';
import handleError from './backend/error-handling';
import { createLogger } from './logging';

export class TasksCalendarItemView extends ItemView {
  private readonly logger = createLogger('ItemView');
  calendar: Calendar | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private taskPreviewRenderer: ReactRenderer | null = null;
  private tooltipRenderer: ReactRenderer | null = null;
  private footerRenderer: ReactRenderer | null = null;
  private settings: CalendarSettings = DEFAULT_CALENDAR_SETTINGS;
  private plugin: TasksCalendarPlugin;
  private footerEl: HTMLElement | null = null;
  private closeDropdown: (event: MouseEvent) => void;
  private activeTooltipEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TasksCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Tasks Calendar';
  }

  getIcon(): string {
    return 'lucide-calendar-check';
  }

  async onOpen() {
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
      // navLinks: true,
      // navLinkDayClick: (date, jsEvent) => {
      //   // Instead of changing view, show task creation tooltip
      //   this.showTaskCreationTooltip(date, jsEvent);
      // },
      dateClick: info => {
        // Determine if we're in a time grid view where time is important
        const isTimeGridView = info.view.type.includes('timeGrid');
        this.showTaskCreationTooltip(info.date, info.jsEvent, !isTimeGridView);
      },
      editable: true,
      dayMaxEvents: true,
      events: (fetchInfo, successCallback, failureCallback) => {
        this.fetchCalendarEvents(fetchInfo, successCallback, failureCallback);
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
      eventDrop: info => {
        if (info.event && info.oldEvent)
          this.handleTaskDateChange(info.event, info.oldEvent);
      },
      eventResize: info => {
        if (info.event && info.oldEvent)
          this.handleTaskDateChange(info.event, info.oldEvent);
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

        if (filePath) {
          const tooltipEl = document.createElement('div');
          tooltipEl.className = 'task-click-tooltip-container';
          document.body.appendChild(tooltipEl);
          this.activeTooltipEl = tooltipEl;

          let tooltipPosition;
          if (Platform.isMobile) {
            tooltipPosition = { top: 0, left: 0 };
          } else {
            tooltipPosition = this.calculateTooltipPosition(info.el, tooltipEl);
          }

          this.tooltipRenderer = new ReactRenderer(tooltipEl);

          this.tooltipRenderer.render(
            this.createTaskTooltipElement({
              taskText: taskText || 'Task details not available',
              cleanText: cleanText,
              filePath: filePath,
              position: tooltipPosition,
              startDate: startDate,
              endDate: endDate,
              tags: tags,
              status: status,
              line: line,
              isAllDay: isAllDay,
              event: info.event,
            })
          );
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

            // Rebuild options each time to reflect the current active view.
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
              const option = dropdown!.createDiv({
                cls:
                  'view-option' +
                  (view.value === currentView ? ' is-active' : ''),
                text: view.name,
              });
              option.addEventListener('click', () => {
                if (this.calendar) {
                  this.calendar.changeView(view.value);
                  dropdown!.classList.remove('show');
                  this.settings.viewType = view.value;
                  this.plugin.configManager.saveCalendarSettings(this.settings);
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

    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        setTimeout(() => {
          if (this.calendar) {
            this.calendar.updateSize();
          }
        }, 100);
      })
    );
  }

  private calculateTooltipPosition(
    eventEl: HTMLElement,
    tooltipEl: HTMLElement
  ) {
    return calculateOptimalPosition(eventEl, tooltipEl, 10);
  }

  private createTaskTooltipElement(props: {
    taskText: string;
    cleanText: string;
    filePath: string;
    position: { top: number; left: number };
    startDate: string;
    endDate: string | undefined;
    tags: string[];
    status: string;
    line?: number;
    isAllDay: boolean;
    event?: EventApi;
  }) {
    return React.createElement(TaskClickTooltip, {
      taskText: props.taskText || 'Task details not available',
      cleanText: props.cleanText,
      filePath: props.filePath,
      position: props.position,
      onClose: () => this.closeActiveTooltip(),
      onOpenFile: () => {
        openTask(this.app, props.filePath, props.line);
        this.closeActiveTooltip();
      },
      startDate: props.startDate,
      endDate: props.endDate,
      tags: props.tags,
      status: props.status,
      line: props.line,
      isAllDay: props.isAllDay,
      onUpdateDates: (newStartDate, newEndDate, isAllDay, wasMultiDay) => {
        this.handleTaskDateUpdate(
          props.event || ({} as EventApi),
          newStartDate,
          newEndDate,
          isAllDay,
          wasMultiDay,
          props.filePath,
          props.line
        );
      },
      onUpdateStatus: newStatus => {
        this.handleTaskStatusUpdate(
          props.event || ({} as EventApi),
          newStatus,
          props.filePath,
          props.line
        );
      },
      onUpdateText: (newText, originalText, taskText) => {
        return this.handleTaskTextUpdate(
          props.event || ({} as EventApi),
          newText,
          originalText,
          taskText,
          props.filePath,
          props.line
        );
      },
      onDeleteTask: (filePath, line) => {
        return this.handleTaskDeletion(filePath, line);
      },
      onHoverLink: this.onHoverLink,
    });
  }

  /**
   * Centralized method to handle task date updates
   */
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
      new Notice('Unable to update task: missing required information');
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
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

      if (this.tooltipRenderer && this.activeTooltipEl) {
        this.tooltipRenderer.render(
          this.createTaskTooltipElement({
            taskText:
              event.extendedProps.taskText || 'Task details not available',
            cleanText: event.extendedProps.cleanText || event.title,
            filePath: filePath,
            position: {
              left: parseInt(this.activeTooltipEl.style.left),
              top: parseInt(this.activeTooltipEl.style.top),
            },
            startDate: newStartDate?.toISOString(),
            endDate: newEndDate?.toISOString(),
            tags: event.extendedProps.tags,
            status: event.extendedProps.status,
            line: line,
            isAllDay: isAllDay,
            event: event,
          })
        );
      }

      this.calendar?.refetchEvents();
    } catch (error) {
      handleError(error, 'Failed to update task date', this.logger);
    }
  }

  /**
   * Centralized method to handle task status updates
   */
  private async handleTaskStatusUpdate(
    event: EventApi,
    newStatus: string,
    filePath: string,
    line?: number
  ): Promise<void> {
    if (!filePath) {
      new Notice('Unable to update task: missing file information');
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      new Notice(`File not found: ${filePath}`);
      return;
    }

    try {
      await updateTaskStatus(this.app, file, line, newStatus);

      new Notice('Task status updated successfully');

      if (this.tooltipRenderer && this.activeTooltipEl) {
        this.tooltipRenderer.render(
          this.createTaskTooltipElement({
            taskText:
              event.extendedProps.taskText || 'Task details not available',
            cleanText: event.extendedProps.cleanText || event.title,
            filePath: filePath,
            position: {
              left: parseInt(this.activeTooltipEl.style.left),
              top: parseInt(this.activeTooltipEl.style.top),
            },
            startDate: event.startStr,
            endDate: event.endStr,
            tags: event.extendedProps.tags,
            status: newStatus,
            line: line,
            isAllDay: event.allDay,
            event: event,
          })
        );
      }

      this.calendar?.refetchEvents();
    } catch (error) {
      handleError(error, 'Failed to update task status', this.logger);
    }
  }

  /**
   * Centralized method to handle task text updates
   */
  private async handleTaskTextUpdate(
    event: EventApi,
    newText: string,
    originalText: string,
    taskText: string,
    filePath: string,
    line?: number
  ): Promise<boolean> {
    if (!filePath) {
      new Notice('Unable to update task: missing file information');
      return false;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
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

        if (this.tooltipRenderer && this.activeTooltipEl) {
          const updatedEvent = { ...event };
          updatedEvent.title = newText;
          updatedEvent.extendedProps = {
            ...updatedEvent.extendedProps,
            cleanText: newText,
          };

          this.tooltipRenderer.render(
            this.createTaskTooltipElement({
              taskText: taskText.replace(originalText, newText),
              cleanText: newText,
              filePath: newFilePath,
              position: {
                left: parseInt(this.activeTooltipEl.style.left),
                top: parseInt(this.activeTooltipEl.style.top),
              },
              startDate: event.startStr,
              endDate: event.endStr,
              tags: event.extendedProps.tags,
              status: event.extendedProps.status,
              line: line,
              isAllDay: event.allDay,
              event: updatedEvent,
            })
          );
        }

        this.calendar?.refetchEvents();

        return true;
      }

      return false;
    } catch (error) {
      handleError(error, 'Failed to update task text', this.logger);
      return false;
    }
  }

  /**
   * Centralized method to handle task creation
   */
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

  /**
   * Centralized method to handle task date changes (from drag & drop)
   */
  private async handleTaskDateChange(newEvent: EventApi, oldEvent: EventApi) {
    const filePath = newEvent.extendedProps.filePath;
    const line = newEvent.extendedProps.line;

    if (!filePath) {
      new Notice('Unable to update task: missing file information');
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
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

  /**
   * Centralized method to handle task deletion
   */
  private async handleTaskDeletion(
    filePath: string,
    line?: number
  ): Promise<boolean> {
    if (!filePath) {
      new Notice('Unable to delete task: missing file information');
      return false;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
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

      new Notice('Failed to delete task');
      return false;
    } catch (error) {
      handleError(error, 'Failed to delete task', this.logger);
      return false;
    }
  }

  private closeActiveTooltip() {
    if (this.tooltipRenderer) {
      this.tooltipRenderer.unmount();
      this.tooltipRenderer = null;
    }

    if (this.activeTooltipEl) {
      this.activeTooltipEl.remove();
      this.activeTooltipEl = null;
    }
  }

  private async fetchCalendarEvents(
    _: any,
    successCallback: any,
    failureCallback: any
  ) {
    const dataviewApi = this.plugin.dataviewApi;
    if (!dataviewApi) {
      this.logger.warn('Dataview plugin not available');
      new Notice(
        'Dataview plugin is not available, Tasks Calendar may not work correctly.'
      );
      return failureCallback(new Error('Dataview plugin is not available'));
    }
    try {
      const events = getTasksAsEvents(dataviewApi, this.settings);
      this.logger.log(`Fetched ${events.length} events`);
      successCallback(events);
    } catch (error) {
      this.logger.error(`Failed to fetch events: ${error}`);
      failureCallback(error);
    }
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
    this.closeActiveTooltip();

    if (this.taskPreviewRenderer) {
      this.taskPreviewRenderer.unmount();
      this.taskPreviewRenderer = null;
    }

    if (this.footerRenderer) {
      this.footerRenderer.unmount();
      this.footerRenderer = null;
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

    if (!this.footerRenderer) {
      this.footerRenderer = new ReactRenderer(this.footerEl);
    }

    this.footerRenderer.render(
      React.createElement(CalendarFooter, {
        app: this.app,
        getCalendarSettings: (calendarId: string) => {
          return this.plugin.configManager.getCalendarSettings(calendarId);
        },
        getCalendarsList: () => {
          return this.plugin.configManager.getCalendarsList();
        },
        activeCalendarId: this.settings.id,
        onCalendarChange: async calendarId => {
          await this.plugin.configManager.setActiveCalendarId(calendarId);

          this.settings = this.plugin.configManager.getCalendarSettings();
          if (this.calendar) {
            this.calendar.changeView(this.settings.viewType);
            this.calendar.refetchEvents();
          }

          this.renderFooter();
        },
        onCalendarAdd: async () => {
          const newId = `calendar-${Date.now()}`;
          const newCalendarSettings: CalendarSettings = {
            ...DEFAULT_CALENDAR_SETTINGS,
            id: newId,
            name: `New Calendar ${this.plugin.configManager.getCalendarsList().length + 1}`,
          };

          await this.plugin.configManager.addCalendar(newCalendarSettings);
          await this.plugin.configManager.setActiveCalendarId(newId);
          this.settings = newCalendarSettings;

          this.renderFooter();
          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        },
        onCalendarDelete: async calendarId => {
          await this.plugin.configManager.deleteCalendar(calendarId);

          this.settings = this.plugin.configManager.getCalendarSettings();

          this.renderFooter();
          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        },
        onSettingsChange: async (settings: CalendarSettings) => {
          this.settings = settings;
          await this.plugin.configManager.saveCalendarSettings(settings);

          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        },
        onRefresh: async () => {
          this.settings = this.plugin.configManager.getCalendarSettings();
          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        },
      })
    );
  }

  private showTaskCreationTooltip(
    date: Date,
    jsEvent: MouseEvent,
    isAllDay: boolean = true
  ) {
    this.closeActiveTooltip();

    const availableDestinations =
      this.settings.newTaskFilePaths &&
      this.settings.newTaskFilePaths.length > 0
        ? this.settings.newTaskFilePaths
        : ['Tasks.md'];

    const defaultPath = availableDestinations[0];

    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'task-click-tooltip-container';
    document.body.appendChild(tooltipEl);
    this.activeTooltipEl = tooltipEl;

    let tooltipPosition;
    if (Platform.isMobile) {
      tooltipPosition = { top: 0, left: 0 };
    } else {
      const clickX = jsEvent.clientX;
      const clickY = jsEvent.clientY;
      tooltipPosition = {
        top: clickY + 10,
        left: clickX + 10,
      };

      const targetEl = jsEvent.target as HTMLElement;
      if (targetEl) {
        tooltipPosition = calculateOptimalPosition(targetEl, tooltipEl, 10);
      }
    }

    this.tooltipRenderer = new ReactRenderer(tooltipEl);

    this.tooltipRenderer.render(
      React.createElement(TaskClickTooltip, {
        taskText: '',
        cleanText: '',
        filePath: defaultPath,
        position: tooltipPosition,
        onClose: () => this.closeActiveTooltip(),
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
        onCreateTask: (
          text,
          startDate,
          endDate,
          isAllDay,
          status,
          targetPath
        ) =>
          this.handleTaskCreation(
            text,
            startDate,
            endDate,
            isAllDay,
            status,
            targetPath
          ),
        onUpdateDates: (..._) => {
          return Promise.resolve(true);
        },
        onUpdateStatus: _ => {
          return Promise.resolve();
        },
        onHoverLink: this.onHoverLink,
        onUpdateText: () => Promise.resolve(false),
      })
    );
  }
}
