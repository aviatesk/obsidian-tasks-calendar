import { setIcon, Platform } from 'obsidian';
import { DROPDOWN_STATUS_OPTIONS } from '../backend/status';
import { getStatusIcon } from './statusIcon';
import { calculateOptimalPosition } from '../backend/position';

export interface StatusPickerDropdownProps {
  currentStatus: string;
  onClose: () => void;
  onSave: (status: string) => void;
  position: { top: number; left: number };
}

export class StatusPickerDropdown {
  private containerEl: HTMLElement;
  private modalEl: HTMLElement;
  private props: StatusPickerDropdownProps;
  private handleClickOutside: (event: MouseEvent) => void;

  constructor(containerEl: HTMLElement, props: StatusPickerDropdownProps) {
    this.containerEl = containerEl;
    this.props = props;

    this.handleClickOutside = (event: MouseEvent) => {
      if (!this.modalEl.contains(event.target as Node)) {
        this.props.onClose();
      }
    };

    this.modalEl = this.buildModal();
    this.containerEl.appendChild(this.modalEl);

    document.addEventListener('mousedown', this.handleClickOutside);

    if (!Platform.isMobile) {
      this.calculatePosition();
    }
  }

  destroy(): void {
    document.removeEventListener('mousedown', this.handleClickOutside);
    this.modalEl.remove();
  }

  private buildModal(): HTMLElement {
    const isMobile = Platform.isMobile;

    if (isMobile) {
      const overlay = document.createElement('div');
      overlay.className = 'mobile-modal-overlay';
      overlay.appendChild(this.buildModalContent());
      return overlay;
    }

    return this.buildModalContent();
  }

  private buildModalContent(): HTMLElement {
    const isMobile = Platform.isMobile;
    const iconSize = isMobile ? 18 : 16;

    const modal = document.createElement('div');
    modal.className = 'status-picker-modal';

    const header = modal.createDiv({ cls: 'status-picker-header' });
    header.createDiv({ cls: 'status-picker-title', text: 'Task status' });

    const headerButtons = header.createDiv({
      cls: 'status-picker-header-buttons',
    });
    const closeBtn = headerButtons.createEl('button', {
      cls: 'status-picker-close-button',
      attr: { title: 'Close' },
    });
    setIcon(closeBtn, 'x');
    const closeSvg = closeBtn.querySelector('svg');
    if (closeSvg) {
      closeSvg.setAttribute('width', String(iconSize));
      closeSvg.setAttribute('height', String(iconSize));
    }
    closeBtn.addEventListener('click', () => this.props.onClose());

    const content = modal.createDiv({ cls: 'status-picker-content' });
    const options = content.createDiv({ cls: 'status-picker-options' });

    for (const option of DROPDOWN_STATUS_OPTIONS) {
      const optionEl = options.createDiv({
        cls: `status-picker-option ${option.value === this.props.currentStatus ? 'selected' : ''}`,
      });
      optionEl.addEventListener('click', () => this.props.onSave(option.value));

      const checkbox = optionEl.createDiv({ cls: 'status-picker-checkbox' });
      if (option.value === this.props.currentStatus) {
        setIcon(checkbox, 'check');
        const checkSvg = checkbox.querySelector('svg');
        if (checkSvg) {
          checkSvg.setAttribute('width', '14');
          checkSvg.setAttribute('height', '14');
        }
      }

      const optionText = optionEl.createDiv({
        cls: 'status-picker-option-text',
      });

      const iconSpan = optionText.createSpan();
      iconSpan.style.marginRight = '6px';
      iconSpan.style.display = 'inline-flex';
      iconSpan.style.alignItems = 'center';
      setIcon(iconSpan, getStatusIcon(option.value));
      const statusSvg = iconSpan.querySelector('svg');
      if (statusSvg) {
        statusSvg.setAttribute('width', '14');
        statusSvg.setAttribute('height', '14');
      }

      optionText.createSpan({
        cls: 'status-markdown-preview',
        text: `[${option.value === ' ' ? ' ' : option.value}]`,
      });
      optionText.createSpan({
        cls: 'status-label',
        text: option.label,
      });
    }

    return modal;
  }

  private calculatePosition(): void {
    const modal = Platform.isMobile
      ? this.modalEl.querySelector<HTMLElement>('.status-picker-modal')
      : this.modalEl;
    if (!modal) return;

    const { position } = this.props;
    const sourceEl = document.createElement('div');
    sourceEl.style.position = 'absolute';
    sourceEl.style.left = `${position.left}px`;
    sourceEl.style.top = `${position.top - 5}px`;
    sourceEl.style.width = '100px';
    sourceEl.style.height = '20px';
    document.body.appendChild(sourceEl);

    calculateOptimalPosition(sourceEl, modal, 10);

    document.body.removeChild(sourceEl);
  }
}
