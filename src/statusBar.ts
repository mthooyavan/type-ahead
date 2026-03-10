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
    this.item.command = 'nerdCodeCompletion.toggle';
    this.setState('ready');
    this.item.show();
  }

  setState(state: StatusBarState): void {
    this.state = state;
    switch (state) {
      case 'ready':
        this.item.text = '$(sparkle) Nerd';
        this.item.tooltip = 'Nerd Code Completion: Ready (click to toggle)';
        this.item.backgroundColor = undefined;
        break;
      case 'loading':
        this.item.text = '$(loading~spin) Nerd';
        this.item.tooltip = 'Nerd Code Completion: Generating...';
        this.item.backgroundColor = undefined;
        break;
      case 'error':
        this.item.text = '$(warning) Nerd';
        this.item.tooltip = 'Nerd Code Completion: Error (click to toggle)';
        this.item.backgroundColor = new vscode.ThemeColor(
          'statusBarItem.warningBackground'
        );
        break;
      case 'disabled':
        this.item.text = '$(circle-slash) Nerd';
        this.item.tooltip = 'Nerd Code Completion: Disabled (click to toggle)';
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
