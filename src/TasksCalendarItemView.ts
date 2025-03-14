import { ItemView, Notice, WorkspaceLeaf, debounce, TFile } from 'obsidian';
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
import updateTaskDates from './utils/update';
import openTask from './utils/open';

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

    this.footerEl = container.createDiv('calendar-footer');
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
      nowIndicator: true, // 現在時刻のインジケーターを表示
      navLinks: true, // 日付をクリック可能にする
      navLinkDayClick: (date, jsEvent) => {
        // 日付をクリックしたら、その日のDay viewに移動
        if (this.calendar) {
          this.calendar.changeView('timeGridDay', date);
        }
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

          // Calculate tooltip position
          const position = this.calculateTooltipPosition(info.el, tooltipEl);

          // Create tooltip renderer
          this.tooltipRenderer = new ReactRenderer(tooltipEl);

          // Render tooltip component
          this.tooltipRenderer.render(
            React.createElement(TaskClickTooltip, {
              taskText: taskText || 'Task details not available',
              cleanText: cleanText,
              filePath: filePath,
              position: position,
              onClose: () => this.closeActiveTooltip(),
              onOpenFile: () => {
                openTask(this.app, filePath, line);
                this.closeActiveTooltip();
              },
              startDate: startDate,
              endDate: endDate,
              tags: tags,
              status: status,
              line: line,
              isAllDay: isAllDay,
              // 日付更新ハンドラーを追加
              onUpdateDates: (newStartDate, newEndDate, isAllDay) => {
                this.handleTaskDateUpdate(
                  info.event,
                  newStartDate,
                  newEndDate,
                  isAllDay,
                  filePath,
                  line
                );
              }
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
    }, 1000, true)

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
    const eventRect = eventEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate container boundaries
    const containerRect = this.containerEl.children[1].getBoundingClientRect();

    // Default position - try to center below the event
    let left = eventRect.left + (eventRect.width / 2);
    let top = eventRect.bottom + 10;

    // Measure tooltip size after adding to DOM but before making visible
    tooltipEl.style.visibility = 'hidden';
    tooltipEl.style.display = 'block';

    setTimeout(() => {
      const tooltipRect = tooltipEl.getBoundingClientRect();

      // Center the tooltip horizontally below the event
      left = eventRect.left + (eventRect.width / 2) - (tooltipRect.width / 2);

      // Make sure the tooltip stays within the container horizontally
      if (left < containerRect.left + 10) {
        left = containerRect.left + 10;
      } else if (left + tooltipRect.width > containerRect.right - 10) {
        left = containerRect.right - tooltipRect.width - 10;
      }

      // If tooltip would go off bottom of container, position it above the event
      if (top + tooltipRect.height > containerRect.bottom - 10) {
        // Check if there's enough space above the event
        if (eventRect.top - tooltipRect.height - 10 >= containerRect.top) {
          top = eventRect.top - tooltipRect.height - 10;
        } else {
          // Not enough space above or below, position at optimal location within container
          top = Math.max(containerRect.top + 10,
                Math.min(containerRect.bottom - tooltipRect.height - 10, top));
        }
      }

      // Ensure we're not going outside the viewport in any case
      left = Math.max(10, Math.min(viewportWidth - tooltipRect.width - 10, left));
      top = Math.max(10, Math.min(viewportHeight - tooltipRect.height - 10, top));

      // Apply final position
      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${top}px`;
      tooltipEl.style.visibility = 'visible';
    }, 0);

    return { left, top };
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
  private async fetchCalendarEvents(fetchInfo: any, successCallback: any, failureCallback: any) {
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

  // Helper method to update task date in the original file
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

    // Get date property names from settings getter
    const dateProperty = this.settings.dateProperty;
    const startDateProperty = this.settings.startDateProperty;

    // Get the new start and end dates from the event
    const newStart = newEvent.start;
    const newEnd = newEvent.end;
    const isAllDay = newEvent.allDay;
    const wasAllDay = oldEvent.allDay;

    if (!newStart)
      return new Notice("Event without start date cannot be updated");

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

    return new Notice("Task date updated successfully");
  }

  // Add new method for updating task dates directly from tooltip
  private async handleTaskDateUpdate(
    event: EventApi,
    newStartDate: Date | null,
    newEndDate: Date | null,
    isAllDay: boolean,
    filePath: string,
    line: number
  ) {
    if (!filePath || !line || !newStartDate) {
      new Notice("Unable to update task: missing required information");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      new Notice(`File not found: ${filePath}`);
      return;
    }

    // Get date property names from settings getter
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
        event.allDay // Previous all-day state
      );

      new Notice("Task date updated successfully");

      if (this.tooltipRenderer && this.activeTooltipEl) {
        // Re-render the tooltip with updated dates
        this.tooltipRenderer.render(
          React.createElement(TaskClickTooltip, {
            taskText: event.extendedProps.taskText || 'Task details not available',
            cleanText: event.extendedProps.cleanText || event.title,
            filePath: filePath,
            position: {
              left: parseInt(this.activeTooltipEl.style.left),
              top: parseInt(this.activeTooltipEl.style.top)
            },
            onClose: () => this.closeActiveTooltip(),
            onOpenFile: () => {
              openTask(this.app, filePath, line);
              this.closeActiveTooltip();
            },
            startDate: newStartDate?.toISOString(),
            endDate: newEndDate?.toISOString(),
            tags: event.extendedProps.tags,
            status: event.extendedProps.status,
            line: line,
            isAllDay: isAllDay,
            onUpdateDates: (updatedStart, updatedEnd, updatedAllDay) => {
              this.handleTaskDateUpdate(
                event,
                updatedStart,
                updatedEnd,
                updatedAllDay,
                filePath,
                line
              );
            }
          })
        );
      }

      // Refresh calendar events
      this.calendar?.refetchEvents();
    } catch (error) {
      console.error("Failed to update task date:", error);
      new Notice("Failed to update task date");
    }
  }
}
