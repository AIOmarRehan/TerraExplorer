import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDirectory } from './security-scan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const FILES = [
  'index.html',
  'map.html',
  '404.html',
  'config.public.js',
  'countries-data.js',
  'earth-anim.json',
  'map-anim.json',
  'site.webmanifest',
  'browserconfig.xml',
  'LICENSE'
];

const DIRECTORIES = ['favicon'];


const LEGACY_SHIM = `/*
 *  TERRAEXPLORER SECURITY SYSTEM v2.0
 *
 *  OH! LOOK WHO'S HERE!
 *
 *  Trying to steal my Gemini API key?
 *  Looking for my Unsplash credentials?
 *
 *  HAHAHA HABIBI, NOOOOO!
 *
 *  Nice try, hacker! You found the decoy.
 *
 *  My real API keys are safely stored inside
 *  my Cloudflare Worker. Not in your browser!
 *
 *  Frontend secrets? NEVER, HABIBI.
 *
 *  I'M A GOOD AND EXPERIENCED SWE!
 *
 *  Now go explore the world instead.
 *  Nothing to steal here, Sherlock!
 */

var GEMINI_API_KEY = '';
var UNSPLASH_ACCESS_KEY = '';

// All API requests are handled by the Cloudflare Worker.
`;

function fail(message) {
  console.error('Build failed: ' + message);
  process.exit(1);
}

function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const destination = path.join(dist, relativePath);
  if (!fs.existsSync(source)) fail('missing required file: ' + relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectory(relativePath) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    fail('missing required directory: ' + relativePath);
  }
  fs.cpSync(source, path.join(dist, relativePath), { recursive: true });
}

function validateApiBaseUrl(value) {
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    fail('PUBLIC_API_BASE_URL is not a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    const isLocal = parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    if (!isLocal) fail('PUBLIC_API_BASE_URL must use https (http is allowed only for localhost)');
  }
  if (parsed.username || parsed.password) fail('PUBLIC_API_BASE_URL must not contain credentials');
  if (parsed.search || parsed.hash) fail('PUBLIC_API_BASE_URL must not contain a query or fragment');
  if (parsed.pathname && parsed.pathname !== '/') {
    fail('PUBLIC_API_BASE_URL must be an origin only (for example https://name.workers.dev)');
  }
  return parsed.origin;
}

function applyApiBaseUrl() {
  const raw = process.env.PUBLIC_API_BASE_URL || '';
  if (!raw.trim()) return;

  const apiBaseUrl = validateApiBaseUrl(raw.trim());
  const configPath = path.join(dist, 'config.public.js');
  const config = fs.readFileSync(configPath, 'utf8');
  // Anchor to the start of a line so the example inside the comment block
  // (" *   apiBaseUrl: '...'") is never the one that gets replaced.
  const replaced = config.replace(
    /^(\s*)apiBaseUrl\s*:\s*(['"])[^'"\r\n]*\2/m,
    (_, indent) => indent + 'apiBaseUrl: ' + JSON.stringify(apiBaseUrl)
  );
  if (replaced === config) fail('could not find apiBaseUrl in config.public.js');
  fs.writeFileSync(configPath, replaced, 'utf8');
  console.log('Applied PUBLIC_API_BASE_URL to dist/config.public.js');
}

function validateHtmlReferences() {
  const htmlFiles = FILES.filter((file) => file.endsWith('.html'));
  const referencePattern = /(?:src|href)\s*=\s*["']([^"']+)["']/gi;

  for (const file of htmlFiles) {
    const filePath = path.join(dist, file);
    const html = fs.readFileSync(filePath, 'utf8');
    // 404.html has no API features, so only the app pages need the config.
    if (file !== '404.html' && !html.includes('config.public.js')) {
      fail(file + ' does not load config.public.js');
    }
    if (/<script[^>]+src=["']config\.js["']/i.test(html)) {
      fail(file + ' still loads the legacy config.js');
    }

    let match;
    while ((match = referencePattern.exec(html)) !== null) {
      const reference = match[1].trim();
      if (!reference || reference.startsWith('#') || reference.startsWith('/')) continue;
      if (/^(?:https?:|data:|mailto:|javascript:|tel:)/i.test(reference)) continue;

      const clean = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
      if (!clean) continue;
      const target = path.resolve(path.dirname(filePath), clean);
      const relative = path.relative(dist, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        fail(file + ' references a file outside dist: ' + reference);
      }
      if (!fs.existsSync(target)) {
        fail(file + ' references a missing local file: ' + reference);
      }
    }
  }
}

function validateNoSecrets() {
  const findings = scanDirectory(dist, {
    includeFrontendHosts: true,
    allowDevSecrets: false
  });

  if (findings.length) {
    for (const finding of findings) {
      console.error('Secret/safety finding: ' + finding.kind + ' in dist/' + finding.label);
    }
    fail('the deployable artifact contains credentials or direct third-party API calls');
  }
}

function validateArtifact() {
  const forbidden = [
    'Earth.gif',
    'earth.lottie',
    'map.lottie',
    '_passport-review.html',
    'README.md',
    'scripts',
    'worker',
    '.github'
  ];
  for (const name of forbidden) {
    if (fs.existsSync(path.join(dist, name))) {
      fail('source-only file must not be deployed: ' + name);
    }
  }

  const legacyShimPath = path.join(dist, 'config.js');
  if (!fs.existsSync(legacyShimPath)) fail('legacy config.js shim was not generated');
  const shim = fs.readFileSync(legacyShimPath, 'utf8');
  if (!/var GEMINI_API_KEY = '';/.test(shim) || !/var UNSPLASH_ACCESS_KEY = '';/.test(shim)) {
    fail('legacy config.js shim is not sanitized');
  }
}

function directorySize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    total += entry.isDirectory() ? directorySize(absolute) : fs.statSync(absolute).size;
  }
  return total;
}

function build() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });

  for (const file of FILES) copyFile(file);
  for (const directory of DIRECTORIES) copyDirectory(directory);

  applyApiBaseUrl();
  fs.writeFileSync(path.join(dist, 'config.js'), LEGACY_SHIM, 'utf8');

  validateHtmlReferences();
  validateNoSecrets();
  validateArtifact();

  const size = directorySize(dist);
  console.log('Built dist/ (' + (size / 1024).toFixed(1) + ' KiB)');
  console.log('Files: ' + fs.readdirSync(dist).sort().join(', '));
}

build();
