/**
 * 文章主题筛选 + 文件类型校验
 * 限制：中东冲突相关 + LLM 可解析的文本类格式
 */

const { chat } = require('./llm');
const { THEME_FILTER_PROMPT, buildThemeFilterUserPrompt } = require('./prompts/extraction');

const MIDDLE_EAST_KEYWORDS = [
  '中东', '以色列', '巴勒斯坦', '加沙', '约旦河西岸', '伊朗', '叙利亚',
  '黎巴嫩', '真主党', '胡塞', '也门', '红海', '霍尔木兹', '伊拉克',
  '沙特', '阿联酋', '卡塔尔', '哈马斯', '法塔赫', '内塔尼亚胡',
  'Gaza', 'Israel', 'Palestine', 'Iran', 'Syria', 'Lebanon', 'Hezbollah',
  'Houthi', 'Yemen', 'Hormuz', 'Red Sea', 'Hamas', 'IDF', 'Netanyahu',
  'ceasefire', 'airstrike', 'Middle East', 'West Bank', 'Tehran', 'Beirut',
];

const BLOCKED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.wav',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.dll', '.bin',
  '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.text', '.md', '.markdown', '.pdf', '.doc', '.docx',
  '.csv', '.tsv', '.json', '.jsonl', '.xml', '.html', '.htm',
  '.tex', '.log', '.rst', '.rtf', '.yaml', '.yml',
]);

function validateFileType(fileName) {
  const ext = (fileName.match(/\.[^.]+$/) || [''])[0].toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      reason: `不支持的文件类型 ${ext}。请上传新闻/文本类文件（txt, md, pdf, docx, csv, json 等）`,
    };
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      reason: `文件类型 ${ext || '(无扩展名)'} 不在白名单内。大模型难以有效利用此类格式。`,
    };
  }
  return { valid: true, extension: ext };
}

function keywordThemeScore(text) {
  const lower = text.toLowerCase();
  let hits = 0;
  const matched = [];
  for (const kw of MIDDLE_EAST_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      hits++;
      matched.push(kw);
    }
  }
  const score = Math.min(1, hits / 3);
  return { score, matched: [...new Set(matched)].slice(0, 10) };
}

async function validateMiddleEastTheme(text, provider = 'deepseek', options = {}) {
  const kw = keywordThemeScore(text);

  // 关键词强匹配直接通过
  if (kw.score >= 0.67) {
    return {
      isValid: true,
      confidence: kw.score,
      themeTags: kw.matched,
      reason: `关键词匹配: ${kw.matched.slice(0, 5).join(', ')}`,
      method: 'keyword',
    };
  }

  // 关键词弱匹配 + LLM 复核
  try {
    const response = await chat([
      { role: 'system', content: THEME_FILTER_PROMPT },
      { role: 'user', content: buildThemeFilterUserPrompt(text) },
    ], provider, {
      model: options.model || 'deepseek-v4-flash',
      temperature: 0.1,
      maxTokens: 500,
      extra: { thinking: { type: 'disabled' } },
    });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      const isValid = result.is_middle_east_conflict && (result.confidence || 0) >= 0.5;
      return {
        isValid,
        confidence: result.confidence || 0,
        themeTags: result.theme_tags || kw.matched,
        reason: result.reason || '',
        method: 'llm',
      };
    }
  } catch (e) {
    console.warn('Theme LLM check failed, falling back to keywords:', e.message);
  }

  // 回退：关键词弱匹配
  return {
    isValid: kw.score >= 0.34,
    confidence: kw.score,
    themeTags: kw.matched,
    reason: kw.score >= 0.34
      ? `关键词弱匹配 (${kw.matched.join(', ')})`
      : '未检测到中东冲突相关关键词',
    method: 'keyword_fallback',
  };
}

module.exports = {
  MIDDLE_EAST_KEYWORDS,
  ALLOWED_EXTENSIONS,
  BLOCKED_EXTENSIONS,
  validateFileType,
  keywordThemeScore,
  validateMiddleEastTheme,
};
