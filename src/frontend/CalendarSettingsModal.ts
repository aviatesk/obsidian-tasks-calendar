import { App, Modal, Setting } from 'obsidian';
import {
  CalendarSettings,
  DEFAULT_CALENDAR_SETTINGS,
} from '../TasksCalendarSettings';
import { normalizeTag } from '../backend/tag';
import { ConfirmModal } from './ConfirmModal';
import { PathSuggest } from './PathSuggest';

export class CalendarSettingsModal extends Modal {
  private settings: CalendarSettings;
  private onSettingsChange: (settings: CalendarSettings) => void;
  private onDeleteCalendar?: () => void;

  constructor(
    app: App,
    settings: CalendarSettings,
    onSettingsChange: (settings: CalendarSettings) => void,
    onDeleteCalendar?: () => void
  ) {
    super(app);
    this.settings = { ...settings };
    this.onSettingsChange = onSettingsChange;
    this.onDeleteCalendar = onDeleteCalendar;
    this.modalEl.addClass('tasks-calendar-settings-modal');
  }

  onOpen(): void {
    this.setTitle('Calendar settings');
    this.buildContent();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private update<K extends keyof CalendarSettings>(
    field: K,
    value: CalendarSettings[K]
  ): void {
    this.settings = { ...this.settings, [field]: value };
    this.onSettingsChange({ ...this.settings });
  }

  private buildContent(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.buildBasicSection(contentEl);
    this.buildFilterSection(contentEl);
    this.buildDangerSection(contentEl);
  }

  private buildBasicSection(el: HTMLElement): void {
    new Setting(el).setName('Basic configuration').setHeading();

    new Setting(el)
      .setName('Calendar name')
      .addText(text =>
        text
          .setValue(this.settings.name)
          .onChange(value => this.update('name', value))
      )
      .addExtraButton(btn =>
        btn
          .setIcon('reset')
          .setTooltip('Reset to default')
          .onClick(() => {
            this.update('name', this.settings.id.toUpperCase());
            this.buildContent();
          })
      );

    new Setting(el)
      .setName('Task creation destinations')
      .setDesc(
        'Destinations where new tasks will be created when clicking on dates. ' +
          'Specify a .md file path to append tasks as Markdown list items, ' +
          'or a folder path (ending with /) to create new notes.'
      );

    this.renderPathList(el);

    new Setting(el)
      .setName('Due date property')
      .addText(text =>
        text
          .setPlaceholder(DEFAULT_CALENDAR_SETTINGS.dateProperty)
          .setValue(this.settings.dateProperty)
          .onChange(value => this.update('dateProperty', value))
      )
      .addExtraButton(btn =>
        btn
          .setIcon('reset')
          .setTooltip('Reset to default')
          .onClick(() => {
            this.update('dateProperty', DEFAULT_CALENDAR_SETTINGS.dateProperty);
            this.buildContent();
          })
      );

    new Setting(el)
      .setName('Start date property')
      .addText(text =>
        text
          .setPlaceholder(DEFAULT_CALENDAR_SETTINGS.startDateProperty)
          .setValue(this.settings.startDateProperty)
          .onChange(value => this.update('startDateProperty', value))
      )
      .addExtraButton(btn =>
        btn
          .setIcon('reset')
          .setTooltip('Reset to default')
          .onClick(() => {
            this.update(
              'startDateProperty',
              DEFAULT_CALENDAR_SETTINGS.startDateProperty
            );
            this.buildContent();
          })
      );

    new Setting(el)
      .setName('Dataview query')
      .setDesc(
        'Examples: "" (all files), "work" (work folder), -"work" (exclude work folder), #tag (files with tag).'
      )
      .addText(text =>
        text
          .setPlaceholder(DEFAULT_CALENDAR_SETTINGS.query)
          .setValue(this.settings.query)
          .onChange(value => this.update('query', value))
      )
      .addExtraButton(btn =>
        btn
          .setIcon('reset')
          .setTooltip('Reset to default')
          .onClick(() => {
            this.update('query', DEFAULT_CALENDAR_SETTINGS.query);
            this.buildContent();
          })
      );
  }

  private renderPathList(el: HTMLElement): void {
    const paths = this.settings.newTaskFilePaths;

    if (paths.length > 0) {
      const chipList = el.createDiv({ cls: 'tasks-calendar-chip-list' });
      for (const path of paths) {
        const chip = chipList.createDiv({ cls: 'tasks-calendar-chip' });
        chip.createSpan({ text: path });
        const removeBtn = chip.createSpan({
          cls: 'tasks-calendar-chip-remove',
          text: '×',
        });
        removeBtn.addEventListener('click', () => {
          this.update(
            'newTaskFilePaths',
            paths.filter(p => p !== path)
          );
          this.buildContent();
        });
      }
    }

    let newPath = '';

    const addPath = () => {
      const trimmed = newPath.trim();
      if (trimmed && !paths.includes(trimmed)) {
        this.update('newTaskFilePaths', [...paths, trimmed]);
        this.buildContent();
      }
    };

    new Setting(el)
      .addSearch(search => {
        search.setPlaceholder('Add destination path...').onChange(value => {
          newPath = value;
        });
        search.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addPath();
          }
        });
        new PathSuggest(this.app, search.inputEl, value => {
          newPath = value;
          addPath();
        });
      })
      .addButton(btn => btn.setButtonText('Add').onClick(addPath))
      .addExtraButton(btn =>
        btn
          .setIcon('reset')
          .setTooltip('Reset to default')
          .onClick(() => {
            this.update('newTaskFilePaths', [
              ...DEFAULT_CALENDAR_SETTINGS.newTaskFilePaths,
            ]);
            this.buildContent();
          })
      );
  }

  private buildFilterSection(el: HTMLElement): void {
    new Setting(el).setName('Task filtering').setHeading();

    this.renderStringList(
      el,
      'Excluded statuses',
      'Tasks with these statuses are excluded from the calendar, regardless of inclusion settings.',
      'excludedStatuses',
      false
    );

    this.renderStringList(
      el,
      'Included statuses',
      'Only tasks with these statuses are shown. Leave empty to include all (except excluded).',
      'includedStatuses',
      false
    );

    this.renderStringList(
      el,
      'Excluded tags',
      'Tasks with these tags are excluded from the calendar, regardless of inclusion settings.',
      'excludedTags',
      true
    );

    this.renderStringList(
      el,
      'Included tags',
      'Only tasks with these tags are shown. Leave empty to include all (except excluded).',
      'includedTags',
      true
    );
  }

  private renderStringList(
    el: HTMLElement,
    name: string,
    desc: string,
    field:
      | 'excludedStatuses'
      | 'includedStatuses'
      | 'excludedTags'
      | 'includedTags',
    isTag: boolean
  ): void {
    new Setting(el).setName(name).setDesc(desc);

    const items = this.settings[field];

    if (items.length > 0) {
      const chipList = el.createDiv({ cls: 'tasks-calendar-chip-list' });
      for (const item of items) {
        const chip = chipList.createDiv({ cls: 'tasks-calendar-chip' });
        chip.createSpan({ text: item });
        const removeBtn = chip.createSpan({
          cls: 'tasks-calendar-chip-remove',
          text: '×',
        });
        removeBtn.addEventListener('click', () => {
          this.update(
            field,
            items.filter(i => i !== item)
          );
          this.buildContent();
        });
      }
    }

    let newValue = '';

    const addItem = () => {
      const processed = isTag ? normalizeTag(newValue) : newValue.trim();
      if (processed && !items.includes(processed)) {
        this.update(field, [...items, processed]);
        this.buildContent();
      }
    };

    new Setting(el)
      .addText(text => {
        text.setPlaceholder(isTag ? '#tag' : 'e.g. x').onChange(value => {
          newValue = value;
        });
        text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addItem();
          }
        });
      })
      .addButton(btn => btn.setButtonText('Add').onClick(addItem))
      .addExtraButton(btn =>
        btn
          .setIcon('reset')
          .setTooltip('Reset to default')
          .onClick(() => {
            this.update(field, [...DEFAULT_CALENDAR_SETTINGS[field]]);
            this.buildContent();
          })
      );
  }

  private buildDangerSection(el: HTMLElement): void {
    if (this.settings.id === 'default' || !this.onDeleteCalendar) return;

    new Setting(el)
      .setName('Delete calendar')
      .setDesc('This action cannot be undone.')
      .addButton(btn =>
        btn
          .setButtonText('Delete')
          .setWarning()
          .onClick(() => {
            new ConfirmModal(
              this.app,
              `Are you sure you want to delete '${this.settings.name}'?`,
              () => {
                this.onDeleteCalendar!();
                this.close();
              }
            ).open();
          })
      );
  }
}
