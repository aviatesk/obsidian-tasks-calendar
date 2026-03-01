import React, { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { DROPDOWN_STATUS_OPTIONS } from '../backend/status';
import { getStatusIcon } from './statusIcon';
import { calculateOptimalPosition } from '../backend/position';
import { Platform } from 'obsidian';

interface StatusPickerDropdownProps {
  currentStatus: string;
  onClose: () => void;
  onSave: (status: string) => void;
  position: { top: number; left: number };
}

export const StatusPickerDropdown: React.FC<StatusPickerDropdownProps> = ({
  currentStatus,
  onClose,
  onSave,
  position,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [finalPosition, setFinalPosition] = useState(position);
  const isMobile = Platform.isMobile;

  useEffect(() => {
    // Calculate optimal position after the component mounts only for desktop
    if (modalRef.current && !isMobile) {
      // Create a temporary element to represent the source of the click
      const sourceEl = document.createElement('div');
      sourceEl.style.position = 'absolute';
      sourceEl.style.left = `${position.left}px`;
      sourceEl.style.top = `${position.top - 5}px`; // 5px offset to represent the original element
      sourceEl.style.width = '100px'; // Approximate width
      sourceEl.style.height = '20px'; // Approximate height
      document.body.appendChild(sourceEl);

      // Calculate optimal position
      const optimalPosition = calculateOptimalPosition(
        sourceEl,
        modalRef.current,
        10
      );
      setFinalPosition(optimalPosition);

      // Clean up temporary element
      document.body.removeChild(sourceEl);
    } else if (isMobile) {
      // On mobile, position doesn't matter as it will be centered by CSS
      setFinalPosition({ top: 0, left: 0 });
    }
  }, [position, isMobile]);

  useEffect(() => {
    // Close modal when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleStatusSelect = (statusValue: string) => {
    onSave(statusValue);
  };

  // Render different container based on mobile or desktop
  return isMobile ? (
    <div className="mobile-modal-overlay">
      <div className="status-picker-modal" ref={modalRef}>
        <div className="status-picker-header">
          <div className="status-picker-title">Task status</div>
          <div className="status-picker-header-buttons">
            <button
              className="status-picker-close-button"
              onClick={onClose}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="status-picker-content">
          <div className="status-picker-options">
            {DROPDOWN_STATUS_OPTIONS.map(option => (
              <div
                key={option.label}
                className={`status-picker-option ${option.value === currentStatus ? 'selected' : ''}`}
                onClick={() => handleStatusSelect(option.value)}
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
      </div>
    </div>
  ) : (
    <div
      className="status-picker-modal"
      style={{
        top: `${finalPosition.top}px`,
        left: `${finalPosition.left}px`,
      }}
      ref={modalRef}
    >
      <div className="status-picker-header">
        <div className="status-picker-title">Task status</div>
        <div className="status-picker-header-buttons">
          <button
            className="status-picker-close-button"
            onClick={onClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="status-picker-content">
        <div className="status-picker-options">
          {DROPDOWN_STATUS_OPTIONS.map(option => (
            <div
              key={option.label}
              className={`status-picker-option ${option.value === currentStatus ? 'selected' : ''}`}
              onClick={() => handleStatusSelect(option.value)}
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
    </div>
  );
};
