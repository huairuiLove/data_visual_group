/**
 * 规则挖掘 — 移植 work1 rule_mining.py (actor-action-consequence)
 * 仅基于用户上传文本，无爬虫
 */

const ACTOR_RULES = {
  'Iran': [/\biran\b/i, /\biranian\b/i, /\btehran\b/i, /\birgc\b/i, /伊朗/i, /德黑兰/i],
  'Israel/IDF': [/\bisrael\b/i, /\bisraeli\b/i, /\bidf\b/i, /\bnetanyahu\b/i, /以色列/i, /加沙/i],
  'US/Trump': [/\bunited states\b/i, /\bu\.s\.\b/i, /\btrump\b/i, /\bpentagon\b/i, /美国/i, /特朗普/i],
  'Hamas/Gaza': [/\bhamas\b/i, /\bgaza\b/i, /\bpalestinian\b/i, /哈马斯/i, /巴勒斯坦/i],
  'Hezbollah/Lebanon': [/\bhezbollah\b/i, /\blebanon\b/i, /\bbeirut\b/i, /真主党/i, /黎巴嫩/i],
  'Houthis/Yemen': [/\bhouthi\w*\b/i, /\byemen\w*\b/i, /胡塞/i, /也门/i],
  'UN/IAEA': [/\bunited nations\b/i, /\biaea\b/i, /联合国/i, /国际原子能/i],
};

const ACTION_RULES = {
  'Military strike': [/\battack\w*\b/i, /\bstrike\w*\b/i, /\bairstrike\w*\b/i, /\bmissile\w*\b/i, /空袭/i, /打击/i, /袭击/i],
  'Retaliation / threat': [/\bretaliat\w*\b/i, /\bthreaten\w*\b/i, /\bescalat\w*\b/i, /报复/i, /威胁/i, /升级/i],
  'Ceasefire / diplomacy': [/\bceasefire\b/i, /\bnegotiat\w*\b/i, /\bdiplomac\w*\b/i, /停火/i, /谈判/i, /外交/i],
  'Sanctions / nuclear pressure': [/\bnuclear\b/i, /\bsanction\w*\b/i, /\buranium\b/i, /核/i, /制裁/i],
  'Maritime blockade': [/\bhormuz\b/i, /\bred sea\b/i, /\bshipping\b/i, /\bblockade\b/i, /霍尔木兹/i, /红海/i, /封锁/i],
  'Aid / humanitarian response': [/\bhumanitarian\b/i, /\bcivilian\w*\b/i, /\brefugee\w*\b/i, /人道/i, /平民/i, /难民/i],
};

const CONSEQUENCE_RULES = {
  'Civilian harm': [/\bkilled\b/i, /\bcasualt\w*\b/i, /\bcivilian\w*\b/i, /伤亡/i, /平民/i],
  'Energy price shock': [/\boil\b/i, /\benergy\b/i, /\bprice\w*\b/i, /石油/i, /能源/i, /油价/i],
  'Shipping chokepoint risk': [/\bhormuz\b/i, /\bshipping\b/i, /\btanker\w*\b/i, /航运/i, /海峡/i],
  'Nuclear escalation': [/\bnuclear\b/i, /\benrichment\b/i, /\biaea\b/i, /核升级/i, /浓缩铀/i],
  'Ceasefire bargaining': [/\bceasefire\b/i, /\bnegotiat\w*\b/i, /停火/i, /谈判/i],
  'Regional spillover': [/\blebanon\b/i, /\bsyria\b/i, /\bregional\b/i, /外溢/i, /地区/i],
};

const CHAIN_RULES = {
  'Military -> civilian harm': ['Military strike', 'Civilian harm'],
  'Military -> regional spillover': ['Military strike', 'Regional spillover'],
  'Maritime -> energy/shipping risk': ['Maritime blockade', 'Shipping chokepoint risk'],
  'Diplomacy -> ceasefire bargaining': ['Ceasefire / diplomacy', 'Ceasefire bargaining'],
  'Nuclear pressure -> escalation': ['Sanctions / nuclear pressure', 'Nuclear escalation'],
  'Aid -> civilian harm': ['Aid / humanitarian response', 'Civilian harm'],
};

function splitSentences(text) {
  return text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);
}

function matchRules(text, rules) {
  const hits = [];
  for (const [label, patterns] of Object.entries(rules)) {
    if (patterns.some(p => p.test(text))) hits.push(label);
  }
  return hits;
}

function extractEvents(text) {
  const sentences = splitSentences(text);
  const events = [];

  sentences.forEach((sentence, idx) => {
    const actors = matchRules(sentence, ACTOR_RULES);
    const actions = matchRules(sentence, ACTION_RULES);
    const consequences = matchRules(sentence, CONSEQUENCE_RULES);

    if (actors.length || actions.length || consequences.length) {
      events.push({
        sentenceId: idx,
        sentence: sentence.slice(0, 200),
        actors,
        actions,
        consequences,
      });
    }
  });

  return events;
}

function buildChains(events) {
  const chainCounts = {};
  for (const [chainName, [action, consequence]] of Object.entries(CHAIN_RULES)) {
    chainCounts[chainName] = 0;
    for (const ev of events) {
      if (ev.actions.includes(action) && ev.consequences.includes(consequence)) {
        chainCounts[chainName]++;
      }
    }
  }
  return Object.entries(chainCounts)
    .filter(([, c]) => c > 0)
    .map(([chain, count]) => ({ chain, count }))
    .sort((a, b) => b.count - a.count);
}

function aggregateActorAction(events) {
  const flows = {};
  for (const ev of events) {
    for (const actor of ev.actors) {
      for (const action of ev.actions) {
        const key = `${actor}|${action}`;
        flows[key] = (flows[key] || 0) + 1;
      }
    }
  }
  return Object.entries(flows)
    .map(([key, count]) => {
      const [actor, action] = key.split('|');
      return { actor, action, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

function runRuleMining(text) {
  const events = extractEvents(text);
  return {
    events,
    eventCount: events.length,
    chains: buildChains(events),
    actorActionFlows: aggregateActorAction(events),
    actorCounts: countLabels(events, 'actors'),
    actionCounts: countLabels(events, 'actions'),
    consequenceCounts: countLabels(events, 'consequences'),
  };
}

function countLabels(events, field) {
  const counts = {};
  for (const ev of events) {
    for (const label of ev[field]) {
      counts[label] = (counts[label] || 0) + 1;
    }
  }
  return counts;
}

module.exports = {
  ACTOR_RULES, ACTION_RULES, CONSEQUENCE_RULES, CHAIN_RULES,
  runRuleMining, extractEvents, splitSentences,
};
