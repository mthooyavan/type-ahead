import * as vscode from 'vscode';

/**
 * Find the enclosing function or class at the cursor position.
 * Returns a description like "Inside function getUserById(id: string)" or null.
 * Uses VS Code's DocumentSymbolProvider for language-agnostic symbol detection.
 */
export async function getEnclosingSymbol(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<string | null> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      document.uri
    );

    if (!symbols || symbols.length === 0) {
      return null;
    }

    const enclosing = findEnclosingSymbol(symbols, position);
    if (!enclosing) {
      return null;
    }

    return formatSymbol(enclosing, document);
  } catch {
    // Symbol provider not available for this language — that's fine
    return null;
  }
}

function findEnclosingSymbol(
  symbols: vscode.DocumentSymbol[],
  position: vscode.Position
): vscode.DocumentSymbol | null {
  for (const symbol of symbols) {
    if (containsPosition(symbol.range, position)) {
      // Check children for a more specific match
      const child = findEnclosingSymbol(symbol.children, position);
      if (child) {
        return child;
      }
      // Only return functions, methods, classes, interfaces
      if (isRelevantSymbol(symbol)) {
        return symbol;
      }
    }
  }
  return null;
}

function containsPosition(range: vscode.Range, position: vscode.Position): boolean {
  if (position.line < range.start.line || position.line > range.end.line) {
    return false;
  }
  if (position.line === range.start.line && position.character < range.start.character) {
    return false;
  }
  if (position.line === range.end.line && position.character > range.end.character) {
    return false;
  }
  return true;
}

function isRelevantSymbol(symbol: vscode.DocumentSymbol): boolean {
  const kind = symbol.kind;
  return (
    kind === vscode.SymbolKind.Function ||
    kind === vscode.SymbolKind.Method ||
    kind === vscode.SymbolKind.Class ||
    kind === vscode.SymbolKind.Interface ||
    kind === vscode.SymbolKind.Constructor
  );
}

function formatSymbol(symbol: vscode.DocumentSymbol, document: vscode.TextDocument): string {
  const kind = symbol.kind;
  const kindName =
    kind === vscode.SymbolKind.Function ? 'function' :
    kind === vscode.SymbolKind.Method ? 'method' :
    kind === vscode.SymbolKind.Class ? 'class' :
    kind === vscode.SymbolKind.Interface ? 'interface' :
    kind === vscode.SymbolKind.Constructor ? 'constructor' :
    'symbol';

  // Get the first line of the symbol definition (the signature)
  const firstLine = document.lineAt(symbol.range.start.line).text.trim();

  return `Inside ${kindName}: ${firstLine}`;
}
