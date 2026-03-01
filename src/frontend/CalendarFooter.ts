import { App, setIcon, setTooltip } from 'obsidian';
import { CalendarSettings } from '../TasksCalendarSettings';
import { CalendarSettingsModal } from './CalendarSettingsModal';

export interface CalendarFooterCallbacks {
  app: App;
  getCalendarSettings: (calendarId: string) => CalendarSettings;
  getCalendarsList: () => { id: string; name: string }[];
  activeCalendarId: string;
  onCalendarChange: (calendarId: string) => void;
  onCalendarAdd: () => void;
  onCalendarDelete: (calendarId: string) => void;
  onSettingsChange: (settings: CalendarSettings) => void;
  onRefresh: () => void;
}

export class CalendarFooter {
  private containerEl: HTMLElement;
  private callbacks: CalendarFooterCallbacks;

  constructor(containerEl: HTMLElement, callbacks: CalendarFooterCallbacks) {
    this.containerEl = containerEl;
    this.callbacks = callbacks;
    this.render();
  }

  render(callbacks?: CalendarFooterCallbacks): void {
    if (callbacks) {
      this.callbacks = callbacks;
    }

    const { containerEl } = this;
    containerEl.empty();

    const footerEl = containerEl.createDiv({ cls: 'calendar-footer' });
    const contentEl = footerEl.createDiv({ cls: 'calendar-footer-content' });

    this.buildSelector(contentEl);
    this.buildActions(contentEl);
  }

  destroy(): void {
    this.containerEl.empty();
  }

  private buildSelector(parentEl: HTMLElement): void {
    const selectorContainer = parentEl.createDiv({
      cls: 'calendar-selector-container',
    });

    const calendarIcon = selectorContainer.createSpan({
      cls: 'calendar-selector-icon',
    });
    setIcon(calendarIcon, 'calendar');

    const select = selectorContainer.createEl('select', {
      cls: 'calendar-selector',
      attr: { 'aria-label': 'Select calendar' },
    });
    select.value = this.callbacks.activeCalendarId;
    select.addEventListener('change', () => {
      this.callbacks.onCalendarChange(select.value);
    });

    for (const cal of this.callbacks.getCalendarsList()) {
      select.createEl('option', { value: cal.id, text: cal.name });
    }
    select.value = this.callbacks.activeCalendarId;

    const chevronIcon = selectorContainer.createSpan({
      cls: 'calendar-selector-chevron',
    });
    setIcon(chevronIcon, 'chevron-down');
  }

  private buildActions(parentEl: HTMLElement): void {
    const actionsEl = parentEl.createDiv({ cls: 'calendar-actions' });

    this.createActionButton(actionsEl, {
      cls: 'calendar-add-button',
      title: 'Add new calendar',
      icon: 'plus',
      onClick: () => this.callbacks.onCalendarAdd(),
    });

    this.createActionButton(actionsEl, {
      cls: 'calendar-settings-button',
      title: 'Settings',
      icon: 'settings',
      onClick: () => this.openSettingsModal(),
    });

    this.createActionButton(actionsEl, {
      cls: 'calendar-refresh-button',
      title: 'Refresh tasks',
      icon: 'refresh-cw',
      onClick: () => this.callbacks.onRefresh(),
    });

    const activeSettings = this.callbacks.getCalendarSettings(
      this.callbacks.activeCalendarId
    );
    if (activeSettings.id !== 'default') {
      this.createActionButton(actionsEl, {
        cls: 'calendar-delete-button',
        title: 'Delete calendar',
        icon: 'trash-2',
        onClick: () => {
          if (
            confirm(`Are you sure you want to delete '${activeSettings.name}'?`)
          ) {
            this.callbacks.onCalendarDelete(activeSettings.id);
          }
        },
      });
    }
  }

  private createActionButton(
    parentEl: HTMLElement,
    opts: { cls: string; title: string; icon: string; onClick: () => void }
  ): void {
    const button = parentEl.createEl('button', {
      cls: `calendar-action-button ${opts.cls}`,
    });
    setTooltip(button, opts.title, { placement: 'top' });
    setIcon(button, opts.icon);
    button.addEventListener('click', opts.onClick);
  }

  private openSettingsModal(): void {
    const activeSettings = this.callbacks.getCalendarSettings(
      this.callbacks.activeCalendarId
    );
    new CalendarSettingsModal(
      this.callbacks.app,
      activeSettings,
      this.callbacks.onSettingsChange,
      activeSettings.id !== 'default'
        ? () => this.callbacks.onCalendarDelete(activeSettings.id)
        : undefined
    ).open();
  }
}
