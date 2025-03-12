import { ItemView, MarkdownView, Notice, WorkspaceLeaf, debounce } from 'obsidian';
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarSettings, VIEW_TYPE, DEFAULT_CALENDAR_SETTINGS, HOVER_LINK_SOURCE } from './TasksCalendarSettings';
import TasksCalendarPlugin from './main';
import { ReactRenderer } from './components/ReactRoot';
import React from 'react';
import { CalendarFooter } from './components/CalendarFooter';
import getTasksAsEvents from './query';

export class TasksCalendarItemView extends ItemView {
  calendar: Calendar | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private taskPreviewRenderer: ReactRenderer | null = null;
  private footerRenderer: ReactRenderer | null = null;
  private currentSettings: CalendarSettings;
  private plugin: TasksCalendarPlugin;
  private footerEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TasksCalendarPlugin) {
    super(leaf);
    this.plugin = plugin;

    // 現在のアクティブカレンダー設定を取得
    const activeId = this.plugin.settings.activeCalendar || 'default';
    this.currentSettings = this.plugin.getCalendarSettings(activeId);
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

    // フッター領域を追加
    this.footerEl = container.createDiv('calendar-footer');
    this.renderFooter();

    // Delay calendar initialization to ensure container is properly sized
    setTimeout(() => {
      this.initializeCalendar(calendarEl);
    }, 100);
  }

  private initializeCalendar(calendarEl: HTMLElement) {
    const calendar = new Calendar(calendarEl, {
      plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
      initialView: this.currentSettings.viewType,
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
      editable: false,
      dayMaxEvents: true,
      // カスタムイベントフェッチ関数を使用
      events: (fetchInfo, successCallback, failureCallback) => {
        this.fetchCalendarEvents(fetchInfo, successCallback, failureCallback);
      },
      eventTimeFormat: {
        hour: 'numeric',
        minute: 'numeric',
      },
      // Add event click handler to navigate to tasks
      eventClick: (info) => {
        const filePath = info.event.extendedProps?.filePath;
        const line = info.event.extendedProps?.line;

        if (filePath) {
          // Open the file in a new tab by setting the third parameter to true
          this.app.workspace.openLinkText(filePath, '', true).then(async () => {
            // If we have the line number, navigate directly to it
            if (line !== undefined) {
              const activeLeaf = this.app.workspace.getActiveViewOfType(MarkdownView);
              if (activeLeaf && activeLeaf.editor) {
                const editor = activeLeaf.editor;

                // Set cursor to the task position
                editor.setCursor({ line: line, ch: 0 });

                // Scroll to the cursor position with some context
                editor.scrollIntoView({
                  from: { line: Math.max(0, line - 2), ch: 0 },
                  to: { line: line + 2, ch: 0 }
                }, true);
              }
            }
          });
        }
      },
      customButtons: {
        todayButton: {
          text: '📅', // カレンダーアイコンを使用
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
                { name: 'Day', value: 'timeGridDay' },
                { name: '3 Days', value: 'timeGridThreeDay' },
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
                    this.currentSettings.viewType = view.value;
                    await this.plugin.saveCalendarSettings(this.currentSettings);
                    await this.plugin.saveSettings();
                  }
                });
                dropdown.appendChild(option);
              });

              button.appendChild(dropdown);
              dropdown.classList.add('show');

              // Close dropdown when clicking outside
              document.addEventListener('click', (event) => {
                if (!button.contains(event.target as Node)) {
                  dropdown.classList.remove('show');
                }
              });
            }
          }
        }
      },
      // Add event hover handlers to show task preview
      eventMouseEnter: (info) => {
        const filePath = info.event.extendedProps?.filePath;
        const line = info.event.extendedProps?.line;
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
          })
        }
      },
    });
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

  // カレンダーイベントをフェッチするカスタム関数
  private async fetchCalendarEvents(fetchInfo: any, successCallback: any, failureCallback: any) {
    const dataviewApi = this.plugin.dataviewApi;
    if (!dataviewApi) {
      new Notice("Dataview plugin is not available, Tasks Calendar may not work correctly.");
      return failureCallback(new Error("Dataview plugin is not available"));
    }
    try {
      const events = getTasksAsEvents(dataviewApi, this.currentSettings);
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
        calendars: this.plugin.settings.calendars,
        activeCalendarId: this.currentSettings.id,
        onCalendarChange: async (calendarId) => {
          this.currentSettings = this.plugin.getCalendarSettings(calendarId);
          this.plugin.settings.activeCalendar = calendarId;
          await this.plugin.saveSettings();

          if (this.calendar) {
            this.calendar.changeView(this.currentSettings.viewType);
            this.calendar.refetchEvents();
          }

          // UIを強制的に再レンダリング
          this.renderFooter();
        },
        onCalendarAdd: async () => {
          const newId = `calendar-${Date.now()}`;
          const newCalendar: CalendarSettings = {
            ...DEFAULT_CALENDAR_SETTINGS,
            id: newId,
            name: `New Calendar ${this.plugin.settings.calendars.length + 1}`,
          };

          this.plugin.settings.calendars.push(newCalendar);
          this.plugin.settings.activeCalendar = newId;
          this.currentSettings = newCalendar;
          await this.plugin.saveSettings();

          this.renderFooter();
          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        },
        onCalendarDelete: async (calendarId) => {
          const index = this.plugin.settings.calendars.findIndex(c => c.id === calendarId);
          if (index > -1) {
            this.plugin.settings.calendars.splice(index, 1);
          }

          this.plugin.settings.activeCalendar = 'default';
          this.currentSettings = this.plugin.getCalendarSettings('default');
          await this.plugin.saveSettings();

          this.renderFooter();
          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        },
        onSettingsChange: async (settings) => {
          this.currentSettings = settings;
          this.plugin.saveCalendarSettings(settings);
          await this.plugin.saveSettings();

          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        },
        onRefresh: () => {
          if (this.calendar) {
            this.calendar.refetchEvents();
          }
        }
      })
    );
  }
}
