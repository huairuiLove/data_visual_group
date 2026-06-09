<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { usePlotly, generateColors } from '../composables/usePlotly'
import KpiCard from '../components/KpiCard.vue'

const store = useAppStore()
const boxChart = ref(null)
const treemapChart = ref(null)
const sankeyChart = ref(null)
const heatmapChart = ref(null)
const coverageChart = ref(null)
const chunkQualityChart = ref(null)
const chunkHierarchyChart = ref(null)
const { render: renderChunkSizes } = usePlotly(boxChart, { layout: { height: 340 } })
const { render: renderTreemap } = usePlotly(treemapChart, { layout: { height: 300 } })
const { render: renderSankey } = usePlotly(sankeyChart, { layout: { height: 560 } })
const { render: renderHeatmap } = usePlotly(heatmapChart, { layout: { height: 400 } })
const { render: renderCoverage } = usePlotly(coverageChart, { layout: { height: 360 } })
const { render: renderChunkQuality } = usePlotly(chunkQualityChart, { layout: { height: 360 } })
const { render: renderChunkHierarchy } = usePlotly(chunkHierarchyChart, { layout: { height: 560 } })

const chunkStructure = computed(() => store.stats?.chunkStructure || { sections: [], parents: [], children: [] })
const relationTypeCount = computed(() => new Set((store.edges || []).flatMap((edge) => [edge.source_type || '?', edge.target_type || '?'])).size)
const relationFlowHeight = computed(() => Math.max(580, Math.min(980, 360 + relationTypeCount.value * 34)))
const chunkHierarchyHeight = computed(() => {
  const structure = chunkStructure.value
  const nodeCount = 1 + (structure.sections?.length || 0) + (structure.parents?.length || 0) + (structure.children?.length || 0)
  return Math.max(580, Math.min(1100, 360 + nodeCount * 12))
})

const chunkStats = computed(() => {
  const lengths = store.stats?.textLengths || []
  if (!lengths.length) {
    return { min: 0, max: 0, median: 0, p90: 0, short: 0, normal: 0, long: 0, variance: 0 }
  }
  const sorted = [...lengths].sort((a, b) => a - b)
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: pick(0.5),
    p90: pick(0.9),
    short: lengths.filter((n) => n < 350).length,
    normal: lengths.filter((n) => n >= 350 && n <= 1800).length,
    long: lengths.filter((n) => n > 1800).length,
    variance: Math.round(lengths.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / lengths.length),
  }
})

function chunkEntityDensities(lengths) {
  const entities = (store.analysisResult?.entities || []).map((entity) => String(entity.name || entity.id || '')).filter(Boolean).slice(0, 80)
  const docs = store.analysisResult?.docs || store.analysisResult?.chunks || []
  const fullText = store.analysisResult?.fullText || ''
  if (docs.length) {
    return docs.map((doc) => {
      const text = typeof doc === 'string' ? doc : doc.text || ''
      const mentions = entities.reduce((sum, name) => sum + (text.includes(name) ? 1 : 0), 0)
      return text.length ? Number((mentions / Math.max(1, text.length / 1000)).toFixed(2)) : 0
    })
  }
  return lengths.map((length, index) => {
    const start = lengths.slice(0, index).reduce((sum, n) => sum + n, 0)
    const text = fullText.slice(start, start + length)
    const mentions = entities.reduce((sum, name) => sum + (text.includes(name) ? 1 : 0), 0)
    return length ? Number((mentions / Math.max(1, length / 1000)).toFixed(2)) : 0
  })
}

function renderCharts() {
  // Chunk size sequence and distribution. A box plot collapses to one dot for single-chunk documents.
  const lengths = store.stats?.textLengths || []
  if (lengths.length) {
    const chunkIndex = lengths.map((_, i) => i + 1)
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
    renderChunkSizes([
      {
        type: 'bar',
        name: '文本块大小',
        x: chunkIndex,
        y: lengths,
        marker: {
          color: lengths.map((length) => length >= mean ? '#4a9eff' : '#7bd88f'),
          opacity: 0.72,
        },
        hovertemplate: '文本块 %{x}<br>%{y} 字符<extra></extra>',
      },
      {
        type: 'scatter',
        mode: 'lines',
        name: '平均大小',
        x: chunkIndex,
        y: lengths.map(() => Math.round(mean)),
        line: { color: '#ffca3a', width: 2, dash: 'dash' },
        hovertemplate: '平均: %{y} 字符<extra></extra>',
      },
      {
        type: 'histogram',
        name: '大小分布',
        x: lengths,
        yaxis: 'y2',
        opacity: 0.38,
        marker: { color: '#ff8a65' },
        nbinsx: Math.min(12, Math.max(3, Math.ceil(Math.sqrt(lengths.length)))),
        hovertemplate: '%{x} 字符附近<br>%{y} 个文本块<extra></extra>',
      },
    ], {
      title: '文本块大小序列与分布',
      barmode: 'overlay',
      xaxis: { title: '文本块序号' },
      yaxis: { title: '字符数', rangemode: 'tozero' },
      yaxis2: { title: '分布频数', overlaying: 'y', side: 'right', rangemode: 'tozero', showgrid: false },
      legend: { orientation: 'h', y: -0.22 },
      margin: { l: 55, r: 55, t: 45, b: 80 },
    })

    const cumulative = []
    lengths.reduce((sum, length) => {
      const next = sum + length
      cumulative.push(next)
      return next
    }, 0)
    const total = cumulative[cumulative.length - 1] || 1
    const densities = chunkEntityDensities(lengths)
    renderCoverage([
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: '累计文本覆盖',
        x: chunkIndex,
        y: cumulative.map((value) => Number(((value / total) * 100).toFixed(1))),
        line: { color: '#4a9eff', width: 2 },
        marker: { size: 7 },
        hovertemplate: '文本块 %{x}<br>累计覆盖 %{y}%<extra></extra>',
      },
      {
        type: 'bar',
        name: '实体密度/千字',
        x: chunkIndex,
        y: densities,
        yaxis: 'y2',
        marker: { color: '#7bd88f', opacity: 0.48 },
        hovertemplate: '文本块 %{x}<br>实体密度 %{y}/千字<extra></extra>',
      },
    ], {
      title: '切块覆盖与实体密度',
      xaxis: { title: '文本块序号' },
      yaxis: { title: '累计覆盖率 (%)', range: [0, 105] },
      yaxis2: { title: '实体密度', overlaying: 'y', side: 'right', rangemode: 'tozero', showgrid: false },
      legend: { orientation: 'h', y: -0.22 },
      margin: { l: 55, r: 55, t: 45, b: 80 },
    })

    const qualityLabels = ['过短 <350', '适中 350-1800', '过长 >1800']
    const qualityValues = [chunkStats.value.short, chunkStats.value.normal, chunkStats.value.long]
    renderChunkQuality([
      {
        type: 'bar',
        name: '文本块数量',
        x: qualityLabels,
        y: qualityValues,
        marker: { color: ['#ff8a65', '#7bd88f', '#ffca3a'] },
        hovertemplate: '%{x}<br>%{y} 个文本块<extra></extra>',
      },
      {
        type: 'scatter',
        mode: 'markers+text',
        name: '长度分位',
        x: ['最小', '中位', 'P90', '最大'],
        y: [chunkStats.value.min, chunkStats.value.median, chunkStats.value.p90, chunkStats.value.max],
        yaxis: 'y2',
        text: [chunkStats.value.min, chunkStats.value.median, chunkStats.value.p90, chunkStats.value.max].map((v) => `${v}`),
        textposition: 'top center',
        marker: { color: '#4a9eff', size: 11 },
        hovertemplate: '%{x}<br>%{y} 字符<extra></extra>',
      },
    ], {
      title: '切块质量分布',
      yaxis: { title: '文本块数量', rangemode: 'tozero' },
      yaxis2: { title: '字符数分位', overlaying: 'y', side: 'right', rangemode: 'tozero', showgrid: false },
      legend: { orientation: 'h', y: -0.22 },
      margin: { l: 55, r: 55, t: 45, b: 80 },
    })

    const sections = chunkStructure.value.sections || []
    const parents = chunkStructure.value.parents || []
    const children = chunkStructure.value.children || []
    if (sections.length || parents.length || children.length) {
      const labels = []
      const labelIndex = new Map()
      const addLabel = (label) => {
        if (!labelIndex.has(label)) {
          labelIndex.set(label, labels.length)
          labels.push(label)
        }
        return labelIndex.get(label)
      }
      const source = []
      const target = []
      const value = []
      const hover = []
      const docLabel = addLabel('文档')

      sections.forEach((section, sectionOrder) => {
        const sectionLabel = addLabel(`章节 ${sectionOrder + 1}: ${String(section.title || '全文').slice(0, 18)}`)
        source.push(docLabel)
        target.push(sectionLabel)
        value.push(Math.max(1, section.childCount || 1))
        hover.push(`${section.title || '全文'}<br>${section.childCount || 0} 个子块 / ${section.chars || 0} 字符`)
      })

      parents.forEach((parent) => {
        const section = sections.find((item) => item.id === parent.sectionId)
        const sectionOrder = Math.max(0, sections.findIndex((item) => item.id === parent.sectionId))
        const sectionLabel = addLabel(`章节 ${sectionOrder + 1}: ${String(section?.title || '全文').slice(0, 18)}`)
        const parentLabel = addLabel(`父块 ${parent.parentIndex + 1}`)
        source.push(sectionLabel)
        target.push(parentLabel)
        value.push(Math.max(1, parent.childCount || 1))
        hover.push(`父块 ${parent.parentIndex + 1}<br>${parent.childCount || 0} 个子块 / ${parent.chars || 0} 字符`)
      })

      const childBuckets = new Map()
      children.forEach((child) => {
        const key = child.parentId
        const item = childBuckets.get(key) || { parentId: key, count: 0, chars: 0 }
        item.count += 1
        item.chars += child.chars || 0
        childBuckets.set(key, item)
      })
      ;[...childBuckets.values()].forEach((bucket) => {
        const parent = parents.find((item) => item.id === bucket.parentId)
        if (!parent) return
        const parentLabel = addLabel(`父块 ${parent.parentIndex + 1}`)
        const childLabel = addLabel(`子块 x${bucket.count}`)
        source.push(parentLabel)
        target.push(childLabel)
        value.push(Math.max(1, bucket.count))
        hover.push(`${bucket.count} 个子块<br>${bucket.chars} 字符`)
      })

      renderChunkHierarchy([{
        type: 'sankey',
        arrangement: 'snap',
        node: {
          pad: 16,
          thickness: 16,
          label: labels,
          color: generateColors(labels.length),
          line: { color: 'rgba(255,255,255,0.22)', width: 0.5 },
        },
        link: {
          source,
          target,
          value,
          customdata: hover,
          color: 'rgba(74,158,255,0.24)',
          hovertemplate: '%{customdata}<extra></extra>',
        },
      }], {
        title: '文本分层 Chunk 关系图',
        height: chunkHierarchyHeight.value,
        margin: { l: 10, r: 10, t: 45, b: 20 },
      })
    }
  }

  // Treemap
  const entityDist = store.stats?.entityDistribution || {}
  if (Object.keys(entityDist).length) {
    const labels = Object.keys(entityDist)
    renderTreemap([{
      type: 'treemap',
      labels,
      values: Object.values(entityDist),
      parents: labels.map(() => ''),
      marker: { colors: generateColors(labels.length) },
      hovertemplate: '%{label}<br>%{value} 个实体<extra></extra>',
    }], { title: '实体类型占比' })
  }

  // Sankey & Heatmap
  const edges = store.edges
  if (edges?.length) {
    // Sankey
    const pairs = {}
    edges.forEach(e => {
      const k = (e.source_type || '?') + '→' + (e.target_type || '?')
      pairs[k] = (pairs[k] || 0) + 1
    })

    const labels = [...new Set(edges.flatMap(e => [e.source_type || '?', e.target_type || '?']))]
    const labelIdx = {}
    labels.forEach((l, i) => { labelIdx[l] = i })

    const sources = [], targets = [], values = []
    Object.entries(pairs).forEach(([k, v]) => {
      const [s, t] = k.split('→')
      sources.push(labelIdx[s]); targets.push(labelIdx[t]); values.push(v)
    })

    renderSankey([{
      type: 'sankey', orientation: 'h',
      node: {
        pad: 22,
        thickness: 20,
        line: { color: 'rgba(255,255,255,0.25)', width: 0.5 },
        label: labels,
        color: generateColors(labels.length),
      },
      link: { source: sources, target: targets, value: values, color: 'rgba(74,158,255,0.26)' },
    }], {
      title: '实体关系流向图',
      height: relationFlowHeight.value,
      margin: { l: 10, r: 10, t: 45, b: 20 },
    })

    // Heatmap
    const allTypes = [...new Set(edges.flatMap(e => [e.source_type || '?', e.target_type || '?']))].sort()
    const mat = allTypes.map(() => allTypes.map(() => 0))
    edges.forEach(e => {
      const si = allTypes.indexOf(e.source_type || '?')
      const ti = allTypes.indexOf(e.target_type || '?')
      if (si >= 0 && ti >= 0) mat[si][ti]++
    })

    renderHeatmap([{
      type: 'heatmap',
      z: mat,
      x: allTypes,
      y: allTypes,
      colorscale: 'Viridis', reversescale: true,
      hovertemplate: '源类型 %{y}<br>目标类型 %{x}<br>关系数 %{z}<extra></extra>',
    }], {
      title: '实体类型关系热力图',
      height: Math.max(460, Math.min(900, 260 + allTypes.length * 32)),
      xaxis: { tickangle: -30, automargin: true },
      yaxis: { automargin: true },
      margin: { l: 95, r: 30, t: 45, b: 100 },
    })
  }
}

onMounted(renderCharts)
watch(() => [store.stats, store.edges], renderCharts, { deep: true })
</script>

<template>
  <div v-if="!store.fileProcessed" class="empty"><p>请先上传并处理文档。</p></div>
  <div v-else class="view">
    <h2 class="view-title">来源分析</h2>

    <div class="kpi-row">
      <KpiCard label="文档名称" :value="(store.currentFile || 'N/A').slice(0, 20)" />
      <KpiCard label="文本块数" :value="store.meta.totalChunks || 0" />
      <KpiCard label="平均块大小" :value="(store.stats.meanChunkSize || 0) + ' 字符'" />
      <KpiCard label="总字符数" :value="(store.stats.totalChars || 0).toLocaleString()" />
      <KpiCard label="中位块大小" :value="chunkStats.median + ' 字符'" />
      <KpiCard label="块长度方差" :value="chunkStats.variance.toLocaleString()" />
      <KpiCard label="章节/父块/子块" :value="`${chunkStructure.sectionCount || 0}/${chunkStructure.parentCount || 0}/${chunkStructure.childCount || 0}`" />
    </div>

    <hr>

    <div class="chart-row">
      <div class="chart-half"><h4>文本块大小序列与分布</h4><div ref="boxChart" class="chart chart-chunks"/></div>
      <div class="chart-half"><h4>实体密度分析</h4><div ref="treemapChart" class="chart"/></div>
    </div>

    <h4>文本处理与切块质量</h4>
    <div class="chart-row">
      <div class="chart-half"><div ref="coverageChart" class="chart chart-tech"/></div>
      <div class="chart-half"><div ref="chunkQualityChart" class="chart chart-tech"/></div>
    </div>
    <div class="chart-row">
      <div class="chart-full"><div ref="chunkHierarchyChart" class="chart chart-flow" :style="{ minHeight: chunkHierarchyHeight + 'px' }"/></div>
    </div>

    <h4>关系网络分析</h4>
    <div class="chart-row">
      <div class="chart-half"><div ref="sankeyChart" class="chart chart-flow" :style="{ minHeight: relationFlowHeight + 'px' }"/></div>
      <div class="chart-half"><div ref="heatmapChart" class="chart chart-flow"/></div>
    </div>
  </div>
</template>

<style scoped>
.view { max-width: 1400px; }
.view-title { font-size: 1.4rem; margin-bottom: 1rem; color: var(--accent); }
.kpi-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; }
.chart { background: var(--bg-card); border-radius: 8px; min-height: 300px; }
.chart-chunks { min-height: 360px; }
.chart-row { display: flex; gap: 1rem; margin-bottom: 1rem; }
.chart-half { flex: 1; min-width: 0; }
.chart-full { flex: 1 1 100%; min-width: 0; }
.chart-tech { min-height: 380px; }
.chart-flow { min-height: 580px; }
h4 { font-size: 0.95rem; margin: 0.8rem 0 0.4rem; }
hr { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
@media (max-width: 960px) {
  .chart-row { flex-direction: column; }
}
</style>
