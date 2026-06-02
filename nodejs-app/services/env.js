const fs = require('fs').promises;
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');
const ENV_KEY_RE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function serializeEnvValue(value) {
  return JSON.stringify(String(value ?? ''));
}

async function updateEnvFile(updates) {
  let raw = '';
  try {
    raw = await fs.readFile(ENV_FILE, 'utf-8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const pending = new Map(Object.entries(updates).filter(([, value]) => value !== undefined));
  const lines = raw ? raw.split(/\r?\n/) : [];
  const nextLines = lines.map((line) => {
    const match = line.match(ENV_KEY_RE);
    if (!match || !pending.has(match[1])) return line;

    const key = match[1];
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${serializeEnvValue(value)}`;
  });

  for (const [key, value] of pending) {
    nextLines.push(`${key}=${serializeEnvValue(value)}`);
  }

  await fs.writeFile(ENV_FILE, `${nextLines.filter((line, index) => line || index < nextLines.length - 1).join('\n')}\n`, 'utf-8');
  Object.assign(process.env, updates);
}

module.exports = { ENV_FILE, updateEnvFile };
