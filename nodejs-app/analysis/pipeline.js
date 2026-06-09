/**
 * 数据分析管道 - 从Neo4j图数据库和文本中提取结构化数据
 * 对应 Python 的 data_analyzer.py
 */
process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';

const { runQuery } = require('../services/neo4j');
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();

const TECHNICAL_NODE_LABELS = [
  'Document',
  'RagChunk',
  'RagSection',
  'RagParentChunk',
  'RagCommunity',
  'GraphRelation',
  'ResearchReport',
];

const TECHNICAL_REL_TYPES = [
  'HAS_CHUNK',
  'HAS_SECTION',
  'HAS_PARENT_CHUNK',
  'HAS_CHILD_CHUNK',
  'HAS_GRAPH_RELATION',
  'HAS_COMMUNITY',
  'CONTAINS_ENTITY',
  'AS_RELATION_SOURCE',
  'AS_RELATION_TARGET',
];

// --- 实体提取 ---
async function extractEntities() {
  try {
    const nodeTypes = await runQuery(`
      MATCH (n)
      WHERE none(label IN labels(n) WHERE label IN $technicalLabels)
      WITH labels(n) AS labels
      UNWIND labels AS label
      WITH label
      WHERE label <> 'VectorNode'
      RETURN label, count(*) AS count
      ORDER BY count DESC
    `, { technicalLabels: TECHNICAL_NODE_LABELS });

    const relTypes = await runQuery(`
      MATCH (n)-[r]->(m)
      WHERE none(label IN labels(n) WHERE label IN $technicalLabels)
        AND none(label IN labels(m) WHERE label IN $technicalLabels)
        AND NOT type(r) IN $technicalRelTypes
      RETURN type(r) AS type, count(*) AS count
      ORDER BY count DESC
    `, { technicalLabels: TECHNICAL_NODE_LABELS, technicalRelTypes: TECHNICAL_REL_TYPES });

    const allNodes = await runQuery(`
      MATCH (n)
      WHERE none(label IN labels(n) WHERE label IN $technicalLabels)
      WITH n, [label IN labels(n) WHERE label <> 'VectorNode'] AS businessLabels
      RETURN businessLabels[0] AS type, n.id AS id, n.text AS text
      LIMIT 500
    `, { technicalLabels: TECHNICAL_NODE_LABELS });

    return {
      nodeTypes,
      relTypes,
      allNodes,
      totalNodes: nodeTypes.reduce((s, r) => s + (r.count || 0), 0),
      totalRels: relTypes.reduce((s, r) => s + (r.count || 0), 0),
    };
  } catch (e) {
    console.error('提取实体失败:', e);
    return { nodeTypes: [], relTypes: [], allNodes: [], totalNodes: 0, totalRels: 0 };
  }
}

async function extractGraphEdges() {
  try {
    return await runQuery(`
      MATCH (n)-[r]->(m)
      WHERE none(label IN labels(n) WHERE label IN $technicalLabels)
        AND none(label IN labels(m) WHERE label IN $technicalLabels)
        AND NOT type(r) IN $technicalRelTypes
      WITH n, r, m,
           [label IN labels(n) WHERE label <> 'VectorNode'] AS sourceLabels,
           [label IN labels(m) WHERE label <> 'VectorNode'] AS targetLabels
      RETURN sourceLabels[0] AS source_type, n.id AS source_id, n.text AS source_text,
             type(r) AS relation,
             targetLabels[0] AS target_type, m.id AS target_id, m.text AS target_text
      LIMIT 500
    `, { technicalLabels: TECHNICAL_NODE_LABELS, technicalRelTypes: TECHNICAL_REL_TYPES });
  } catch (e) {
    console.error('提取边关系失败:', e);
    return [];
  }
}

// --- 关键词分析 ---
const EVENT_CATEGORIES = {
  "空袭/轰炸": ["空袭", "轰炸", "打击", "袭击", "导弹", "airstrike", "strike", "bomb", "attack", "shelling"],
  "停火/谈判": ["停火", "休战", "谈判", "协议", "和平", "ceasefire", "truce", "negotiation", "peace", "deal"],
  "封锁/航运": ["封锁", "海峡", "港口", "航运", "blockade", "strait", "Hormuz", "shipping", "port"],
  "外交声明": ["声明", "言论", "警告", "宣布", "呼吁", "谴责", "statement", "declare", "warn", "urge", "condemn"],
  "军事行动": ["军事", "部队", "部署", "军队", "military", "troop", "deploy", "force", "navy", "naval"],
  "人道主义": ["平民", "伤亡", "难民", "人道", "医院", "civilian", "casualty", "refugee", "humanitarian", "hospital"],
  "经济影响": ["经济", "石油", "制裁", "金融", "油价", "economic", "oil", "sanction", "financial"],
};

function categorizeEvent(text) {
  const textLower = text.toLowerCase();
  const cats = [];
  for (const [cat, keywords] of Object.entries(EVENT_CATEGORIES)) {
    if (keywords.some(kw => textLower.includes(kw.toLowerCase()))) {
      cats.push(cat);
    }
  }
  return cats.length ? cats : ["其他"];
}

const STOP_WORDS = new Set([
  // English
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'having','do','does','did','doing','will','would','shall','should','can','could',
  'may','might','must','ought','i','me','my','we','our','you','your','he','she',
  'it','they','them','their','his','her','its','and','or','but','not','no','nor',
  'so','if','then','than','that','this','these','those','to','of','in','for','on',
  'with','at','by','from','as','into','through','during','before','after','above',
  'below','between','out','off','over','under','again','further','once','here',
  'there','when','where','why','how','all','both','each','every','few','more',
  'most','other','some','such','only','own','same','up','down','just','about',
  'now','also','very','too','well','back','still','even','said','reuters','ap',
  'will','new','one','two','like','get','make','made','much','many','know','see',
  'year','time','people','day','way','work','part','world','country','city','man',
  'week','month','say','take','come','go','use','look','first','last','long',
  'according','including','although','because','since','while','after','before',
  'monday','tuesday','wednesday','thursday','friday','saturday','sunday',
  'january','february','march','april','june','july','august','september',
  'october','november','december','news','report','reported','told',
  // Chinese
  '的','了','在','是','我','有','和','就','不','人','都','一','一个','上','也',
  '很','到','说','要','去','你','会','着','没有','看','好','自己','这','他','她',
  '它','们','那','些','什么','怎么','如何','因为','所以','但是','如果','虽然',
  '可以','可能','应该','已经','正在','将','还','又','再','能','被','把','让',
  '从','对','向','与','或','而','且','并','中','等','其','之','等','年','月','日',
  '时','分','秒','今天','昨天','明天','现在','之前','之后','以后','以前','然后',
  '这个','那个','哪','吗','呢','吧','啊','哦','嗯','呀','哈','并','及','以及',
  '进行','通过','根据','按照','关于','对于','由于','为了','作为','表示','称',
  '报道','新闻','消息','记者','据悉','据','指出','认为','显示','发生','出现',
  '其中','以及','包括','目前','相关','方面','情况','问题','工作','需要','继续',
  '开始','结束','发展','影响','作用','关系','不同','主要','重要','特别','非常',
  '比较','更加','越来越','可能','一定','必须','能够','可以','应当','不得','不能',
]);

function extractKeywords(docs, topN = 30) {
  const allWords = [];
  const catCounts = {};

  for (const doc of docs) {
    const text = typeof doc === 'string' ? doc : (doc.text || doc.page_content || '');
    const tokens = tokenizer.tokenize(text.toLowerCase())
      .filter(t => t.length >= 2 && !STOP_WORDS.has(t));
    allWords.push(...tokens);

    const cats = categorizeEvent(text);
    for (const c of cats) {
      catCounts[c] = (catCounts[c] || 0) + 1;
    }
  }

  const tf = new natural.TfIdf();
  for (const doc of docs) {
    const text = typeof doc === 'string' ? doc : (doc.text || doc.page_content || '');
    tf.addDocument(tokenizer.tokenize(text.toLowerCase()));
  }

  const keywords = [];
  tf.listTerms(0).forEach(item => {
    if (item.term.length >= 2 && !STOP_WORDS.has(item.term)) {
      keywords.push({ term: item.term, score: Math.round(item.tfidf * 10000) / 10000 });
    }
  });
  const filtered = keywords.slice(0, topN);

  // Sort catCounts
  const sortedCats = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

  return { keywords: filtered, categoryDistribution: sortedCats };
}

// --- 时间线提取 ---
const DATE_PATTERNS = [
  [/(\d{4})[-/\u5e74](\d{1,2})[-/\u6708](\d{1,2})[\u65e5\u53f7]?/g, function(m) { return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0'); }],
  [/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/gi, null],
  [/(\d{1,2})\/(\d{1,2})\/(\d{4})/g, function(m) { return m[3] + '-' + m[1].padStart(2,'0') + '-' + m[2].padStart(2,'0'); }],
];

function extractDates(text) {
  const dates = new Set();
  for (const [pattern, formatter] of DATE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      try {
        dates.add(formatter ? formatter(match) : `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`);
      } catch {
        // Ignore malformed date matches; extraction is best-effort.
      }
    }
  }
  return [...dates];
}

function extractTimeline(docs) {
  const timelineEvents = [];

  for (const doc of docs) {
    const text = typeof doc === 'string' ? doc : (doc.text || doc.page_content || '');
    const dates = extractDates(text);
    if (dates.length) {
      const categories = categorizeEvent(text);
      const summary = text.slice(0, 200).replace(/\n/g, ' ').trim();
      for (const date of dates) {
        timelineEvents.push({ date, summary, categories, source: 'document' });
      }
    }
  }

  // Group by date
  const grouped = {};
  for (const evt of timelineEvents) {
    if (!grouped[evt.date]) {
      grouped[evt.date] = { date: evt.date, events: [], categories: new Set() };
    }
    grouped[evt.date].events.push({
      category: evt.categories[0] || '其他',
      summary: evt.summary,
    });
    evt.categories.forEach(c => grouped[evt.date].categories.add(c));
  }

  const result = Object.keys(grouped).sort().map(date => ({
    date,
    events: grouped[date].events.slice(0, 5),
    count: grouped[date].events.length,
    categories: [...grouped[date].categories],
  }));

  return result;
}

// --- 人物名称提取 ---
// Simplified version using regex patterns
const CN_SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮下齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫';
const CN_NAME_RE = new RegExp(`[${CN_SURNAMES}][\\u4e00-\\u9fa5]{1,2}`, 'g');
const EN_NAME_RE = /(?:President|General|Minister|Secretary|Commander|Admiral|Colonel|Major|Captain|Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Ambassador|King|Prince|said|stared|reported|told)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2})/g;

function extractPersons(docs) {
  const persons = {};
  const contexts = {};

  for (const doc of docs) {
    const text = typeof doc === 'string' ? doc : (doc.text || doc.page_content || '');

    // Chinese names
    for (const match of text.matchAll(CN_NAME_RE)) {
      const name = match[0].trim();
      if (name.length >= 2 && !/^[\d\s]+$/.test(name)) {
        persons[name] = (persons[name] || 0) + 1;
        if (!contexts[name]) {
          const idx = match.index;
          contexts[name] = text.slice(Math.max(0, idx - 15), Math.min(text.length, match.index + name.length + 15));
        }
      }
    }

    // English names
    for (const match of text.matchAll(EN_NAME_RE)) {
      const name = match[1].trim();
      if (name.length >= 3 && name.length <= 30) {
        persons[name] = (persons[name] || 0) + 1;
        if (!contexts[name]) {
          const idx = match.index;
          contexts[name] = text.slice(Math.max(0, idx - 20), Math.min(text.length, match.index + match[0].length + 20));
        }
      }
    }
  }

  const sorted = Object.entries(persons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => ({
      name,
      count,
      context: (contexts[name] || '').replace(/\n/g, ' ').slice(0, 100),
      title: '',
    }));

  return {
    personList: sorted,
    totalPersons: Object.keys(persons).length,
    topPerson: sorted[0] || null,
  };
}

// --- 空间态势 ---
const LOCATION_COORDS = {
  "伊朗": [32.4279, 53.6880], "德黑兰": [35.6892, 51.3890],
  "以色列": [31.0461, 34.8516], "耶路撒冷": [31.7683, 35.2137],
  "黎巴嫩": [33.8547, 35.8623], "贝鲁特": [33.8938, 35.5018],
  "加沙": [31.5000, 34.4667], "巴勒斯坦": [31.9474, 35.2272],
  "霍尔木兹海峡": [26.6000, 56.5000], "红海": [21.0000, 38.0000],
  "叙利亚": [34.8021, 38.9968], "伊拉克": [33.2232, 43.6793],
  "巴格达": [33.3152, 44.3661], "也门": [15.5527, 48.5164],
  "沙特阿拉伯": [23.8859, 45.0792], "阿曼": [21.4735, 55.9754],
  "巴基斯坦": [30.3753, 69.3451], "伊斯兰堡": [33.6844, 73.0479],
  "土耳其": [38.9637, 35.2433], "美国": [37.0902, -95.7129],
  "华盛顿": [38.9072, -77.0369], "欧洲": [54.5260, 15.2551],
  "地中海": [35.0000, 18.0000], "阿联酋": [23.4241, 53.8478],
  "卡塔尔": [25.3548, 51.1839], "埃及": [26.8206, 30.8025],
  "约旦": [30.5852, 36.2384],
};

const LOCATION_RE = new RegExp(Object.keys(LOCATION_COORDS).join('|'), 'g');

function extractSpatialData(docs) {
  const locationCounter = {};
  const locationContexts = {};

  for (const doc of docs) {
    const text = typeof doc === 'string' ? doc : (doc.text || doc.page_content || '');
    const matches = text.match(LOCATION_RE) || [];
    for (const loc of matches) {
      locationCounter[loc] = (locationCounter[loc] || 0) + 1;
      if (!locationContexts[loc]) locationContexts[loc] = [];
      if (locationContexts[loc].length < 3) {
        locationContexts[loc].push(text.slice(0, 300).replace(/\n/g, ' ').trim());
      }
    }
  }

  const locations = Object.entries(locationCounter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .filter(([name]) => LOCATION_COORDS[name])
    .map(([name, count]) => ({
      name,
      lat: LOCATION_COORDS[name][0],
      lng: LOCATION_COORDS[name][1],
      mention_count: count,
      contexts: (locationContexts[name] || []).slice(0, 2),
    }));

  return {
    locations,
    totalLocations: locations.length,
    topLocation: locations[0] || null,
  };
}

// --- 主分析管道 ---
function buildGraphForVisualization(entityData, edges) {
  const seenIds = new Set();
  const nodes = [];

  for (const node of (entityData.allNodes || [])) {
    const nid = node.id;
    if (nid && !seenIds.has(nid)) {
      seenIds.add(nid);
      nodes.push({
        id: String(nid),
        type: node.type || 'Unknown',
        text: (node.text || '').slice(0, 100),
      });
    }
  }

  const links = [];
  for (const edge of edges) {
    links.push({
      source: String(edge.source_id || ''),
      target: String(edge.target_id || ''),
      type: edge.relation || 'UNKNOWN',
      source_type: edge.source_type || 'Unknown',
      target_type: edge.target_type || 'Unknown',
    });
  }

  return { nodes, links };
}

function buildChunkStructure(docs) {
  const sections = new Map();
  const parents = new Map();
  const children = [];

  docs.forEach((doc, index) => {
    const text = doc.text || doc.page_content || '';
    const source = doc.source || '当前文档';
    const sectionTitle = doc.sectionTitle || doc.sectionPath?.join(' > ') || '全文';
    const sectionKey = `${source}::${doc.sectionId || sectionTitle}`;
    const parentKey = `${sectionKey}::parent:${doc.parentIndex ?? index}`;

    if (!sections.has(sectionKey)) {
      sections.set(sectionKey, {
        id: sectionKey,
        title: sectionTitle,
        source,
        level: doc.sectionLevel || 0,
        childCount: 0,
        parentCount: 0,
        chars: 0,
      });
    }
    if (!parents.has(parentKey)) {
      parents.set(parentKey, {
        id: parentKey,
        sectionId: sectionKey,
        parentIndex: doc.parentIndex ?? index,
        childCount: 0,
        chars: 0,
      });
      sections.get(sectionKey).parentCount += 1;
    }

    const child = {
      id: `${parentKey}::child:${doc.childIndex ?? index}`,
      sectionId: sectionKey,
      parentId: parentKey,
      index,
      childIndex: doc.childIndex ?? index,
      chars: text.length,
    };
    children.push(child);
    parents.get(parentKey).childCount += 1;
    parents.get(parentKey).chars += child.chars;
    sections.get(sectionKey).childCount += 1;
    sections.get(sectionKey).chars += child.chars;
  });

  return {
    sections: [...sections.values()],
    parents: [...parents.values()],
    children,
    sectionCount: sections.size,
    parentCount: parents.size,
    childCount: children.length,
  };
}

async function runDataAnalysis(docs, fileName) {
  console.log('='.repeat(50));
  console.log('开始数据分析和清洗管线...');

  // Step 1: Extract entities from Neo4j
  console.log('[1/6] 提取实体和关系数据...');
  const entityData = await extractEntities();
  const edges = await extractGraphEdges();
  console.log(`  实体类型: ${entityData.nodeTypes.length}, 总节点: ${entityData.totalNodes}`);

  // Step 2: Keyword analysis
  console.log('[2/6] 关键词分析...');
  const keywordData = extractKeywords(docs);
  console.log(`  提取到 ${keywordData.keywords.length} 个关键词`);

  // Step 3: Person extraction
  console.log('[3/6] 提取人物名称...');
  const personData = extractPersons(docs);

  // Step 4: Timeline
  console.log('[4/6] 提取事件时间线...');
  const timeline = extractTimeline(docs);

  // Step 5: Spatial data
  console.log('[5/6] 提取空间态势数据...');
  const spatialData = extractSpatialData(docs);

  // Step 6: Build visualization graph
  console.log('[6/6] 构建知识图谱数据...');
  const graphData = buildGraphForVisualization(entityData, edges);

  // Compute stats
  const textLengths = docs.map(d => (d.text || d.page_content || '').length);
  const chunkStructure = buildChunkStructure(docs);
  const meta = {
    title: fileName,
    processedAt: new Date().toISOString(),
    totalChunks: docs.length,
    totalEntities: entityData.totalNodes,
    totalRelations: entityData.totalRels,
    timelineEvents: timeline.reduce((s, t) => s + (t.count || 0), 0),
    locationsFound: spatialData.totalLocations,
    personsFound: personData.totalPersons,
  };

  const entityDistribution = {};
  for (const item of entityData.nodeTypes) {
    entityDistribution[item.label] = item.count;
  }

  const relDistribution = {};
  for (const item of entityData.relTypes) {
    relDistribution[item.type] = item.count;
  }

  // Generate insights
  const insights = [];
  insights.push(`文档共分为 **${meta.totalChunks}** 个文本块进行分析`);
  if (meta.totalEntities > 0) {
    insights.push(`识别出 **${meta.totalEntities}** 个实体和 **${meta.totalRelations}** 个关系`);
  }
  const topEnt = Object.entries(entityDistribution).sort((a, b) => b[1] - a[1])[0];
  if (topEnt) {
    insights.push(`最常见的实体类型: **${topEnt[0]}** (${topEnt[1]} 个)`);
  }
  if (timeline.length) {
    insights.push(`事件时间跨度: ${timeline[0].date} ~ ${timeline[timeline.length-1].date}`);
  }
  if (spatialData.topLocation) {
    insights.push(`最常提及的地理位置: **${spatialData.topLocation.name}** (${spatialData.topLocation.mention_count} 次)`);
  }
  if (keywordData.keywords.length) {
    insights.push(`文档核心关键词: **${keywordData.keywords.slice(0, 8).map(k => k.term).join(', ')}**`);
  }

  console.log('数据分析管线完成!');

  return {
    fileName,
    entityData,
    edges,
    keywordData,
    personData,
    timeline,
    spatialData,
    stats: {
      meta,
      textLengths,
      meanChunkSize: textLengths.length ? Math.round(textLengths.reduce((a, b) => a + b, 0) / textLengths.length) : 0,
      totalChars: textLengths.reduce((a, b) => a + b, 0),
      chunkStructure,
      entityDistribution,
      relationDistribution: relDistribution,
    },
    graphData,
    insights,
    analysisComplete: true,
  };
}

module.exports = {
  extractEntities, extractGraphEdges, extractKeywords, categorizeEvent,
  extractTimeline, extractPersons, extractSpatialData, LOCATION_COORDS,
  runDataAnalysis, buildGraphForVisualization,
};
