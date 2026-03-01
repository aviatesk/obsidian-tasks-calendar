import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
  private message: string;
  private onConfirm: () => void;

  constructor(app: App, message: string, onConfirm: () => void) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen(): void {
    this.setTitle('Confirm');
    this.contentEl.createEl('p', { text: this.message });

    new Setting(this.contentEl)
      .addButton(btn =>
        btn
          .setButtonText('Delete')
          .setWarning()
          .onClick(() => {
            this.onConfirm();
            this.close();
          })
      )
      .addButton(btn =>
        btn.setButtonText('Cancel').onClick(() => {
          this.close();
        })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
