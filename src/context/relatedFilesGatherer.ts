import * as vscode from 'vscode';
import * as path from 'path';
import { RelatedFileContext } from './types';

const MAX_RELATED_FILES = 5;
const MAX_LINES_PER_FILE = 50;

/**
 * Gather context from other open editor tabs.
 * Returns the first ~50 lines (imports + top-level signatures) from
 * the most recently active tabs, excluding the current file.
 */
export function gatherRelatedFiles(
  currentFilePath: string
): RelatedFileContext[] {
  const result: RelatedFileContext[] = [];
  const seen = new Set<string>();
  seen.add(currentFilePath);

  // vscode.window.visibleTextEditors gives us currently visible editors
  // vscode.workspace.textDocuments gives us all open documents
  for (const doc of vscode.workspace.textDocuments) {
    if (result.length >= MAX_RELATED_FILES) break;

    const docPath = doc.uri.fsPath;

    // Skip current file, already-seen files, and non-file URIs
    if (seen.has(docPath)) continue;
    if (doc.uri.scheme !== 'file') continue;
    if (doc.isUntitled) continue;

    seen.add(docPath);

    const lineCount = Math.min(doc.lineCount, MAX_LINES_PER_FILE);
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
      lines.push(doc.lineAt(i).text);
    }

    const snippet = lines.join('\n');
    if (snippet.trim().length === 0) continue;

    result.push({
      fileName: path.basename(docPath),
      language: doc.languageId,
      snippet,
    });
  }

  return result;
}
