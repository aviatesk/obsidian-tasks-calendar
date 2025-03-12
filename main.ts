import { App, Plugin, PluginSettingTab, WorkspaceLeaf, ItemView, MarkdownView, TFile, Notice, debounce } from 'obsidian';
import { getAPI, SMarkdownPage } from "obsidian-dataview";
import { Calendar, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';

// グローバル定数としてのデフォルト値
const DEFAULT_INCLUDED_STATUSES = [' ', '/']; // デフォルトのステータスフィルター
const DEFAULT_DATE_PROPERTY = 'due';      // デフォルトの日付プロパティ
const DEFAULT_START_DATE_PROPERTY = 'start'; // デフォルトの終了日付プロパティ
const DEFAULT_VIEW_TYPE = 'dayGridMonth'; // デフォルトのビュータイプ
const DEFAULT_QUERY = '""';               // デフォルトのクエリ

// カレンダービューごとの設定を定義
interface CalendarViewSettings {
    id: string;               // カレンダーごとの一意のID
    name: string;             // カレンダーの表示名
    includedStatuses: string[]; // 含めるタスクのステータス
    dateProperty: string;       // 日付情報を取得するプロパティ名
    startDateProperty: string;  // 開始日付を取得するプロパティ名
    viewType: string;           // デフォルトのビュータイプ
    query: string;              // Dataviewクエリ
}

interface TasksCalendarSettings {
    calendars: CalendarViewSettings[]; // 複数のカレンダー設定
    activeCalendar?: string;          // 現在選択中のカレンダーID
}

const DEFAULT_CALENDAR: CalendarViewSettings = {
    id: 'default',
    name: 'Default Calendar',
    includedStatuses: DEFAULT_INCLUDED_STATUSES,
    dateProperty: DEFAULT_DATE_PROPERTY,
    startDateProperty: DEFAULT_START_DATE_PROPERTY,
    viewType: DEFAULT_VIEW_TYPE,
    query: DEFAULT_QUERY
};

const DEFAULT_SETTINGS: TasksCalendarSettings = {
    calendars: [DEFAULT_CALENDAR],
    activeCalendar: 'default'
}

const VIEW_TYPE_TASK_CALENDAR = "tasks-calendar-view";

// ItemViewの実装
class TasksCalendarItemView extends ItemView {
    calendar: Calendar | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private taskPreviewEl: HTMLElement | null = null;
    private footerEl: HTMLElement | null = null;
    private settingsPanelEl: HTMLElement | null = null;
    private currentSettings: CalendarViewSettings;
    private plugin: TasksCalendarPlugin;
    private isCommandKeyPressed = false;  // Commandキーの状態を追跡
    private currentHoverEvent: {el: HTMLElement, filePath: string, taskText: string} | null = null; // 現在ホバー中のイベント情報

    constructor(leaf: WorkspaceLeaf, plugin: TasksCalendarPlugin) {
        super(leaf);
        this.plugin = plugin;

        // 現在のアクティブカレンダー設定を取得
        const activeId = this.plugin.settings.activeCalendar || 'default';
        this.currentSettings = this.plugin.getCalendarSettings(activeId);
    }

    getViewType(): string {
        return VIEW_TYPE_TASK_CALENDAR;
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
        this.createFooter();

        // Delay calendar initialization to ensure container is properly sized
        setTimeout(() => {
            this.initializeCalendar(calendarEl);
        }, 100);

        // キーボードのイベントリスナーを追加
        this.registerKeyboardListeners();
    }

    private registerKeyboardListeners() {
        // キーが押された時のイベント
        const keydownHandler = (e: KeyboardEvent) => {
            if (e.metaKey && !this.isCommandKeyPressed) {  // macOSのCommandキー
                this.isCommandKeyPressed = true;
                // ホバー中のイベントがあれば、プレビューを表示
                this.showHoverPreviewIfNeeded();
            }
        };

        // キーが離された時のイベント
        const keyupHandler = (e: KeyboardEvent) => {
            if (!e.metaKey && this.isCommandKeyPressed) {  // Commandキーが離された
                this.isCommandKeyPressed = false;
                // プレビューを非表示
                this.hideTaskPreview();
            }
        };

        // フォーカスが外れた時にもキー状態をリセット
        const blurHandler = () => {
            this.isCommandKeyPressed = false;
            this.hideTaskPreview();
        };

        // イベントリスナーを登録
        document.addEventListener('keydown', keydownHandler);
        document.addEventListener('keyup', keyupHandler);
        window.addEventListener('blur', blurHandler);

        // クリーンアップ用にイベントの削除関数を登録
        this.register(() => {
            document.removeEventListener('keydown', keydownHandler);
            document.removeEventListener('keyup', keyupHandler);
            window.removeEventListener('blur', blurHandler);
        });
    }

    // 必要に応じてホバープレビューを表示
    private showHoverPreviewIfNeeded() {
        if (this.isCommandKeyPressed && this.currentHoverEvent) {
            const { el, filePath, taskText } = this.currentHoverEvent;
            this.showTaskPreview(el, filePath, taskText);
        }
    }

    private initializeCalendar(calendarEl: HTMLElement) {
        const calendar = new Calendar(calendarEl, {
            plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
            initialView: this.currentSettings.viewType,
            headerToolbar: {
                left: 'prev,next todayButton',
                center: 'title',
                right: 'viewMenu refresh'
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
                hour: '2-digit',
                minute: '2-digit',
                meridiem: false
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
                refresh: {
                    text: '↻',
                    hint: 'Refresh tasks',
                    click: () => {
                        if (this.calendar) {
                            this.calendar.refetchEvents();
                        }
                    }
                },
                // ビュー選択後に現在の設定を保存
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
                                { name: '3 Days', value: 'timeGridThreeDay' },
                                { name: 'Week', value: 'timeGridWeek' },
                                { name: 'Day', value: 'timeGridDay' },
                                { name: 'List', value: 'listWeek' }
                            ];

                            views.forEach(view => {
                                const option = document.createElement('div');
                                option.className = 'view-option';
                                option.textContent = view.name;
                                option.addEventListener('click', () => {
                                    if (this.calendar) {
                                        this.calendar.changeView(view.value);
                                        dropdown.classList.remove('show');

                                        // ビュー変更を設定に保存
                                        this.currentSettings.viewType = view.value;
                                        this.plugin.saveCalendarSettings(this.currentSettings);
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
                const taskText = info.event.extendedProps?.taskText;

                if (filePath && taskText) {
                    // ホバー中のイベント情報を保存
                    this.currentHoverEvent = {
                        el: info.el,
                        filePath,
                        taskText
                    };

                    // Commandキーが押されている場合のみプレビューを表示
                    if (this.isCommandKeyPressed) {
                        this.showTaskPreview(info.el, filePath, taskText);
                    }
                }
            },

            eventMouseLeave: () => {
                // ホバーしているイベント情報をクリア
                this.currentHoverEvent = null;
                // プレビューを非表示
                this.hideTaskPreview();
            }
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
        try {
            const events = this.getTasksAsEvents(this.currentSettings);
            successCallback(events);
        } catch (error) {
            console.error("Error fetching events:", error);
            failureCallback(error);
        }
    }

    // 現在の設定に基づいてタスクをイベントとして取得
    private getTasksAsEvents(settings: CalendarViewSettings): EventInput[] {
        const dataviewApi = this.plugin.dataviewApi
        if (!dataviewApi) {
            new Notice("Dataview plugin is not available, Tasks Calendar may not work correctly.");
            return [];
        }

        try {
            const events: EventInput[] = [];

            // カスタムクエリを使用 - 値が未設定なら デフォルトを使用
            const query = settings.query || DEFAULT_QUERY;

            // Dataviewクエリを実行
            dataviewApi.pages(query).forEach((page: SMarkdownPage) => {
                if (page && page.file.tasks) {
                    page.file.tasks
                        .filter(task => {
                            // ステータスによるフィルタリング - 値が未設定ならデフォルトを使用
                            const statuses = settings.includedStatuses?.length ?
                            settings.includedStatuses : DEFAULT_INCLUDED_STATUSES;

                            // 指定されたステータスのいずれかに一致するタスクのみを含める
                            if (!statuses.includes(task.status)) {
                                return false;
                            }

                            // 日付プロパティの存在確認 - 値が未設定ならデフォルトを使用
                            const dateProperty = settings.dateProperty || DEFAULT_DATE_PROPERTY;
                            return !!task[dateProperty];
                        })
                        .forEach(task => {
                            const dateProperty = settings.dateProperty || DEFAULT_DATE_PROPERTY;
                            const startDateProperty = settings.startDateProperty || DEFAULT_START_DATE_PROPERTY;

                            const taskDate = task[dateProperty];
                            const date = taskDate.toString();
                            let allDay = taskDate.hour == 0 && taskDate.minute == 0 && taskDate.second == 0;
                            const cleanText = task.text
                                .replace(/#\w+/g, '') // Remove all tags
                                .replace(/\[[\w\s-]+::\s*[^\]]*\]/g, '') // Remove metadata properties [key::value]
                                .trim();

                            // Check if task has an end date
                            let startDate = date;
                            let endDate = undefined;
                            if (task[startDateProperty]) {
                                const taskStartDate = task[startDateProperty];
                                startDate = taskStartDate.toString();
                                if (allDay) {
                                    allDay = taskStartDate.hour == 0 && taskStartDate.minute == 0 && taskStartDate.second == 0;
                                }
                                endDate = task[dateProperty].plus(dataviewApi.func.dur("1 day")).toString();
                            }
                            events.push({
                                title: cleanText,
                                start: startDate,
                                end: endDate,
                                allDay,
                                extendedProps: {
                                    filePath: page.file.path,
                                    taskText: task.text,
                                    line: task.line
                                }
                            });
                        });
                }
            });

            return events;
        } catch (error) {
            console.error("Error getting tasks:", error);
            return [];
        }
    }

    // Preview popup management
    private async showTaskPreview(targetEl: HTMLElement, filePath: string, taskText: string) {
        // Remove any existing preview
        this.hideTaskPreview();

        // Create preview element
        this.taskPreviewEl = document.createElement('div');
        this.taskPreviewEl.className = 'task-preview-popup';

        // Add task text - use standard DOM methods instead of createDiv
        const taskContentEl = document.createElement('div');
        taskContentEl.className = 'task-preview-content';
        this.taskPreviewEl.appendChild(taskContentEl);

        // Add file info
        const fileInfoEl = document.createElement('div');
        fileInfoEl.className = 'task-preview-file-info';
        fileInfoEl.innerHTML = `<strong>File:</strong> ${filePath}`;
        taskContentEl.appendChild(fileInfoEl);

        // Add task text with markdown processing
        const taskTextEl = document.createElement('div');
        taskTextEl.className = 'task-preview-task-text';
        taskContentEl.appendChild(taskTextEl);

        try {
            // Try to get file content for context
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file && file instanceof TFile) {
                const content = await this.app.vault.read(file);

                // Get a few lines before and after the task for context
                if (content) {
                    const lines = content.split('\n');
                    const taskLine = taskText.split('\n')[0]; // Get first line of task
                    let taskLineIndex = -1;

                    // Find the task in the file content
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes(taskLine)) {
                            taskLineIndex = i;
                            break;
                        }
                    }

                    if (taskLineIndex >= 0) {
                        // Get context (3 lines before and after)
                        const startLine = Math.max(0, taskLineIndex - 3);
                        const endLine = Math.min(lines.length - 1, taskLineIndex + 3);

                        // Extract context with the task highlighted
                        const contextLines = [];
                        for (let i = startLine; i <= endLine; i++) {
                            if (i === taskLineIndex) {
                                contextLines.push(`<div class="task-highlight">${lines[i]}</div>`);
                            } else {
                                contextLines.push(`<div>${lines[i]}</div>`);
                            }
                        }

                        taskTextEl.innerHTML = contextLines.join('');
                    } else {
                        // Fallback if we can't find the exact line
                        taskTextEl.textContent = taskText;
                    }
                } else {
                    taskTextEl.textContent = taskText;
                }
            } else {
                taskTextEl.textContent = taskText;
            }
        } catch (e) {
            // Fallback to just showing the task text
            taskTextEl.textContent = taskText;
            console.error("Error getting preview content", e);
        }

        // Position the popup near the event
        const rect = targetEl.getBoundingClientRect();

        // Add to DOM
        document.body.appendChild(this.taskPreviewEl);

        // Position after adding to get proper dimensions
        const previewRect = this.taskPreviewEl.getBoundingClientRect();
        const topPos = rect.top - previewRect.height - 10;
        const leftPos = rect.left;

        // Check if the preview would go off the top of the screen
        if (topPos < 10) {
            // Position below the event instead
            this.taskPreviewEl.style.top = `${rect.bottom + 10}px`;
        } else {
            this.taskPreviewEl.style.top = `${topPos}px`;
        }

        // Check if preview would go off the right side of the screen
        if (leftPos + previewRect.width > window.innerWidth - 10) {
            this.taskPreviewEl.style.left = `${window.innerWidth - previewRect.width - 10}px`;
        } else {
            this.taskPreviewEl.style.left = `${leftPos}px`;
        }
    }

    private hideTaskPreview() {
        if (this.taskPreviewEl && this.taskPreviewEl.parentNode) {
            this.taskPreviewEl.parentNode.removeChild(this.taskPreviewEl);
        }
        this.taskPreviewEl = null;
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
        // Hide any open preview and panels
        this.hideTaskPreview();

        // リスナーをクリーンアップする
        this.removeSettingsPanelListener();

        if (this.settingsPanelEl) {
            this.settingsPanelEl.remove();
            this.settingsPanelEl = null;
        }

        if (this.calendar) {
            this.calendar.destroy();
            this.calendar = null;
        }

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // 現在のホバー情報をクリア
        this.currentHoverEvent = null;
    }

    // Called when this view is activated (made visible)
    onResize() {
        if (this.calendar) {
            this.calendar.updateSize();
        }
    }

    // フッターUIの作成
    private createFooter() {
        if (!this.footerEl) return;
        this.footerEl.empty();

        // カレンダー選択ドロップダウン
        const selectContainer = this.footerEl.createDiv('calendar-selector-container');
        selectContainer.createEl('span', { text: 'Calendar: ' });
        const select = selectContainer.createEl('select', { cls: 'calendar-selector' });

        // カレンダーオプションを追加
        this.plugin.settings.calendars.forEach(cal => {
            const option = select.createEl('option', {
                text: cal.name,
                value: cal.id
            });
            if (cal.id === this.currentSettings.id) {
                option.selected = true;
            }
        });

        // カレンダー変更時の処理
        select.addEventListener('change', async () => {
            const calendarId = select.value;
            this.currentSettings = this.plugin.getCalendarSettings(calendarId);
            this.plugin.settings.activeCalendar = calendarId;
            await this.plugin.saveSettings();

            // カレンダーを更新
            if (this.calendar) {
                this.calendar.changeView(this.currentSettings.viewType);
                this.calendar.refetchEvents();
            }

            // 設定パネルを更新（表示中の場合）
            this.updateSettingsPanel();
        });

        // カレンダー追加ボタン
        const addButton = this.footerEl.createEl('button', {
            cls: 'calendar-add-button',
            text: '+'
        });
        addButton.addEventListener('click', async () => {
            // 新しいカレンダー設定を追加
            const newId = `calendar-${Date.now()}`;
            const newCalendar: CalendarViewSettings = {
                id: newId,
                name: `Calendar ${this.plugin.settings.calendars.length + 1}`,
                includedStatuses: DEFAULT_INCLUDED_STATUSES,
                dateProperty: DEFAULT_DATE_PROPERTY,
                startDateProperty: DEFAULT_START_DATE_PROPERTY,
                viewType: DEFAULT_VIEW_TYPE,
                query: DEFAULT_QUERY
            };

            this.plugin.settings.calendars.push(newCalendar);
            this.plugin.settings.activeCalendar = newId;
            this.currentSettings = newCalendar;
            await this.plugin.saveSettings();

            // UIを更新
            this.createFooter();
            if (this.calendar) {
                this.calendar.refetchEvents();
            }
        });

        // 設定ボタン
        const settingsButton = this.footerEl.createEl('button', {
            cls: 'calendar-settings-button',
            text: '⚙️'
        });
        settingsButton.addEventListener('click', () => {
            if (this.settingsPanelEl && this.settingsPanelEl.isShown()) {
                this.settingsPanelEl.hide();
            } else {
                this.showSettingsPanel();
            }
        });

        // 設定変更時にイベントを再取得
        if (this.calendar) {
            this.calendar.refetchEvents();
        }
    }

    // 設定パネルの表示
    private showSettingsPanel() {
        if (!this.footerEl) return;

        // 既存のパネルを削除
        if (this.settingsPanelEl) {
            this.settingsPanelEl.remove();
            this.removeSettingsPanelListener(); // リスナーの削除を明示的に行う
            this.settingsPanelEl = null;
        }

        // 設定パネル作成
        this.settingsPanelEl = this.footerEl.createDiv('calendar-settings-panel');

        // 現在のカレンダー設定用のフォーム
        const form = this.settingsPanelEl.createEl('form', { cls: 'tasks-calendar-settings-form' });

        // カレンダー名
        const nameContainer = form.createDiv('setting-item');
        nameContainer.createEl('label', { text: 'Name:' });
        const nameInput = nameContainer.createEl('input', {
            type: 'text',
            value: this.currentSettings.name
        });
        nameInput.addEventListener('change', () => {
            this.currentSettings.name = nameInput.value;
            this.saveCurrentSettings();
        });

        // 日付プロパティ設定
        const propContainer = form.createDiv('setting-item');
        propContainer.createEl('label', { text: 'Date property:' });
        const propInput = propContainer.createEl('input', {
            type: 'text',
            value: this.currentSettings.dateProperty || DEFAULT_DATE_PROPERTY
        });
        propInput.placeholder = DEFAULT_DATE_PROPERTY;
        propInput.addEventListener('change', () => {
            this.currentSettings.dateProperty = propInput.value.trim();
            this.saveCurrentSettings();
        });

        // 終了日付プロパティ設定
        const endPropContainer = form.createDiv('setting-item');
        endPropContainer.createEl('label', { text: 'End date property:' });
        const endPropInput = endPropContainer.createEl('input', {
            type: 'text',
            value: this.currentSettings.startDateProperty || DEFAULT_START_DATE_PROPERTY
        });
        endPropInput.placeholder = DEFAULT_START_DATE_PROPERTY;
        endPropInput.addEventListener('change', () => {
            this.currentSettings.startDateProperty = endPropInput.value.trim();
            this.saveCurrentSettings();
        });

        // Dataviewクエリ設定
        const queryContainer = form.createDiv('setting-item');
        queryContainer.createEl('label', { text: 'Dataview query:' });
        // ヘルプテキストを追加
        queryContainer.createEl('div', {
            cls: 'setting-item-description',
            text: `Examples: ${DEFAULT_QUERY} (all files), "work" (work folder), -"work" (folders excluding work), #tag (files with tag)`
        });
        const queryInput = queryContainer.createEl('input', {
            type: 'text',
            value: this.currentSettings.query || DEFAULT_QUERY
        });
        queryInput.placeholder = DEFAULT_QUERY;
        queryInput.addEventListener('change', () => {
            // 入力値をそのまま保存、処理は実行時に行う
            this.currentSettings.query = queryInput.value.trim() || DEFAULT_QUERY;
            this.saveCurrentSettings();
        });

        // タスクステータス設定
        const statusContainer = form.createDiv('setting-item');
        statusContainer.createEl('label', { text: 'Include task statuses (comma separated):' });
        // ヘルプテキストを追加
        statusContainer.createEl('div', {
            cls: 'setting-item-description',
            text: `Examples: "${DEFAULT_INCLUDED_STATUSES.join('", "')}" (default values)`
        });
        const statusInput = statusContainer.createEl('input', {
            type: 'text',
            value: (this.currentSettings.includedStatuses || DEFAULT_INCLUDED_STATUSES).join(', ')
        });
        statusInput.placeholder = DEFAULT_INCLUDED_STATUSES.join(', ');
        statusInput.addEventListener('change', () => {
            this.currentSettings.includedStatuses = statusInput.value
            .split(',')
            .filter(status => status.length > 0);
            this.saveCurrentSettings();
        });

        // 削除ボタン（デフォルト以外）
        if (this.currentSettings.id !== 'default') {
            const deleteContainer = form.createDiv('setting-item');
            const deleteButton = deleteContainer.createEl('button', {
                cls: 'calendar-delete-button',
                text: 'Delete Calendar'
            });
            deleteButton.addEventListener('click', async (e) => {
                e.preventDefault();

                if (confirm(`Are you sure you want to delete '${this.currentSettings.name}'?`)) {
                    // カレンダー削除
                    const index = this.plugin.settings.calendars.findIndex(c => c.id === this.currentSettings.id);
                    if (index > -1) {
                        this.plugin.settings.calendars.splice(index, 1);
                    }

                    // デフォルトに戻す
                    this.plugin.settings.activeCalendar = 'default';
                    this.currentSettings = this.plugin.getCalendarSettings('default');
                    await this.plugin.saveSettings();

                    // UIを更新
                    this.settingsPanelEl?.remove();
                    this.settingsPanelEl = null;
                    this.createFooter();
                    if (this.calendar) {
                        this.calendar.refetchEvents();
                    }
                }
            });
        }

        // グローバルイベントリスナーを追加
        this.addSettingsPanelListener();
    }

    // 設定パネルの外側をクリックした時に閉じるためのリスナー
    private settingsPanelClickListener: ((e: MouseEvent) => void) | null = null;

    // 設定パネルのクリックリスナーを追加
    private addSettingsPanelListener() {
        // 古いリスナーを削除
        this.removeSettingsPanelListener();

        // 新しいリスナーを作成
        this.settingsPanelClickListener = (e: MouseEvent) => {
            if (this.settingsPanelEl && !this.settingsPanelEl.contains(e.target as Node)) {
                // 設定パネルの外側がクリックされた
                this.settingsPanelEl.remove();
                this.settingsPanelEl = null;
                this.removeSettingsPanelListener();
            }
        };

        // リスナーを追加（少し遅延させてボタンクリックイベントと混同しないように）
        setTimeout(() => {
            document.addEventListener('click', this.settingsPanelClickListener!);
        }, 10);
    }

    // 設定パネルのクリックリスナーを削除
    private removeSettingsPanelListener() {
        if (this.settingsPanelClickListener) {
            document.removeEventListener('click', this.settingsPanelClickListener);
            this.settingsPanelClickListener = null;
        }
    }

    // 設定パネルの更新
    private updateSettingsPanel() {
        if (this.settingsPanelEl) {
            this.settingsPanelEl.remove();
            this.showSettingsPanel();
        }
    }

    // 現在の設定を保存
    private async saveCurrentSettings() {
        this.plugin.saveCalendarSettings(this.currentSettings);
        await this.plugin.saveSettings();

        // イベント再取得
        if (this.calendar) {
            this.calendar.refetchEvents();
        }
    }
}

// メインのプラグインクラス
export default class TasksCalendarPlugin extends Plugin {
    settings: TasksCalendarSettings;
    dataviewApi = getAPI();
    _onChangeCallback = () => {};

    async onload() {
        await this.loadSettings();

        const dataviewApi = this.dataviewApi
        if (dataviewApi) {
            const oldOnChange = dataviewApi.index.onChange;
            dataviewApi.index.onChange = () => {
                oldOnChange();
                this._onChangeCallback();
            }
        }

        // Register view with plugin instance
        this.registerView(
            VIEW_TYPE_TASK_CALENDAR,
            (leaf) => new TasksCalendarItemView(leaf, this)
        );

        // Add ribbon icon with a better calendar icon
        this.addRibbonIcon("lucide-calendar-check", "Tasks Calendar", () => {
            this.activateView();
        });

        // Add command to open calendar
        this.addCommand({
            id: 'open-tasks-full-calendar',
            name: 'Open Tasks Full Calendar',
            callback: () => this.activateView()
        });

        // Add settings tab
        this.addSettingTab(new TasksCalendarSettingTab(this.app, this));

        // Add workspace event listeners to track calendar view position
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                setTimeout(() => {
                    if (this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_CALENDAR).length > 0) {
                        const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_CALENDAR)[0].view;
                        if (view instanceof TasksCalendarItemView && view.calendar) {
                            view.calendar.updateSize();
                        }
                    }
                }, 100);
            })
        );

        // プラグイン起動時に自動的にビューを開く
        setTimeout(() => this.activateView(), 300);
    }

    onunload() {
        this._onChangeCallback = () => {};
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_TASK_CALENDAR);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // 既存の設定を移行（古いバージョンからのアップグレード）
        if (!this.settings.calendars) {
            this.settings.calendars = [DEFAULT_CALENDAR];
        }
        if (!this.settings.activeCalendar) {
            this.settings.activeCalendar = 'default';
        }

        // 各カレンダー設定のデフォルト値を確実に設定
        this.settings.calendars = this.settings.calendars.map(cal => {
            return {
                id: cal.id,
                name: cal.name,
                includedStatuses: cal.includedStatuses || DEFAULT_INCLUDED_STATUSES,
                dateProperty: cal.dateProperty || DEFAULT_DATE_PROPERTY,
                startDateProperty: cal.startDateProperty || DEFAULT_START_DATE_PROPERTY,
                viewType: cal.viewType || DEFAULT_VIEW_TYPE,
                query: cal.query || DEFAULT_QUERY
            };
        });
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // 指定IDのカレンダー設定を取得
    getCalendarSettings(id: string): CalendarViewSettings {
        const calendar = this.settings.calendars.find(c => c.id === id);

        // カレンダーが見つからない場合はデフォルトを使用
        if (!calendar) {
            return { ...DEFAULT_CALENDAR };
        }

        // 設定が不足している場合、デフォルト値で補完
        const result: CalendarViewSettings = {
            id: calendar.id,
            name: calendar.name,
            includedStatuses: calendar.includedStatuses || DEFAULT_INCLUDED_STATUSES,
            dateProperty: calendar.dateProperty || DEFAULT_DATE_PROPERTY,
            startDateProperty: calendar.startDateProperty || DEFAULT_START_DATE_PROPERTY,
            viewType: calendar.viewType || DEFAULT_VIEW_TYPE,
            query: calendar.query || DEFAULT_QUERY
        };

        return result;
    }

    // カレンダー設定を保存
    saveCalendarSettings(settings: CalendarViewSettings) {
        const index = this.settings.calendars.findIndex(c => c.id === settings.id);
        if (index > -1) {
            this.settings.calendars[index] = settings;
        } else {
            this.settings.calendars.push(settings);
        }
    }

    async activateView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_TASK_CALENDAR);

        let leaf: WorkspaceLeaf | null = null;

        if (leaves.length > 0) {
            // View already exists, show it
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({
                    type: VIEW_TYPE_TASK_CALENDAR,
                    active: true
                });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }
}

class TasksCalendarSettingTab extends PluginSettingTab {
    plugin: TasksCalendarPlugin;

    constructor(app: App, plugin: TasksCalendarPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Tasks Calendar Settings' });
    }
}
