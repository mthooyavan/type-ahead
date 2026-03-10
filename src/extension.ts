import * as vscode from 'vscode';
import { getConfig, onConfigChange } from './config/configManager';
import { ClaudeAgentBackend } from './backend/claudeAgentBackend';
import { ClaudeCompletionProvider } from './completionProvider';

let provider: ClaudeCompletionProvider | null = null;
let providerDisposable: vscode.Disposable | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const config = getConfig();

  // Create backend and provider
  const backend = new ClaudeAgentBackend(config);
  provider = new ClaudeCompletionProvider(backend, config);

  // Register inline completion provider for all languages
  providerDisposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    provider
  );
  context.subscriptions.push(providerDisposable);

  // Toggle command
  const toggleCommand = vscode.commands.registerCommand(
    'claudeAutocomplete.toggle',
    async () => {
      const vsConfig = vscode.workspace.getConfiguration('claudeAutocomplete');
      const current = vsConfig.get<boolean>('enabled', true);
      await vsConfig.update('enabled', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Claude Autocomplete: ${!current ? 'Enabled' : 'Disabled'}`
      );
    }
  );
  context.subscriptions.push(toggleCommand);

  // Listen for config changes and update provider
  const configWatcher = onConfigChange(() => {
    const newConfig = getConfig();
    if (provider) {
      provider.updateConfig(newConfig);
    }
    backend.updateConfig(newConfig);
  });
  context.subscriptions.push(configWatcher);

  console.log('Claude Autocomplete: activated');
}

export function deactivate(): void {
  if (provider) {
    provider.dispose();
    provider = null;
  }
  console.log('Claude Autocomplete: deactivated');
}
