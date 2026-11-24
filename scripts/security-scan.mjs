import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.js', '.mjs', '.cjs', '.json', '.webmanifest',
  '.css', '.xml', '.txt', '.md', '.yml', '.yaml', '.toml', '.svg'
]);

const DEFAULT_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.wrangler', 'worker/.wrangler']);

export const SECRET_PATTERNS = [
  { name: 'google-api-key', pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'github-token', pattern: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'bearer-token', pattern: /Bearer\s+[A-Za-z0-9._~+/-]{30,}=*/g },
  {
    name: 'gemini-assignment',
    pattern: /(?:^|[^.\w])(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*[:=]\s*['"]?([A-Za-z0-9_-]{12,})['"]?/gm
  },
  {
    name: 'unsplash-assignment',
    pattern: /(?:^|[^.\w])(?:UNSPLASH_ACCESS_KEY|UNSPLASH_SECRET_KEY)\s*[:=]\s*['"]?([A-Za-z0-9_-]{12,})['"]?/gm
  }
];

const FRONTEND_HOST_PATTERNS = [
  { name: 'frontend-unsplash-api', pattern: /api\.unsplash\.com/g },
  { name: 'frontend-gemini-api', pattern: /generativelanguage\.googleapis\.com/g },
  { name: 'frontend-unsplash-client-id', pattern: /[?&]client_id=/g }
];

function isPlaceholder(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  return /^(?:replace|your|example|test|dummy|fake|changeme|placeholder|xxx|redacted|local|none|null|undefined|\$|process\.env|import\.meta)/.test(normalized);
}

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function shouldSkipFile(fileName, allowDevSecrets) {
  if (fileName === '.dev.vars' && allowDevSecrets) return true;
  if (fileName.startsWith('.env') && allowDevSecrets) return true;
  return false;
}

export function scanText(text, label, options = {}) {
  const findings = [];
  const includeFrontendHosts = options.includeFrontendHosts === true;
  const patterns = includeFrontendHosts
    ? SECRET_PATTERNS.concat(FRONTEND_HOST_PATTERNS)
    : SECRET_PATTERNS;

  for (const { name, pattern } of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (name.endsWith('-assignment') && isPlaceholder(match[1])) continue;
      findings.push({ label, kind: name });
    }
  }
  return findings;
}

export function walkFiles(root, options = {}) {
  const files = [];
  const skipDirs = options.skipDirs || DEFAULT_SKIP_DIRS;
  const maxBytes = options.maxBytes || 5_000_000;

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).replaceAll('\\', '/');

      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name) || skipDirs.has(relative)) continue;
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (shouldSkipFile(entry.name, options.allowDevSecrets === true)) continue;
      if (!isTextFile(absolute)) continue;

      try {
        if (fs.statSync(absolute).size > maxBytes) continue;
      } catch (_) {
        continue;
      }
      files.push(absolute);
    }
  }

  walk(root);
  return files;
}

export function scanDirectory(root, options = {}) {
  const findings = [];
  for (const filePath of walkFiles(root, options)) {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      continue;
    }
    const label = path.relative(root, filePath).replaceAll('\\', '/');
    findings.push(...scanText(text, label, options));
  }
  return findings;
}

function main() {
  const root = path.resolve(process.argv[2] || process.cwd());
  const findings = scanDirectory(root, {
    includeFrontendHosts: false,
    allowDevSecrets: true
  });

  if (findings.length) {
    console.error('Potential secrets or unsafe frontend API usage found:');
    for (const finding of findings) {
      console.error('- ' + finding.kind + ' in ' + finding.label);
    }
    process.exitCode = 1;
    return;
  }
  console.log('No credential patterns found outside ignored local secret files.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
