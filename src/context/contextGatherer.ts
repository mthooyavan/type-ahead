import * as vscode from 'vscode';
import * as path from 'path';
import { CodeContext } from './types';
import { gatherRelatedFiles } from './relatedFilesGatherer';

export function gatherContext(
  document: vscode.TextDocument,
  position: vscode.Position,
  contextLines: number
): CodeContext {
  const totalLines = document.lineCount;
  const cursorLine = position.line;
  const cursorColumn = position.character;

  // Calculate the line range for context window
  const startLine = Math.max(0, cursorLine - contextLines);
  const endLine = Math.min(totalLines - 1, cursorLine + contextLines);

  // Build prefix: from startLine to cursor position
  const prefixLines: string[] = [];
  for (let i = startLine; i < cursorLine; i++) {
    prefixLines.push(document.lineAt(i).text);
  }
  // Add the current line up to cursor position
  const currentLineText = document.lineAt(cursorLine).text;
  prefixLines.push(currentLineText.substring(0, cursorColumn));
  const prefix = prefixLines.join('\n');

  // Build suffix: from cursor position to endLine
  const suffixLines: string[] = [];
  // Add rest of current line after cursor
  suffixLines.push(currentLineText.substring(cursorColumn));
  for (let i = cursorLine + 1; i <= endLine; i++) {
    suffixLines.push(document.lineAt(i).text);
  }
  const suffix = suffixLines.join('\n');

  const filePath = document.uri.fsPath;
  const fileName = path.basename(filePath);

  const relatedFiles = gatherRelatedFiles(filePath);

  return {
    prefix,
    suffix,
    language: document.languageId,
    fileName,
    filePath,
    cursorLine,
    cursorColumn,
    relatedFiles,
  };
}
