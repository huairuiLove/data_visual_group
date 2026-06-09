const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const config = require('../config');

const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');
const DATA_FILE = path.join(__dirname, '..', 'data', 'app_data.json');
const PARENT_CHUNK_SIZE = 2400;
const PARENT_CHUNK_OVERLAP = 240;
const CHILD_CHUNK_SIZE = 700;
const CHILD_CHUNK_OVERLAP = 120;
const DEFAULT_SECTION_TITLE = '全文';

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

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitOversizedUnit(unit, maxSize) {
  if (unit.length <= maxSize) return [unit];
  const sentences = unit
    .split(/(?<=[。！？!?；;.!?])\s+|(?<=[。！？!?；;.!?])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pieces = [];
  let current = '';
  for (const sentence of sentences.length ? sentences : [unit]) {
    if ((current + sentence).length <= maxSize) {
      current += current ? ` ${sentence}` : sentence;
    } else {
      if (current) pieces.push(current);
      if (sentence.length <= maxSize) {
        current = sentence;
      } else {
        for (let i = 0; i < sentence.length; i += maxSize) pieces.push(sentence.slice(i, i + maxSize));
        current = '';
      }
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function splitTextUnits(text, maxUnitSize) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return paragraphs.flatMap((paragraph) => splitOversizedUnit(paragraph, maxUnitSize));
}

function slugText(text, fallback) {
  const slug = String(text || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')
    .slice(0, 60);
  return slug || fallback;
}

function splitSections(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const lines = normalized.split('\n');
  const sections = [];
  let current = { title: DEFAULT_SECTION_TITLE, level: 0, lines: [] };
  const headingRe = /^(#{1,6})\s+(.+)$|^(第[一二三四五六七八九十百千万0-9]+[章节部篇].*)$|^([0-9]+(?:\.[0-9]+)*[、.]\s*.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(headingRe);
    if (match && current.lines.join('\n').trim()) {
      sections.push(current);
      const title = match[2] || match[3] || match[4] || trimmed;
      const level = match[1] ? match[1].length : match[4] ? String(match[4]).split('.').length : 1;
      current = { title: title.trim(), level, lines: [] };
    } else if (match && !current.lines.join('\n').trim()) {
      current.title = (match[2] || match[3] || match[4] || trimmed).trim();
      current.level = match[1] ? match[1].length : 1;
    } else {
      current.lines.push(line);
    }
  }

  if (current.lines.join('\n').trim()) sections.push(current);
  if (!sections.length) return [{ title: DEFAULT_SECTION_TITLE, level: 0, text: normalized, path: [DEFAULT_SECTION_TITLE], index: 0 }];

  const stack = [];
  return sections.map((section, index) => {
    while (stack.length && stack[stack.length - 1].level >= section.level) stack.pop();
    stack.push({ title: section.title, level: section.level });
    return {
      title: section.title,
      level: section.level,
      text: section.lines.join('\n').trim(),
      path: stack.map((s) => s.title),
      index,
    };
  });
}

function tailOverlap(text, overlap) {
  if (!overlap || text.length <= overlap) return text;
  return text.slice(-overlap);
}

function packUnits(units, chunkSize, overlap) {
  const chunks = [];
  let current = '';
  for (const unit of units) {
    const next = current ? `${current}\n${unit}` : unit;
    if (next.length <= chunkSize) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    const prefix = overlap && current ? tailOverlap(current, overlap) : '';
    current = prefix ? `${prefix}\n${unit}` : unit;
    while (current.length > chunkSize) {
      chunks.push(current.slice(0, chunkSize));
      current = current.slice(Math.max(chunkSize - overlap, 1));
    }
  }
  if (current) chunks.push(current);
  return chunks.map((chunk) => chunk.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function chunkText(text, chunkSize = config.doc.chunkSize, overlap = config.doc.chunkOverlap) {
  const safeChunkSize = Math.max(200, Number(chunkSize) || CHILD_CHUNK_SIZE);
  const safeOverlap = Math.min(Math.max(0, Number(overlap) || 0), Math.floor(safeChunkSize / 2));
  return packUnits(splitTextUnits(text, safeChunkSize), safeChunkSize, safeOverlap);
}

function chunkDocument(text, options = {}) {
  const source = options.source || '';
  const page = options.page || 1;
  const parentChunkSize = options.parentChunkSize || PARENT_CHUNK_SIZE;
  const parentOverlap = options.parentOverlap || PARENT_CHUNK_OVERLAP;
  const childChunkSize = options.childChunkSize || Math.min(config.doc.chunkSize || CHILD_CHUNK_SIZE, CHILD_CHUNK_SIZE);
  const childOverlap = options.childOverlap || Math.max(config.doc.chunkOverlap || 0, CHILD_CHUNK_OVERLAP);
  const sections = splitSections(text);
  const chunks = [];

  sections.forEach((section) => {
    const sectionId = `${source || 'document'}:p${page}:section:${section.index}:${slugText(section.title, 'section')}`;
    const parentTexts = packUnits(splitTextUnits(section.text, parentChunkSize), parentChunkSize, parentOverlap);
    parentTexts.forEach((parentText, parentIndexInSection) => {
      const parentIndex = chunks.filter((c) => c.granularity === 'child').length + parentIndexInSection;
      const parentId = `${sectionId}:parent:${parentIndexInSection}`;
      const childTexts = chunkText(parentText, childChunkSize, childOverlap);
      childTexts.forEach((childText, childIndex) => {
        chunks.push({
          text: childText,
          source,
          page,
          index: chunks.length,
          childIndex,
          parentIndex,
          parentId,
          parentText,
          sectionId,
          sectionTitle: section.title,
          sectionPath: section.path,
          sectionLevel: section.level,
          sectionIndex: section.index,
          granularity: 'child',
        });
      });
    });
  });

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
    allChunks.push(...chunkDocument(page.text, { source: fileName, page: page.page }));
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
  loadFile, chunkText, chunkDocument, processDocument, parseArticleMeta,
  generateFileHash, saveGraphData, loadGraphData, loadAppData,
  CACHE_DIR,
};
