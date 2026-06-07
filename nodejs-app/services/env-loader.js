/**
 * 多路径 .env 加载
 * 优先级：先加载 Agent-main/.env（项目共享），再加载 nodejs-app/.env（仅补充未设置的变量）
 * 避免 nodejs-app/.env 中的无效 DEEPSEEK_API_KEY 覆盖正确密钥
 */
const fs = require('fs');
const path = require('path');

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';

function loadEnv() {
  const root = path.join(__dirname, '..');
  const files = [
    path.join(root, '..', 'Agent-main', '.env'),
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
