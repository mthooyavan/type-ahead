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
    this.item.command = 'typeAhead.toggle';
    this.setState('ready');
    this.item.show();
  }

  setState(state: StatusBarState): void {
    this.state = state;
    switch (state) {
      case 'ready':
        this.item.text = '$(sparkle) Type Ahead';
        this.item.tooltip = 'Type Ahead: Ready (click to toggle)';
        this.item.backgroundColor = undefined;
        break;
      case 'loading':
        this.item.text = '$(loading~spin) Type Ahead';
        this.item.tooltip = 'Type Ahead: Generating...';
        this.item.backgroundColor = undefined;
        break;
      case 'error':
        this.item.text = '$(warning) Type Ahead';
        this.item.tooltip = 'Type Ahead: Error (click to toggle)';
        this.item.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        break;
      case 'disabled':
        this.item.text = '$(circle-slash) Type Ahead';
        this.item.tooltip = 'Type Ahead: Disabled (click to toggle)';
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
