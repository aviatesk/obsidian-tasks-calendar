import React, { useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { DROPDOWN_STATUS_OPTIONS } from '../utils/status';
import { calculateOptimalPosition } from '../utils/position';

interface StatusPickerModalProps {
  currentStatus: string;
  onClose: () => void;
  onSave: (status: string) => void;
  position: { top: number; left: number };
}

export const StatusPickerModal: React.FC<StatusPickerModalProps> = ({
  currentStatus,
  onClose,
  onSave,
  position,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [finalPosition, setFinalPosition] = useState(position);

  useEffect(() => {
    // Calculate optimal position after the component mounts
    if (modalRef.current) {
      // Create a temporary element to represent the source of the click
      const sourceEl = document.createElement('div');
      sourceEl.style.position = 'absolute';
      sourceEl.style.left = `${position.left}px`;
      sourceEl.style.top = `${position.top - 5}px`;  // 5px offset to represent the original element
      sourceEl.style.width = '100px';  // Approximate width
      sourceEl.style.height = '20px';  // Approximate height
      document.body.appendChild(sourceEl);

      // Calculate optimal position
      const optimalPosition = calculateOptimalPosition(sourceEl, modalRef.current, 10);
      setFinalPosition(optimalPosition);

      // Clean up temporary element
      document.body.removeChild(sourceEl);
    }
  }, [position]);

  useEffect(() => {
    // Close modal when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
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

  return (
    <div
      className="status-picker-modal"
      style={{
        top: `${finalPosition.top}px`,
        left: `${finalPosition.left}px`,
      }}
      ref={modalRef}
    >
      <div className="status-picker-header">
        <div className="status-picker-title">
          Task Status
        </div>
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
          {DROPDOWN_STATUS_OPTIONS.map((option) => (
            <div
              key={option.label}
              className={`status-picker-option ${option.value === currentStatus ? 'selected' : ''}`}
              onClick={() => handleStatusSelect(option.value)}
            >
              <div className="status-picker-checkbox">
                {option.value === currentStatus && <Check size={14} />}
              </div>
              <div className="status-picker-option-text">
                <span className="status-markdown-preview">[{option.value === ' ' ? ' ' : option.value}]</span>
                <span className="status-label">{option.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
