/**
 * 实体抽取提示词 — 移植自 work1/src/extract_entities_llm.py
 * 单文精细模式 vs 多文轻量模式
 */

const SINGLE_ENTITY_TYPES = [
  '军事组织', '政治实体', '人物', '地理位置',
  '冲突事件', '武器装备', '时间节点', '协议/文件',
];

const SINGLE_RELATION_TYPES = [
  '部署于', '参与', '谈判', '攻击', '支援', '封锁',
  '制裁', '指挥', '升级为', '受损害', '发言/声明', '部署/驻扎',
];

const SINGLE_SYSTEM_PROMPT = `你是中东冲突新闻深度分析专家。从给定文本中提取实体和关系。
要求：
1. 只提取文中明确提到的信息，不要推断或编造
2. 每个实体必须包含 name、aliases（别名数组）、type、summary（一句话角色描述）、attributes（键值对象）
3. 每条关系必须包含 source、target、type、summary（一句话关系描述）、attributes
4. 关系方向要准确（source 对 target 做了什么）
5. 对单篇文章要做精细分析：提取所有关键人物、组织、地点、事件、武器、时间节点
6. 输出纯 JSON，不要 markdown 代码块

实体类型: ${SINGLE_ENTITY_TYPES.join(', ')}
关系类型: ${SINGLE_RELATION_TYPES.join(', ')}

输出格式:
{"entities":[{"name":"...","aliases":[],"type":"...","summary":"...","attributes":{}}],"relations":[{"source":"实体名","target":"实体名","type":"...","summary":"...","attributes":{}}]}`;

const MULTI_SYSTEM_PROMPT = `你是中东冲突多文档联合分析专家。从多篇新闻摘要中提取跨文档共享实体和关系。
要求：
1. 关注跨文档重复出现的核心实体（国家、组织、人物、地点）
2. 识别跨文档的共同主题和冲突演化脉络
3. 实体用简化格式：{"name":"...","type":"...","articles":["文章标题1","文章标题2"]}
4. 关系标注涉及的文章：{"source":"...","target":"...","type":"...","articles":["..."]}
5. 输出纯 JSON

实体类型: ${SINGLE_ENTITY_TYPES.join(', ')}
关系类型: ${SINGLE_RELATION_TYPES.join(', ')}

输出格式:
{"shared_entities":[...],"cross_relations":[...],"theme_summary":"共同主题一句话","conflict_evolution":"冲突演化叙事（200字以内）"}`;

const THEME_FILTER_PROMPT = `判断以下文本是否属于「中东冲突」相关主题。
中东冲突包括但不限于：以色列-巴勒斯坦、加沙、伊朗核问题、红海/霍尔木兹、叙利亚/黎巴嫩、也门胡塞、海湾国家军事动态、联合国中东决议等。
排除：纯体育、娱乐、科技（非军事）、其他地区冲突（如俄乌、台海）且无中东关联。

输出纯 JSON: {"is_middle_east_conflict": true/false, "confidence": 0.0-1.0, "theme_tags": ["标签1"], "reason": "一句话理由"}`;

function buildSingleArticlePrompt(title, summary, text, date) {
  let fullText = `${title}\n\n${summary}\n\n${text}`;
  if (fullText.length > 6000) {
    fullText = fullText.slice(0, 3500) + '\n\n[...中段省略...]\n\n' + fullText.slice(-2500);
  }
  return `请从以下中东冲突新闻文本中进行精细实体关系抽取。

文档日期: ${date || '未知'}
实体类型: ${SINGLE_ENTITY_TYPES.join(', ')}
关系类型: ${SINGLE_RELATION_TYPES.join(', ')}

新闻文本:
---
${fullText}
---`;
}

function buildMultiArticlePrompt(articles) {
  const blocks = articles.map((a, i) => (
    `### 文章 ${i + 1}: ${a.title || '无标题'}
日期: ${a.date || '未知'}
主题标签: ${(a.themeTags || []).join(', ') || '未标注'}
摘要: ${(a.summary || '').slice(0, 300)}
正文片段: ${(a.text || '').slice(0, 800)}`
  )).join('\n\n');

  return `以下 ${articles.length} 篇新闻具有共同主题，请进行跨文档联合分析。

${blocks}

请识别：
1. 跨文档共享的核心实体
2. 跨文档关系网络
3. 共同主题总结
4. 冲突态势演化叙事`;
}

function buildThemeFilterUserPrompt(text) {
  const sample = text.length > 3000 ? text.slice(0, 2000) + '\n...[截断]...\n' + text.slice(-1000) : text;
  return `待判断文本:\n---\n${sample}\n---`;
}

module.exports = {
  SINGLE_ENTITY_TYPES,
  SINGLE_RELATION_TYPES,
  SINGLE_SYSTEM_PROMPT,
  MULTI_SYSTEM_PROMPT,
  THEME_FILTER_PROMPT,
  buildSingleArticlePrompt,
  buildMultiArticlePrompt,
  buildThemeFilterUserPrompt,
};
