import * as path from 'path';

/** Check if a file path matches any of the given glob patterns. */
export function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }

  const normalized = filePath.replace(/\\/g, '/');
  const fileName = path.basename(filePath);

  for (const pattern of patterns) {
    if (matchesPattern(normalized, fileName, pattern)) {
      return true;
    }
  }

  return false;
}

function matchesPattern(normalizedPath: string, fileName: string, pattern: string): boolean {
  const p = pattern.trim();
  if (!p) {
    return false;
  }

  // `**/*.ext` or `*.ext` → extension match
  if (p.startsWith('*.') || p.startsWith('**/*.')) {
    const ext = p.startsWith('**/*.') ? p.slice(4) : p.slice(1);
    return fileName.endsWith(ext);
  }

  // `**/folder/**` → path contains /folder/
  if (p.startsWith('**/') && p.endsWith('/**')) {
    const segment = p.slice(3, -3);
    return normalizedPath.includes(`/${segment}/`);
  }

  // `**/name` → file/folder name appears anywhere in path
  if (p.startsWith('**/')) {
    const suffix = p.slice(3);
    return normalizedPath.endsWith(`/${suffix}`) || fileName === suffix;
  }

  // Exact file name match (e.g., `.env`, `.gitignore`)
  if (!p.includes('/') && !p.includes('*')) {
    return fileName === p;
  }

  // Path suffix match (e.g., `src/secret.ts`)
  if (!p.includes('*')) {
    return normalizedPath.endsWith(`/${p}`) || normalizedPath === p;
  }

  return false;
}
