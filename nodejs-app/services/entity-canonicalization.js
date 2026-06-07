/**
 * 实体别名合并 — 移植 work1 llm_deep_analysis 规范
 */

const ALIAS_GROUPS = [
  { canonical: 'Iran', aliases: ['伊朗', 'Iran', 'Iranian', 'Tehran', '德黑兰', 'IRGC', '伊朗革命卫队'] },
  { canonical: 'Israel', aliases: ['以色列', 'Israel', 'Israeli', 'IDF', 'Netanyahu', '内塔尼亚胡', 'Tel Aviv'] },
  { canonical: 'United States', aliases: ['美国', 'United States', 'U.S.', 'US', 'Washington', 'Trump', '特朗普', 'Pentagon'] },
  { canonical: 'Hamas', aliases: ['哈马斯', 'Hamas', 'Gaza', '加沙', 'Palestinian', '巴勒斯坦'] },
  { canonical: 'Hezbollah', aliases: ['真主党', 'Hezbollah', 'Lebanon', '黎巴嫩', 'Beirut', '贝鲁特'] },
  { canonical: 'Houthis', aliases: ['胡塞', 'Houthi', 'Houthis', 'Yemen', '也门'] },
  { canonical: 'UN', aliases: ['联合国', 'United Nations', 'UN', 'IAEA', '国际原子能机构'] },
];

function buildAliasMap() {
  const map = {};
  for (const group of ALIAS_GROUPS) {
    for (const alias of group.aliases) {
      map[alias.toLowerCase()] = group.canonical;
    }
    map[group.canonical.toLowerCase()] = group.canonical;
  }
  return map;
}

const ALIAS_MAP = buildAliasMap();

function canonicalize(name) {
  if (!name) return name;
  const lower = String(name).trim().toLowerCase();
  return ALIAS_MAP[lower] || name;
}

function canonicalizeEntities(entities) {
  const merged = new Map();

  for (const entity of entities) {
    const rawName = entity.name || entity.id;
    const canon = canonicalize(rawName);
    const key = canon.toLowerCase();

    if (!merged.has(key)) {
      merged.set(key, {
        ...entity,
        id: canon,
        name: canon,
        aliases: [...new Set([rawName, ...(entity.aliases || [])].filter(a => a !== canon))],
        count: entity.count || 1,
      });
    } else {
      const existing = merged.get(key);
      existing.count = (existing.count || 1) + (entity.count || 1);
      existing.aliases = [...new Set([
        ...existing.aliases,
        rawName,
        ...(entity.aliases || []),
      ].filter(a => a !== canon))];
      if (entity.summary && !existing.summary) existing.summary = entity.summary;
    }
  }

  return [...merged.values()];
}

function canonicalizeRelations(relations) {
  const seen = new Set();

  return relations.map(r => ({
    ...r,
    source: canonicalize(r.source),
    target: canonicalize(r.target),
  })).filter(r => {
    if (!r.source || !r.target || r.source === r.target) return false;
    const key = `${r.source}|${r.type}|${r.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyCanonicalization(entities, relations) {
  const canonEntities = canonicalizeEntities(entities);
  const canonRelations = canonicalizeRelations(relations);
  return { entities: canonEntities, relations: canonRelations };
}

module.exports = {
  ALIAS_GROUPS,
  canonicalize,
  canonicalizeEntities,
  canonicalizeRelations,
  applyCanonicalization,
};
