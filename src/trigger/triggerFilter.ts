import * as vscode from 'vscode';

const SKIP_AFTER_CHARS = new Set(['}', ']', ')', ';']);

/**
 * Determine whether autocomplete should trigger at the given position.
 * Returns false for positions where completions are unlikely to be useful.
 * Intentionally permissive — it's better to make an API call that returns
 * nothing than to block a legitimate completion.
 */
export function shouldTrigger(
  document: vscode.TextDocument,
  position: vscode.Position
): boolean {
  const line = document.lineAt(position.line);
  const lineText = line.text;
  const textBeforeCursor = lineText.substring(0, position.character);
  const trimmedBefore = textBeforeCursor.trimStart();

  // Skip if cursor is right after a closing bracket/brace/paren/semicolon
  // (comma removed — completions after comma in arg lists are useful)
  if (trimmedBefore.length > 0) {
    const lastChar = trimmedBefore[trimmedBefore.length - 1];
    if (SKIP_AFTER_CHARS.has(lastChar)) {
      return false;
    }
  }

  return true;
}
