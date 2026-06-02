const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const config = require('../config');

const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');
const DATA_FILE = path.join(__dirname, '..', 'data', 'app_data.json');

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
  loadFile, chunkText, processDocument,
  generateFileHash, saveGraphData, loadGraphData, loadAppData,
  CACHE_DIR,
};
