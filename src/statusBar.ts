import * as vscode from 'vscode';

export type StatusBarState = 'ready' | 'loading' | 'error' | 'disabled';

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private state: StatusBarState = 'ready';

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'claudeAutocomplete.toggle';
    this.setState('ready');
    this.item.show();
  }

  setState(state: StatusBarState): void {
    this.state = state;
    switch (state) {
      case 'ready':
        this.item.text = '$(sparkle) Claude';
        this.item.tooltip = 'Claude Autocomplete: Ready (click to toggle)';
        this.item.backgroundColor = undefined;
        break;
      case 'loading':
        this.item.text = '$(loading~spin) Claude';
        this.item.tooltip = 'Claude Autocomplete: Generating...';
        this.item.backgroundColor = undefined;
        break;
      case 'error':
        this.item.text = '$(warning) Claude';
        this.item.tooltip = 'Claude Autocomplete: Error (click to toggle)';
        this.item.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        break;
      case 'disabled':
        this.item.text = '$(circle-slash) Claude';
        this.item.tooltip = 'Claude Autocomplete: Disabled (click to toggle)';
        this.item.backgroundColor = undefined;
        break;
    }
  }

  getState(): StatusBarState {
    return this.state;
  }

  dispose(): void {
    this.item.dispose();
  }
}
