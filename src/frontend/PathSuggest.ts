import { AbstractInputSuggest, App, TFolder } from 'obsidian';

export class PathSuggest extends AbstractInputSuggest<string> {
  private onSelectCallback: (value: string) => void;
  private filter?: (path: string) => boolean;

  constructor(
    app: App,
    inputEl: HTMLInputElement,
    onSelect: (value: string) => void,
    filter?: (path: string) => boolean
  ) {
    super(app, inputEl);
    this.onSelectCallback = onSelect;
    this.filter = filter;
  }

  getSuggestions(query: string): string[] {
    const lower = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .map(f => (f instanceof TFolder ? f.path + '/' : f.path))
      .filter(p => p.toLowerCase().includes(lower))
      .filter(p => !this.filter || this.filter(p))
      .slice(0, 50);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    this.setValue(value);
    this.onSelectCallback(value);
    this.close();
  }
}
