import { type App, Modal } from 'obsidian';
import React from 'react';
import { Check } from 'lucide-react';
import { DROPDOWN_STATUS_OPTIONS } from '../backend/status';
import { getStatusIcon } from './statusIcon';
import { ReactRenderer } from './ReactRoot';

interface StatusPickerDropdownProps {
  currentStatus: string;
  onClose: () => void;
  onSave: (status: string) => void;
}

export const StatusPickerDropdown: React.FC<StatusPickerDropdownProps> = ({
  currentStatus,
  onSave,
}) => {
  return (
    <div className="status-picker-content">
      <div className="status-picker-options">
        {DROPDOWN_STATUS_OPTIONS.map(option => (
          <div
            key={option.label}
            className={`status-picker-option ${option.value === currentStatus ? 'selected' : ''}`}
            onClick={() => onSave(option.value)}
          >
            <div className="status-picker-checkbox">
              {option.value === currentStatus && <Check size={14} />}
            </div>
            <div className="status-picker-option-text">
              {React.createElement(getStatusIcon(option.value), {
                size: 14,
                style: { marginRight: '6px' },
              })}
              <span className="status-markdown-preview">
                [{option.value === ' ' ? ' ' : option.value}]
              </span>
              <span className="status-label">{option.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface StatusPickerNativeModalProps {
  currentStatus: string;
  onSave: (status: string) => void;
}

export class StatusPickerNativeModal extends Modal {
  private renderer: ReactRenderer | null = null;
  private readonly props: StatusPickerNativeModalProps;

  constructor(app: App, props: StatusPickerNativeModalProps) {
    super(app);
    this.props = props;
    this.modalEl.addClass('tasks-calendar-status-picker-modal');
  }

  onOpen(): void {
    this.setTitle('Task status');
    this.renderer = new ReactRenderer(this.contentEl);
    this.renderer.render(
      React.createElement(StatusPickerDropdown, {
        currentStatus: this.props.currentStatus,
        onClose: () => this.close(),
        onSave: (status: string) => {
          this.props.onSave(status);
          this.close();
        },
      })
    );
  }

  onClose(): void {
    this.renderer?.unmount();
    this.renderer = null;
    this.contentEl.empty();
  }
}
