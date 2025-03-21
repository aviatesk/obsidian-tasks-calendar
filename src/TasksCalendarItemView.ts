import { ItemView, Notice, WorkspaceLeaf, debounce, TFile, Platform } from 'obsidian';
import { Calendar, EventApi } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarSettings, DEFAULT_CALENDAR_SETTINGS, VIEW_TYPE, HOVER_LINK_SOURCE, FIRST_DAY } from './TasksCalendarSettings';
import TasksCalendarPlugin from './main';
import { ReactRenderer } from './components/ReactRoot';
import React from 'react';
import { CalendarFooter } from './components/CalendarFooter';
import { TaskClickTooltip } from './components/TaskClickTooltip';
import getTasksAsEvents from './utils/query';
import openTask from './utils/open';
import updateTaskDates, { updateTaskStatus, updateTaskText } from './utils/update';
import { calculateOptimalPosition } from './utils/position';
import { createTask } from './utils/create';
import handleError from './utils/error-handling';

export class TasksCalendarItemView extends ItemView {
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
    return "Tasks Calendar";
  }

  getIcon(): string {
    // カレンダータブのアイコンを設定
    return "lucide-calendar-check";
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("tasks-calendar-container");

    const calendarEl = container.createDiv('calendar-container');

    this.footerEl = container.createDiv('calendar-footer-container');
    this.renderFooter();

    // Delay calendar initialization to ensure container is properly sized
    setTimeout(async () => {
      this.settings = await this.plugin.getCalendarSettings()
      this.initializeCalendar(calendarEl);
    }, 100);
  }

  private onKeydown = (event: KeyboardEvent) => {
    // キーダウンイベントハンドラを復元
    if (event.metaKey) {
      // メタキーが押されたとき、何か特別な処理があればここに追加
    }
  }

  private onHoverLink = (event: React.MouseEvent, hoverFilePath: string, hoverLine: number) => {
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
        scroll: hoverLine
      }
    });
  }

  private initializeCalendar(calendarEl: HTMLElement) {
    const calendar = new Calendar(calendarEl, {
      plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
      initialView: this.settings.viewType,
      headerToolbar: {
        left: 'prev,next todayButton',
        center: 'title',
        right: 'viewMenu'
      },
      views: {
        timeGridThreeDay: {
          type: 'timeGrid',
          duration: { days: 3 },
          buttonText: '3 days'
        }
      },
      nowIndicator: true,
      // navLinks: true,
      // navLinkDayClick: (date, jsEvent) => {
      //   // Instead of changing view, show task creation tooltip
      //   this.showTaskCreationTooltip(date, jsEvent);
      // },
      dateClick: (info) => {
        // Determine if we're in a time grid view where time is important
        const isTimeGridView = info.view.type.includes('timeGrid');
        this.showTaskCreationTooltip(info.date, info.jsEvent, !isTimeGridView);
      },
      editable: true, // Enable dragging and resizing
      dayMaxEvents: true,
      // カスタムイベントフェッチ関数を使用
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
        hour12: false
      },
      // Add event drag and drop handlers
      eventDrop: (info) => {
        if (info.event && info.oldEvent)
          this.handleTaskDateChange(info.event, info.oldEvent);
      },
      // Add event resize handler
      eventResize: (info) => {
        if (info.event && info.oldEvent)
          this.handleTaskDateChange(info.event, info.oldEvent);
      },
      // Modified event click handler to show tooltip instead of opening file directly
      eventClick: (info) => {
        // Close any existing tooltip first
        this.closeActiveTooltip();

        const filePath = info.event.extendedProps.filePath;
        const line = info.event.extendedProps.line;
        const taskText = info.event.extendedProps.taskText;
        const cleanText = info.event.extendedProps.cleanText || info.event.title;
        const startDate = info.event.startStr;
        const endDate = info.event.endStr;
        const tags = info.event.extendedProps.tags;
        const status = info.event.extendedProps.status;
        const isAllDay = info.event.allDay;

        if (filePath) {
          // Create tooltip container element
          const tooltipEl = document.createElement('div');
          tooltipEl.className = 'task-click-tooltip-container';
          document.body.appendChild(tooltipEl);
          this.activeTooltipEl = tooltipEl;

          let tooltipPosition;
          if (Platform.isMobile) {
            tooltipPosition = { top: 0, left: 0 }; // Mobile - center positioning handled by CSS
          } else {
            tooltipPosition = this.calculateTooltipPosition(info.el, tooltipEl); // Desktop - calculate position
          }

          // Create tooltip renderer
          this.tooltipRenderer = new ReactRenderer(tooltipEl);

          // Render tooltip component using the helper method
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
              event: info.event
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
          }
        },
        viewMenu: {
          text: 'Views',
          click: (e) => {
            const button = e.currentTarget as HTMLElement;
            const viewDropdown = button.querySelector('.view-dropdown');

            if (viewDropdown) {
              viewDropdown.classList.toggle('show');
            } else {
              const dropdown = document.createElement('div');
              dropdown.className = 'view-dropdown';

              const views = [
                { name: 'Month', value: 'dayGridMonth' },
                { name: 'Week', value: 'timeGridWeek' },
                { name: '3 Days', value: 'timeGridThreeDay' },
                { name: 'Day', value: 'timeGridDay' },
                { name: 'List', value: 'listWeek' }
              ];

              views.forEach(view => {
                const option = document.createElement('div');
                option.className = 'view-option';
                option.textContent = view.name;
                option.addEventListener('click', async () => {
                  if (this.calendar) {
                    this.calendar.changeView(view.value);
                    dropdown.classList.remove('show');
                    this.settings.viewType = view.value;
                    this.plugin.saveCalendarSettings(this.settings);
                  }
                });
                dropdown.appendChild(option);
              });

              button.appendChild(dropdown);
              dropdown.classList.add('show');

              // Close dropdown when clicking outside
              this.closeDropdown = (event: MouseEvent) => {
                if (!button.contains(event.target as Node)) {
                  dropdown.classList.remove('show');
                }
              }
              document.addEventListener('click', this.closeDropdown);
            }
          }
        }
      },
      // Restore hover-link functionality
      eventMouseEnter: (info) => {
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
              scroll: line
            }
          });
        }
      },
    });

    // register keydown event listener
    document.addEventListener('keydown', this.onKeydown);

    this.calendar = calendar;

    this.plugin._onChangeCallback = debounce(() =>{
      calendar.refetchEvents();
    }, 3000, true)

    this.calendar.render();

    // Force size recalculation after render
    setTimeout(() => {
      if (this.calendar) {
        this.calendar.updateSize();
      }
    }, 200);

    // Setup resize observer to handle container size changes
    this.setupResizeObserver(calendarEl);

    // Add listener for workspace layout changes
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

  // Calculate the best position for the tooltip
  private calculateTooltipPosition(eventEl: HTMLElement, tooltipEl: HTMLElement) {
    return calculateOptimalPosition(eventEl, tooltipEl, 10);
  }

  // Helper method to create tooltip React element with consistent props
  private createTaskTooltipElement(props: {
    taskText: string;
    cleanText: string;
    filePath: string;
    position: { top: number; left: number };
    startDate: string;
    endDate: string | undefined;
    tags: string[];
    status: string;
    line: number;
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
          props.event || {} as EventApi,
          newStartDate,
          newEndDate,
          isAllDay,
          wasMultiDay,
          props.filePath,
          props.line
        );
      },
      onUpdateStatus: (newStatus) => {
        this.handleTaskStatusUpdate(
          props.event || {} as EventApi,
          newStatus,
          props.filePath,
          props.line
        );
      },
      onUpdateText: (newText, originalText, taskText) => {
        return this.handleTaskTextUpdate(
          props.event || {} as EventApi,
          newText,
          originalText,
          taskText,
          props.filePath,
          props.line
        );
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
    line: number,
  ): Promise<void> {
    if (!filePath || !line || !newStartDate) {
      new Notice("Unable to update task: missing required information");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      new Notice(`File not found: ${filePath}`);
      return;
    }

    // Get date property names from settings
    const dateProperty = this.settings.dateProperty;
    const startDateProperty = this.settings.startDateProperty;

    try {
      // Update task dates using the helper function
      await updateTaskDates(
        this.app.vault,
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

      new Notice("Task date updated successfully");

      // Re-render tooltip if active
      if (this.tooltipRenderer && this.activeTooltipEl) {
        // Re-render the tooltip with updated dates using the helper method
        this.tooltipRenderer.render(
          this.createTaskTooltipElement({
            taskText: event.extendedProps.taskText || 'Task details not available',
            cleanText: event.extendedProps.cleanText || event.title,
            filePath: filePath,
            position: {
              left: parseInt(this.activeTooltipEl.style.left),
              top: parseInt(this.activeTooltipEl.style.top)
            },
            startDate: newStartDate?.toISOString(),
            endDate: newEndDate?.toISOString(),
            tags: event.extendedProps.tags,
            status: event.extendedProps.status,
            line: line,
            isAllDay: isAllDay,
            event: event
          })
        );
      }

      // Refresh calendar events
      this.calendar?.refetchEvents();
    } catch (error) {
      handleError(error, "Failed to update task date");
    }
  }

  /**
   * Centralized method to handle task status updates
   */
  private async handleTaskStatusUpdate(
    event: EventApi,
    newStatus: string,
    filePath: string,
    line: number
  ): Promise<void> {
    if (!filePath || line === undefined) {
      new Notice("Unable to update task: missing file information");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      new Notice(`File not found: ${filePath}`);
      return;
    }

    try {
      // Update task status using the utility function
      await updateTaskStatus(
        this.app.vault,
        file,
        line,
        newStatus
      );

      new Notice("Task status updated successfully");

      // Re-render tooltip if active
      if (this.tooltipRenderer && this.activeTooltipEl) {
        // Re-render the tooltip with updated status
        this.tooltipRenderer.render(
          this.createTaskTooltipElement({
            taskText: event.extendedProps.taskText || 'Task details not available',
            cleanText: event.extendedProps.cleanText || event.title,
            filePath: filePath,
            position: {
              left: parseInt(this.activeTooltipEl.style.left),
              top: parseInt(this.activeTooltipEl.style.top)
            },
            startDate: event.startStr,
            endDate: event.endStr,
            tags: event.extendedProps.tags,
            status: newStatus, // Use new status
            line: line,
            isAllDay: event.allDay,
            event: event
          })
        );
      }

      // Refresh calendar events to reflect the status change
      this.calendar?.refetchEvents();
    } catch (error) {
      handleError(error, "Failed to update task status");
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
    line: number
  ): Promise<boolean> {
    if (!filePath || line === undefined) {
      new Notice("Unable to update task: missing file information");
      return false;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      new Notice(`File not found: ${filePath}`);
      return false;
    }

    try {
      // Update task text using the utility function
      const success = await updateTaskText(
        this.app.vault,
        file,
        line,
        originalText,
        newText,
      );

      if (success) {
        new Notice("Task text updated successfully");

        // Update tooltip if active
        if (this.tooltipRenderer && this.activeTooltipEl) {
          // Re-render the tooltip with updated text
          const updatedEvent = {...event};

          // Update title for display
          updatedEvent.title = newText;

          // Update extendedProps
          updatedEvent.extendedProps = {
            ...updatedEvent.extendedProps,
            cleanText: newText
          };

          this.tooltipRenderer.render(
            this.createTaskTooltipElement({
              taskText: taskText.replace(originalText, newText),
              cleanText: newText,
              filePath: filePath,
              position: {
                left: parseInt(this.activeTooltipEl.style.left),
                top: parseInt(this.activeTooltipEl.style.top)
              },
              startDate: event.startStr,
              endDate: event.endStr,
              tags: event.extendedProps.tags,
              status: event.extendedProps.status,
              line: line,
              isAllDay: event.allDay,
              event: updatedEvent
            })
          );
        }

        // Refresh calendar events to reflect the text change
        this.calendar?.refetchEvents();

        return true;
      }

      return false;
    } catch (error) {
      handleError(error, "Failed to update task text");
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
    status: string
  ): Promise<boolean> {
    if (!taskText.trim()) {
      new Notice("Task text cannot be empty");
      return false;
    }

    // Get the target file path from settings
    const targetFilePath = this.settings.newTaskFilePath || 'Tasks.md';

    try {
      // Create the task using the utility function
      const success = await createTask(
        this.app.vault,
        targetFilePath,
        taskText,
        status,
        startDate,
        endDate,
        isAllDay,
        this.settings.startDateProperty,
        this.settings.dateProperty
      );

      if (success) {
        // Refresh calendar events
        this.calendar?.refetchEvents();
        new Notice("Task created successfully");
        return true;
      }

      return false;
    } catch (error) {
      handleError(error, "Failed to create task");
      return false;
    }
  }

  /**
   * Centralized method to handle task date changes (from drag & drop)
   */
  private async handleTaskDateChange(newEvent: EventApi, oldEvent: EventApi) {
    // Get file information from event properties
    const filePath = newEvent.extendedProps.filePath;
    const line = newEvent.extendedProps.line;

    if (!(filePath && line)) {
      new Notice("Unable to update task: missing file information");
      return;
    }

    // Get the file from the vault
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      new Notice(`File not found: ${filePath}`);
      return;
    }

    // Get date property names from settings
    const dateProperty = this.settings.dateProperty;
    const startDateProperty = this.settings.startDateProperty;

    // Get the new start and end dates from the event
    const newStart = newEvent.start;
    const newEnd = newEvent.end;
    const isAllDay = newEvent.allDay;
    const wasAllDay = oldEvent.allDay;

    if (!newStart) {
      new Notice("Event without start date cannot be updated");
      return;
    }

    try {
      // Update task dates using the helper function
      await updateTaskDates(
        this.app.vault,
        file,
        line,
        newStart,
        newEnd,
        isAllDay,
        startDateProperty,
        dateProperty,
        wasAllDay
      );

      new Notice("Task date updated successfully");
    } catch (error) {
      handleError(error, "Failed to update task date");
    }
  }

  // Close current active tooltip if exists
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

  // カレンダーイベントをフェッチするカスタム関数
  private async fetchCalendarEvents(_: any, successCallback: any, failureCallback: any) {
    const dataviewApi = this.plugin.dataviewApi;
    if (!dataviewApi) {
      new Notice("Dataview plugin is not available, Tasks Calendar may not work correctly.");
      return failureCallback(new Error("Dataview plugin is not available"));
    }
    try {
      // Use the settings getter instead of accessing currentSettings directly
      const events = getTasksAsEvents(dataviewApi, this.settings);
      successCallback(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      failureCallback(error);
    }
  }

  private setupResizeObserver(calendarEl: HTMLElement) {
    // Clean up any existing observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // Create new resize observer
    this.resizeObserver = new ResizeObserver(() => {
      if (this.calendar) {
        this.calendar.updateSize();
      }
    });

    // Observe both the container and its parent
    this.resizeObserver.observe(calendarEl);
    this.resizeObserver.observe(this.containerEl);
  }

  async onClose() {
    // Clean up tooltip
    this.closeActiveTooltip();

    // Clean up React renderers
    if (this.taskPreviewRenderer) {
      this.taskPreviewRenderer.unmount();
      this.taskPreviewRenderer = null;
    }

    if (this.footerRenderer) {
      this.footerRenderer.unmount();
      this.footerRenderer = null;
    }

    // Clean up calendar
    if (this.calendar) {
      this.calendar.destroy();
      this.calendar = null;
    }

    if (this.closeDropdown) {
      document.removeEventListener('click', this.closeDropdown);
    }

    // キーダウンリスナーの削除をコメントアウトしない
    document.removeEventListener('keydown', this.onKeydown);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  // Called when this view is activated (made visible)
  onResize() {
    if (this.calendar) {
      this.calendar.updateSize();
    }
  }

  // フッターUIの作成
  private renderFooter() {
    if (!this.footerEl) return;

    // Initialize React renderer if needed
    if (!this.footerRenderer) {
      this.footerRenderer = new ReactRenderer(this.footerEl);
    }

    // Render React component
    this.footerRenderer.render(
      React.createElement(CalendarFooter, {
        getCalendarSettings: async (calendarId: string) => {
          return await this.plugin.getCalendarSettings({ id: calendarId });
        },
        getCalendarsList: () => {
          return this.plugin.getCalendarsList();
        },
        activeCalendarId: this.settings.id,
        onCalendarChange: async (calendarId) => {
          await this.plugin.setActiveCalendarId(calendarId);

          this.settings = await this.plugin.getCalendarSettings();
          if (this.calendar) {
            this.calendar.changeView(this.settings.viewType);
            this.calendar.refetchEvents();
          }

          // UIを強制的に再レンダリング
          this.renderFooter();
        },
        onCalendarAdd: async () => {
          const newId = `calendar-${Date.now()}`;
          const newCalendarSettings: CalendarSettings = {
            ...DEFAULT_CALENDAR_SETTINGS,
            id: newId,
            name: `New Calendar ${this.plugin.getCalendarsList().length + 1}`,
          };

          await this.plugin.addCalendar(newCalendarSettings);
          await this.plugin.setActiveCalendarId(newId);
          this.settings = newCalendarSettings;

          this.renderFooter();
          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        },
        onCalendarDelete: async (calendarId) => {
          await this.plugin.deleteCalendar(calendarId);

          this.settings = await this.plugin.getCalendarSettings();

          this.renderFooter();
          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        },
        onSettingsChange: async (settings: CalendarSettings) => {
          this.settings = settings;
          await this.plugin.saveCalendarSettings(settings);

          // Refresh events but don't re-render the footer
          // Let React handle the UI update internally
          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        },
        onRefresh: async () => {
          this.settings = await this.plugin.getCalendarSettings({ reload: true });
          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        }
      })
    );
  }

  // Add new method for handling date clicks and showing task creation tooltip
  private showTaskCreationTooltip(date: Date, jsEvent: MouseEvent, isAllDay: boolean = true) {
    // Close any existing tooltip first
    this.closeActiveTooltip();

    // Get the target file path from settings
    const targetFilePath = this.settings.newTaskFilePath || 'Tasks.md';

    // Create tooltip container element
    const tooltipEl = document.createElement('div');
    tooltipEl.className = 'task-click-tooltip-container';
    document.body.appendChild(tooltipEl);
    this.activeTooltipEl = tooltipEl;

    let tooltipPosition;
    if (Platform.isMobile) {
      tooltipPosition = { top: 0, left: 0 }; // Mobile - center positioning handled by CSS
    } else {
      // For desktop, position near the click
      const clickX = jsEvent.clientX;
      const clickY = jsEvent.clientY;
      tooltipPosition = {
        top: clickY + 10,
        left: clickX + 10
      };

      // Adjust position to ensure it's fully visible
      const targetEl = jsEvent.target as HTMLElement;
      if (targetEl) {
        tooltipPosition = calculateOptimalPosition(targetEl, tooltipEl, 10);
      }
    }

    // Create tooltip renderer
    this.tooltipRenderer = new ReactRenderer(tooltipEl);

    // Render task creation tooltip with state variables for status and dates
    this.tooltipRenderer.render(
      React.createElement(TaskClickTooltip, {
        taskText: "",
        cleanText: "",
        filePath: targetFilePath,
        position: tooltipPosition,
        onClose: () => this.closeActiveTooltip(),
        onOpenFile: () => {}, // No-op for creation mode
        startDate: date.toISOString(),
        endDate: undefined, // Add endDate property
        tags: [], // Add empty tags array
        line: 0, // Add a default line value
        isAllDay: isAllDay, // Use the passed isAllDay parameter
        status: " ", // Default empty status
        isCreateMode: true,
        selectedDate: date,
        onCreateTask: (text, startDate, endDate, isAllDay, status) =>
          this.handleTaskCreation(text, startDate, endDate, isAllDay, status),
        // Add functional callbacks that actually update the internal state of TaskClickTooltip
        onUpdateDates: (..._) => {
          // These state changes will be managed by the TaskClickTooltip component itself
          // No need to make backend updates until actual creation
          return Promise.resolve(true);
        },
        onUpdateStatus: (_) => {
          // Status changes will be preserved by the component's internal state
          // and passed to onCreateTask when submitted
          return Promise.resolve();
        },
        onHoverLink: this.onHoverLink,
        onUpdateText: () => Promise.resolve(false),
      })
    );
  }
}
