<script setup>
import { ref, onMounted, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { usePlotly } from '../composables/usePlotly'
import KpiCard from '../components/KpiCard.vue'

const store = useAppStore()

const entityPie = ref(null)
const relBar = ref(null)
const docuburst = ref(null)
const keywordChart = ref(null)
const categoryChart = ref(null)
const cooccurHeatmap = ref(null)
const keywordNetwork = ref(null)
const topEntitiesChart = ref(null)
const semanticChart = ref(null)
const { render: renderEntityPie } = usePlotly(entityPie)
const { render: renderRelBar } = usePlotly(relBar)
const { render: renderDocuburst } = usePlotly(docuburst, { layout: { height: 600 } })
const { render: renderKeywords } = usePlotly(keywordChart, { layout: { height: 380, yaxis: { categoryorder: 'total ascending' } } })
const { render: renderCategories } = usePlotly(categoryChart, { layout: { height: 380 } })
const { render: renderCooccur } = usePlotly(cooccurHeatmap, { layout: { height: 450 } })
const { render: renderKwNetwork } = usePlotly(keywordNetwork, { layout: { height: 450 } })
const { render: renderTopEntities } = usePlotly(topEntitiesChart, { layout: { height: 380, yaxis: { categoryorder: 'total ascending' } } })
const { render: renderSemantic } = usePlotly(semanticChart, { layout: { height: 400 } })

function renderCharts() {
  if (!store.analysisResult) return
  const { stats, entityData, keywordData } = store

  // Entity pie
  const entityDist = stats?.entityDistribution || {}
  if (Object.keys(entityDist).length) {
    renderEntityPie([{
      type: 'pie', values: Object.values(entityDist), labels: Object.keys(entityDist),
      hole: 0.3, textposition: 'inside', textinfo: 'percent+label',
    }], { height: 350, showlegend: false })
  }

  // Rel bar
  const relDist = stats?.relationDistribution || {}
  if (Object.keys(relDist).length) {
    renderRelBar([{
      type: 'bar', x: Object.keys(relDist), y: Object.values(relDist),
      marker: { color: '#4a9eff' },
    }], { height: 350, xaxis: { tickangle: -30 } })
  }

  // DocuBurst — keyword → category → entity hierarchy
  const topEnt = store.work1Metrics?.topEntities || []
  const kwEdges = store.work1Metrics?.keywordCooccurrence?.edges || []
  const kwWords = store.work1Metrics?.keywordCooccurrence?.keywords || []
  if (topEnt.length || kwWords.length) {
    const data = [{ id: 'root', labels: (store.meta?.title || '文档').slice(0, 15), parent: '', value: 0 }]
    const total = topEnt.length + kwWords.length + Object.keys(keywordData?.categoryDistribution || {}).length

    // Level 1: Categories
    const cats = Object.entries(keywordData?.categoryDistribution || {})
    cats.forEach(([cat, cnt]) => {
      data.push({ id: 'cat_' + cat, labels: cat, parent: 'root', value: cnt })
    })
    if (!cats.length) data.push({ id: 'cat_主题', labels: '核心主题', parent: 'root', value: topEnt.length })

    // Level 2: Top entities (under first category or "核心主题")
    const parentCat = cats.length ? 'cat_' + cats[0][0] : 'cat_主题'
    topEnt.slice(0, 10).forEach(e => {
      const id = 'ent_' + (e.name || '').replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '_').slice(0, 20)
      data.push({ id, labels: (e.name || '').slice(0, 12), parent: parentCat, value: Math.max(1, e.count || 1) })
    })

    // Level 2: Keywords under "关键词" category
    const kwCatId = 'cat_关键词'
    data.push({ id: kwCatId, labels: '关键词', parent: 'root', value: kwWords.length })
    kwWords.slice(0, 8).forEach(k => {
      const id = 'kw_' + (k.term || '').replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '_').slice(0, 20)
      data.push({ id, labels: (k.term || '').slice(0, 10), parent: kwCatId, value: Math.max(1, k.score || 1) })
    })

    // Calculate root value
    data[0].value = total

    renderDocuburst([{ type: 'sunburst', ids: data.map(d => d.id), labels: data.map(d => d.labels), parents: data.map(d => d.parent), values: data.map(d => d.value), branchvalues: 'total', textinfo: 'label+percent parent', maxdepth: 3 }])
  }

  // Keywords
  const keywords = keywordData?.keywords || []
  if (keywords.length) {
    const top = keywords.slice(0, 15)
    renderKeywords([{ type: 'bar', x: top.map(k => k.score), y: top.map(k => k.term), orientation: 'h', marker: { color: '#ff7f50' } }])
  }

  // Categories
  const catDist = keywordData?.categoryDistribution || {}
  if (Object.keys(catDist).length) {
    renderCategories([{ type: 'pie', values: Object.values(catDist), labels: Object.keys(catDist), hole: 0.35, textposition: 'inside', textinfo: 'percent+label' }])
  }

  // work1 metrics (topEnt, cooccurrence declared above)
  if (topEnt.length) {
    renderTopEntities([{
      type: 'bar', orientation: 'h',
      x: topEnt.slice(0, 15).map(e => e.count),
      y: topEnt.slice(0, 15).map(e => (e.name || '').slice(0, 20)),
      marker: { color: '#55a868' },
    }], { title: 'Top 实体 (work1 llm_03)', height: 380 })
  }

  const cooc = w1.cooccurrence || []
  if (cooc.length >= 3) {
    const entities = [...new Set(cooc.flatMap(c => [c.source, c.target]))].slice(0, 12)
    const z = entities.map(() => entities.map(() => 0))
    cooc.forEach(c => {
      const i = entities.indexOf(c.source), j = entities.indexOf(c.target)
      if (i >= 0 && j >= 0) { z[i][j] = c.weight; z[j][i] = c.weight }
    })
    renderCooccur([{
      type: 'heatmap', x: entities.map(e => e.slice(0, 10)), y: entities.map(e => e.slice(0, 10)),
      z, colorscale: 'YlOrRd',
    }], { title: '实体共现热力图 (work1 llm_05)', height: 450 })
  }

  const landscape = store.analysisResult?.semanticLandscape
  if (landscape?.points?.length) {
    renderSemantic([{
      type: 'scatter',
      x: landscape.points.map(p => p.x),
      y: landscape.points.map(p => p.y),
      mode: 'markers+text',
      text: landscape.points.map((_, i) => String(i + 1)),
      textposition: 'top center',
      marker: { size: 10, color: landscape.points.map(p => p.label), colorscale: 'Viridis', showscale: true },
      hovertext: landscape.points.map(p => p.textPreview),
      hoverinfo: 'text',
    }], {
      title: '语义景观 (SVD 2D, work1 adv_01)',
      showlegend: false, height: 400,
      xaxis: { showgrid: true, zeroline: false }, yaxis: { showgrid: true, zeroline: false },
    })
  }

  const kwEdges = w1.keywordCooccurrence?.edges || []
  const kwWords = w1.keywordCooccurrence?.keywords || []
  if (kwEdges.length && kwWords.length) {
    const terms = kwWords.slice(0, 12).map(k => k.term)
    const pos = {}
    terms.forEach((t, i) => {
      const a = (i / terms.length) * Math.PI * 2
      pos[t] = { x: Math.cos(a) * 3, y: Math.sin(a) * 3 }
    })
    const ex = [], ey = []
    kwEdges.filter(e => pos[e.source] && pos[e.target]).forEach(e => {
      ex.push(pos[e.source].x, pos[e.target].x, null)
      ey.push(pos[e.source].y, pos[e.target].y, null)
    })
    renderKwNetwork([
      { type: 'scatter', x: ex, y: ey, mode: 'lines', line: { width: 0.5, color: '#666' }, hoverinfo: 'none' },
      { type: 'scatter', x: terms.map(t => pos[t]?.x), y: terms.map(t => pos[t]?.y), mode: 'markers+text',
        text: terms, textposition: 'top center', marker: { size: 12, color: '#ff7f50' } },
    ], { title: '关键词共现网络', showlegend: false, height: 450,
      xaxis: { showgrid: false, zeroline: false, showticklabels: false },
      yaxis: { showgrid: false, zeroline: false, showticklabels: false },
    })
  }
}

onMounted(renderCharts)
watch(() => store.analysisResult, renderCharts)
</script>

<template>
  <div v-if="!store.fileProcessed" class="empty"><p>请先上传并处理文档。</p></div>
  <div v-else class="view">
    <h2 class="view-title">态势总览</h2>

    <div class="kpi-row">
      <KpiCard label="文本块数" :value="store.meta.totalChunks || 0" />
      <KpiCard label="识别实体" :value="store.meta.totalEntities || 0" />
      <KpiCard label="发现关系" :value="store.meta.totalRelations || 0" />
      <KpiCard label="识别人物" :value="store.personData.totalPersons || 0" />
      <KpiCard label="地理位置" :value="store.spatialData.totalLocations || 0" />
      <KpiCard label="总字符数" :value="(store.stats.totalChars || 0).toLocaleString()" />
    </div>

    <hr>

    <div class="chart-row">
      <div class="chart-half"><h4>实体类型分布</h4><div ref="entityPie" class="chart"/></div>
      <div class="chart-half"><h4>关系类型分布</h4><div ref="relBar" class="chart"/></div>
    </div>

    <details open><summary>文档内容层级结构 (DocuBurst)</summary><div ref="docuburst" class="chart"/></details>

    <hr>

    <div class="chart-row">
      <div class="chart-half"><h4>文档关键词 (TF-IDF)</h4><div ref="keywordChart" class="chart"/></div>
      <div class="chart-half"><h4>事件类别分布</h4><div ref="categoryChart" class="chart"/></div>
    </div>

    <details open><summary>work1 风格分析 (Top 实体)</summary><div ref="topEntitiesChart" class="chart"/></details>

    <details v-if="store.analysisResult?.semanticLandscape?.points?.length">
      <summary>语义景观 (SVD 投影)</summary>
      <div ref="semanticChart" class="chart"/>
    </details>

    <details v-if="store.analysisResult?.ruleMining?.chains?.length" open>
      <summary>规则挖掘 — 冲突链 ({{ store.analysisResult.ruleMining.eventCount }} 事件)</summary>
      <div class="kpi-row">
        <KpiCard v-for="c in store.analysisResult.ruleMining.chains.slice(0, 4)" :key="c.chain"
          :label="c.chain" :value="c.count" />
      </div>
    </details>

    <div class="chart-row">
      <div class="chart-half"><h4>实体共现热力图</h4><div ref="cooccurHeatmap" class="chart"/></div>
      <div class="chart-half"><h4>关键词共现网络</h4><div ref="keywordNetwork" class="chart"/></div>
    </div>

    <h4>识别的人物名称</h4>
    <table class="table">
      <thead><tr><th>#</th><th>姓名</th><th>次数</th><th>头衔</th><th>上下文</th></tr></thead>
      <tbody>
        <tr v-for="(p, i) in (store.personData.personList || []).slice(0, 15)" :key="i">
          <td>{{ i + 1 }}</td><td>{{ p.name }}</td><td>{{ p.count }}</td>
          <td>{{ p.title || '-' }}</td><td class="ctx">{{ (p.context || '').slice(0, 80) }}</td>
        </tr>
      </tbody>
    </table>

    <h4>自动洞察</h4>
    <ul><li v-for="(ins, i) in store.insights" :key="i">{{ ins }}</li></ul>

    <hr>
    <h4>数据处理管线</h4>
    <div class="kpi-row">
      <KpiCard label="文档加载" :value="store.meta.totalChunks || 0" />
      <KpiCard label="关键词分析" :value="(store.keywordData.keywords || []).length" />
      <KpiCard label="人物识别" :value="store.personData.totalPersons || 0" />
      <KpiCard label="图谱构建" :value="`${store.meta.totalEntities || 0}实体/${store.meta.totalRelations || 0}关系`" />
      <KpiCard label="时间线" :value="`${store.meta.timelineEvents || 0}事件/${store.timeline.length}节点`" />
      <KpiCard label="空间提取" :value="store.spatialData.totalLocations || 0" />
    </div>
  </div>
</template>

<style scoped>
.view { max-width: 1400px; }
.view-title { font-size: 1.4rem; margin-bottom: 1rem; color: var(--accent); }
.kpi-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; }
.chart-row { display: flex; gap: 1rem; }
.chart-half { flex: 1; min-width: 0; }
.chart { background: var(--bg-card); border-radius: 8px; min-height: 300px; }
h4 { font-size: 0.95rem; margin: 0.8rem 0 0.4rem; }
hr { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }
.table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table th { background: var(--bg-sidebar); color: var(--text-muted); padding: 0.5rem 0.8rem; text-align: left; border-bottom: 2px solid var(--border); }
.table td { padding: 0.4rem 0.8rem; border-bottom: 1px solid var(--border); }
.ctx { color: var(--text-muted); font-size: 0.8rem; }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
details { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; margin: 0.5rem 0; }
details summary { cursor: pointer; font-weight: 600; }
</style>
