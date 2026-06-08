/**
 * 多路径 .env 加载
 * 优先级：nodejs-app/.env，再补充根目录 .env（仅未设置的变量）
 */
const fs = require('fs');
const path = require('path');

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';

function loadEnv() {
  const root = path.join(__dirname, '..');
  const files = [
    path.join(root, '.env'),
    path.join(root, '..', '.env'),
  ];

  for (const file of files) {
    if (fs.existsSync(file)) {
      require('dotenv').config({ path: file, override: false, quiet: true });
    }
  }
}

module.exports = { loadEnv };
