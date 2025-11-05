/**
 * Calculate the optimal position for modals and tooltips
 * to ensure they stay within the viewport and don't obscure content
 */
export function calculateOptimalPosition(
  targetEl: HTMLElement,
  modalEl: HTMLElement,
  offset = 10
): { top: number; left: number } {
  // Get dimensions and position of target
  const targetRect = targetEl.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Measure modal size after adding to DOM but before making visible
  modalEl.style.visibility = 'hidden';
  modalEl.style.display = 'block';

  // Get the closest container element (for calendar boundaries)
  const containerEl = targetEl.closest('.tasks-calendar-container');
  const containerRect = containerEl
    ? containerEl.getBoundingClientRect()
    : { top: 0, left: 0, right: viewportWidth, bottom: viewportHeight };

  // setTimeout is necessary to defer position calculation until after the browser render cycle
  // This ensures we get accurate measurements of the modal after it's been added to the DOM
  // Without this, dimensions might be incorrect as the browser hasn't fully processed the element
  setTimeout(() => {
    const modalRect = modalEl.getBoundingClientRect();

    // Center the tooltip horizontally below the event
    let left = targetRect.left + targetRect.width / 2 - modalRect.width / 2;
    let top = targetRect.bottom + offset;

    // Make sure the tooltip stays within the container horizontally
    if (left < containerRect.left + offset) {
      left = containerRect.left + offset;
    } else if (left + modalRect.width > containerRect.right - offset) {
      left = containerRect.right - modalRect.width - offset;
    }

    // If tooltip would go off bottom of container, position it above the event
    if (top + modalRect.height > containerRect.bottom - offset) {
      // Check if there's enough space above the event
      if (targetRect.top - modalRect.height - offset >= containerRect.top) {
        top = targetRect.top - modalRect.height - offset;
      } else {
        // Not enough space above or below, position at optimal location within container
        top = Math.max(
          containerRect.top + offset,
          Math.min(containerRect.bottom - modalRect.height - offset, top)
        );
      }
    }

    // Ensure we're not going outside the viewport in any case
    left = Math.max(
      offset,
      Math.min(viewportWidth - modalRect.width - offset, left)
    );
    top = Math.max(
      offset,
      Math.min(viewportHeight - modalRect.height - offset, top)
    );

    // Direct style manipulation is necessary here instead of returning values
    // because the component that calls this function may not immediately apply the position
    // This ensures the modal appears in the correct position as soon as it becomes visible
    // Without this, there could be a flash of content in the wrong position
    modalEl.style.left = `${left}px`;
    modalEl.style.top = `${top}px`;
    modalEl.style.visibility = 'visible';
  }, 50);

  // Return initial position which will be updated by setTimeout
  // This is needed for React components that require an initial position value
  // The actual positioning is handled by the setTimeout callback above
  return { top: targetRect.bottom + offset, left: targetRect.left };
}
