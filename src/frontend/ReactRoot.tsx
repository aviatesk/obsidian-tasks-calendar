import React from 'react';
import ReactDOM from 'react-dom/client';

export class ReactRenderer {
  private root: HTMLElement;
  private reactRoot: ReactDOM.Root | null = null;

  constructor(container: HTMLElement) {
    this.root = container;
  }

  render(component: React.ReactNode): void {
    if (!this.reactRoot) {
      this.reactRoot = ReactDOM.createRoot(this.root);
    }
    this.reactRoot.render(component);
  }

  unmount(): void {
    if (this.reactRoot) {
      this.reactRoot.unmount();
      this.reactRoot = null;
    }
  }
}
