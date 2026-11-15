#!/usr/bin/env node
// Builds the Firefox extension from the userscript without changing its code.
// Usage: node scripts/build-extension.mjs [--out dist]
// Output: <out>/firefox/ (unpacked, for about:debugging or web-ext) and
//         <out>/chatgpt-reference-menu-enhancer-<version>-firefox.zip (for addons.mozilla.org).
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USERSCRIPT = join(ROOT, 'chatgpt-reference-menu.user.js');
const ICONS = join(ROOT, 'extension', 'icons');
const CONTENT_SCRIPT = 'reference-menu.js';
const ICON_SIZES = [16, 32, 48, 96, 128];
export const GECKO_ID = 'chatgpt-reference-menu-enhancer@csjune';

// Userscript locale -> WebExtension _locales directory.
const LOCALES = { en: 'en', ko: 'ko', ja: 'ja', 'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW', es: 'es', fr: 'fr', de: 'de', 'pt-BR': 'pt_BR', ru: 'ru' };

export function isValidMatchPattern(pattern) {
  return /^https:\/\/(?:\*|\*\.[a-z0-9-]+(?:\.[a-z0-9-]+)+|[a-z0-9-]+(?:\.[a-z0-9-]+)+)\/\S*$/i.test(pattern);
}

export function readMetadata(source) {
  const text = String(source).replace(/\r\n?/g, '\n');
  const block = text.match(/\/\/ ==UserScript==\n([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!block) throw new Error('Userscript metadata block not found');
  const meta = {};
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\/\/ @([^\s]+)(?:\s+(.*?))?\s*$/);
    if (m) (meta[m[1]] ??= []).push(m[2] ?? '');
  }
  const one = key => {
    if (!meta[key]?.[0]) throw new Error(`Missing @${key}`);
    return meta[key][0];
  };
  const version = one('version');
  if (!/^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}$/.test(version) ||
      version.split('.').some(part => Number(part) > 65535)) {
    throw new Error(`@version ${version} is not a valid extension version`);
  }
  const statusVersion = text.match(/\bversion:\s*'([^']+)'/)?.[1];
  if (!statusVersion || statusVersion !== version) {
    throw new Error(`Runtime status version ${statusVersion || '(missing)'} does not match @version ${version}`);
  }
  const defaultName = one('name');
  const defaultDescription = one('description');
  for (const key of Object.keys(meta)) {
    const locale = key.match(/^(?:name|description):(.+)$/)?.[1];
    if (locale && !Object.hasOwn(LOCALES, locale)) {
      throw new Error(`Unsupported @${key} locale`);
    }
  }
  const messages = {};
  for (const [locale, dir] of Object.entries(LOCALES)) {
    messages[dir] = {
      name: locale === 'en' ? (meta['name:en']?.[0] || defaultName) : one(`name:${locale}`),
      description: locale === 'en' ? (meta['description:en']?.[0] || defaultDescription) : one(`description:${locale}`),
    };
  }
  if (!meta.match?.length) throw new Error('Missing @match');
  if (meta.match.some(pattern => !isValidMatchPattern(pattern))) {
    throw new Error('The extension build expects https:// @match patterns');
  }
  if (!meta.grant?.length || meta.grant.some(g => g !== 'none')) {
    throw new Error('The extension build expects @grant none');
  }
  if (one('run-at') !== 'document-start') throw new Error('The extension build expects @run-at document-start');
  if (one('sandbox') !== 'raw') throw new Error('The extension build expects @sandbox raw');
  if (!meta.noframes?.length) throw new Error('The extension build expects @noframes');
  return { version, author: one('author'), matches: meta.match, messages };
}

export function escapeMessage(text) {
  return String(text).replace(/\$/g, () => '$$');
}

export function buildManifest(meta, { extraMatches = [], extraScripts = [] } = {}) {
  if (extraMatches.some(pattern => !isValidMatchPattern(pattern))) {
    throw new Error('The extension build expects https:// extraMatches patterns');
  }
  return {
    manifest_version: 3,
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    version: meta.version,
    default_locale: 'en',
    author: meta.author,
    homepage_url: 'https://github.com/csjune/chatgpt-reference-menu-enhancer',
    icons: Object.fromEntries(ICON_SIZES.map(size => [String(size), `icons/icon-${size}.png`])),
    content_scripts: [{
      matches: [...meta.matches, ...extraMatches],
      js: [...extraScripts, CONTENT_SCRIPT],
      run_at: 'document_start',
      world: 'MAIN',
      all_frames: false,
    }],
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] },
      },
      gecko_android: {
        strict_min_version: '142.0',
      },
    },
  };
}

// Writes the unpacked extension. extraFiles maps a path inside the extension to file contents (tests only).
export function buildExtension(outDir, { extraMatches = [], extraFiles = {}, userscriptPath = USERSCRIPT } = {}) {
  const source = readFileSync(userscriptPath, 'utf8').replace(/\r\n?/g, '\n');
  const meta = readMetadata(source);
  const rootOut = resolve(outDir);
  const resolvedExtra = [];
  for (const [entryPath, text] of Object.entries(extraFiles)) {
    if (!entryPath || entryPath.startsWith('/') || entryPath.includes('\\')) {
      throw new Error(`Invalid extra file path: ${entryPath}`);
    }
    const file = resolve(rootOut, entryPath);
    const rel = relative(rootOut, file);
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || rel.split(sep).includes('..')) {
      throw new Error(`Extra file path escapes extension directory: ${entryPath}`);
    }
    const posixRel = rel.split(sep).join('/');
    if (posixRel === 'manifest.json' || posixRel === CONTENT_SCRIPT ||
        posixRel === 'icons' || posixRel.startsWith('icons/') ||
        posixRel === '_locales' || posixRel.startsWith('_locales/')) {
      throw new Error(`Extra file collides with generated extension file: ${entryPath}`);
    }
    resolvedExtra.push([posixRel, file, text]);
  }
  rmSync(rootOut, { recursive: true, force: true });
  mkdirSync(join(rootOut, 'icons'), { recursive: true });
  const manifest = buildManifest(meta, { extraMatches, extraScripts: resolvedExtra.map(([posixRel]) => posixRel) });
  writeFileSync(join(rootOut, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(rootOut, CONTENT_SCRIPT), source);
  for (const [, file, text] of resolvedExtra) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  for (const size of ICON_SIZES) copyFileSync(join(ICONS, `icon-${size}.png`), join(rootOut, 'icons', `icon-${size}.png`));
  for (const [dir, { name, description }] of Object.entries(meta.messages)) {
    mkdirSync(join(rootOut, '_locales', dir), { recursive: true });
    const messages = {
      extName: { message: escapeMessage(name) },
      extDescription: { message: escapeMessage(description) },
    };
    writeFileSync(join(rootOut, '_locales', dir, 'messages.json'), JSON.stringify(messages, null, 2) + '\n');
  }
  return { version: meta.version, manifest };
}

function listFiles(dir) {
  return readdirSync(dir).sort().flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

// Minimal deterministic ZIP writer (deflate, fixed 1980-01-01 timestamps).
export function zipDirectory(dir, zipPath) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const file of listFiles(dir)) {
    const name = Buffer.from(relative(dir, file).split(sep).join('/'));
    const data = readFileSync(file);
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8); header.writeUInt16LE(0, 10); header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26); header.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(header, name, packed);
    centrals.push(central, name);
    offset += header.length + name.length + packed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  const count = centrals.length / 2;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  mkdirSync(dirname(zipPath), { recursive: true });
  writeFileSync(zipPath, Buffer.concat([...locals, ...centrals, end]));
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  let out = join(ROOT, 'dist');
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error('--out requires a directory path');
      out = resolve(value);
    } else if (arg.startsWith('--out=')) {
      const value = arg.slice('--out='.length);
      if (!value) throw new Error('--out requires a directory path');
      out = resolve(value);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { out };
}

export function packageExtension({ out = join(ROOT, 'dist'), userscriptPath = USERSCRIPT } = {}) {
  const targetOut = resolve(out);
  const unpacked = join(targetOut, 'firefox');
  const { version } = buildExtension(unpacked, { userscriptPath });
  for (const entry of readdirSync(targetOut)) {
    if (/^chatgpt-reference-menu-enhancer-.*-firefox\.zip$/.test(entry)) {
      rmSync(join(targetOut, entry), { force: true });
    }
  }
  const zip = join(targetOut, `chatgpt-reference-menu-enhancer-${version}-firefox.zip`);
  zipDirectory(unpacked, zip);
  return { version, unpacked, zip };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out } = parseCliArgs();
  const { unpacked, zip } = packageExtension({ out });
  console.log(`Built ${relative(process.cwd(), unpacked) || '.'} and ${relative(process.cwd(), zip)}`);
}
