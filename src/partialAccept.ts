import * as vscode from 'vscode';

/**
 * Extract the next word from a completion string.
 * A "word" is a sequence of word characters, or a sequence of non-word non-whitespace characters.
 */
export function extractNextWord(text: string): string {
  if (!text) return '';

  // Match leading whitespace + next word-like token
  const match = text.match(/^(\s*\S+)/);
  return match ? match[1] : text;
}

/**
 * Extract the next line from a completion string (up to and including the first newline).
 */
export function extractNextLine(text: string): string {
  if (!text) return '';

  const newlineIdx = text.indexOf('\n');
  if (newlineIdx === -1) {
    return text; // No newline — return everything
  }
  return text.substring(0, newlineIdx + 1);
}

/**
 * Register partial acceptance commands.
 * These commands insert a portion of the current inline suggestion.
 */
export function registerPartialAcceptCommands(
  context: vscode.ExtensionContext,
  getLastCompletion: () => string | null
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('typeAhead.acceptWord', async () => {
      const completion = getLastCompletion();
      if (!completion) return;

      const word = extractNextWord(completion);
      if (!word) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      // Dismiss the current inline suggestion
      await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');

      // Insert the word at cursor
      await editor.edit((editBuilder) => {
        editBuilder.insert(editor.selection.active, word);
      });

      // Re-trigger to show remaining completion
      await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('typeAhead.acceptLine', async () => {
      const completion = getLastCompletion();
      if (!completion) return;

      const line = extractNextLine(completion);
      if (!line) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      await vscode.commands.executeCommand('editor.action.inlineSuggest.hide');

      await editor.edit((editBuilder) => {
        editBuilder.insert(editor.selection.active, line);
      });

      await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
    })
  );
}
