const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const config = require('../config');

const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');
const DATA_FILE = path.join(__dirname, '..', 'data', 'app_data.json');

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function loadFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return [{ text: data.text, page: 1 }];
  }

  if (ext === '.docx') {
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return [{ text: result.value, page: 1 }];
  }

  // txt or fallback
  const content = await fs.readFile(filePath, 'utf-8');
  return [{ text: content, page: 1 }];
}

function chunkText(text, chunkSize = config.doc.chunkSize, overlap = config.doc.chunkOverlap) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).replace(/\n/g, ' '));
    start += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Parse article front matter (Title, Date, Source, Summary, Article)
 * Returns { meta, body } - works with plain text and markdown-ish formats
 */
function parseArticleMeta(rawText) {
  const meta = { title: '', date: '', source: '', summary: '' };
  let body = rawText;

  const lines = rawText.split(/\r?\n/);
  const headerEnd = lines.findIndex((_, i) => {
    const line = lines[i].trim();
    // Look for the "Article:" marker or a blank-line transition after headers
    if (/^Article\s*:/i.test(line)) return true;
    // If we've seen at least 2 meta fields and hit an empty line followed by long text
    if (i > 4 && line === '' && i + 1 < lines.length && lines[i + 1].trim().length > 80) return true;
    return false;
  });

  const headerLines = headerEnd >= 0 ? lines.slice(0, headerEnd + 1) : lines.slice(0, Math.min(8, lines.length));

  for (let i = 0; i < headerLines.length; i++) {
    const line = headerLines[i].trim();
    // Match both "Key: value" and "Key:" (empty value) patterns
    const m = line.match(/^(Title|Date|Source|Summary|标题|日期|来源|摘要)\s*[:：]\s*(.+)/i)
           || line.match(/^(Title|Date|Source|Summary|标题|日期|来源|摘要)\s*[:：]\s*$/i);
    if (m) {
      const key = m[1].toLowerCase();
      let val = (m[2] || '').trim();
      // If value is empty, grab the next non-empty, non-header line
      if (!val) {
        let j = i + 1;
        while (j < headerLines.length && !val) {
          const next = headerLines[j].trim();
          if (next && !/^(Title|Date|Source|Summary|Article|标题|日期|来源|摘要)\s*[:：]/i.test(next)) {
            val = next;
          }
          j++;
        }
      }
      if (key === 'title' || key === '标题') meta.title = val;
      else if (key === 'date' || key === '日期') meta.date = val;
      else if (key === 'source' || key === '来源') meta.source = val;
      else if (key === 'summary' || key === '摘要') meta.summary = val;
    }
  }

  // Body = everything after the Article: marker, or after first blank line post-headers
  if (headerEnd >= 0) {
    const articleMatch = lines[headerEnd].match(/^Article\s*[:：]\s*(.*)/i);
    if (articleMatch && articleMatch[1]) {
      body = lines.slice(headerEnd).join('\n').replace(/^Article\s*[:：]\s*/, '');
    } else if (headerEnd + 1 < lines.length) {
      body = lines.slice(headerEnd + 1).join('\n').trim();
    }
  }

  return { meta, body: body || rawText };
}

async function processDocument(filePath, fileName) {
  const pages = await loadFile(filePath);
  const allChunks = [];

  for (const page of pages) {
    const chunks = chunkText(page.text);
    allChunks.push(...chunks.map((text, i) => ({
      text,
      source: fileName,
      index: i,
    })));
  }

  return allChunks;
}

// Data persistence (replaces Python data_persistence_utils)
function generateFileHash(content) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(content).digest('hex');
}

async function saveGraphData(hash, data) {
  await ensureCacheDir();
  const filePath = path.join(CACHE_DIR, `${hash}_graph_data.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function loadGraphData(hash) {
  const filePath = path.join(CACHE_DIR, `${hash}_graph_data.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadAppData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  loadFile, chunkText, processDocument, parseArticleMeta,
  generateFileHash, saveGraphData, loadGraphData, loadAppData,
  CACHE_DIR,
};
