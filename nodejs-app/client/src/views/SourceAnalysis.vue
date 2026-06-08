<script setup>
import { ref, onMounted, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { usePlotly } from '../composables/usePlotly'
import KpiCard from '../components/KpiCard.vue'

const store = useAppStore()
const boxChart = ref(null)
const treemapChart = ref(null)
const sankeyChart = ref(null)
const heatmapChart = ref(null)
const { render: renderBox } = usePlotly(boxChart, { layout: { height: 300 } })
const { render: renderTreemap } = usePlotly(treemapChart, { layout: { height: 300 } })
const { render: renderSankey } = usePlotly(sankeyChart, { layout: { height: 400 } })
const { render: renderHeatmap } = usePlotly(heatmapChart, { layout: { height: 400 } })

function renderCharts() {
  // Box plot
  const lengths = store.stats?.textLengths || []
  if (lengths.length) renderBox([{ type: 'box', y: lengths, marker: { color: '#4a9eff' } }])

  // Treemap
  const entityDist = store.stats?.entityDistribution || {}
  if (Object.keys(entityDist).length) {
    renderTreemap([{ type: 'treemap', labels: Object.keys(entityDist), values: Object.values(entityDist), parents: Object.keys(entityDist).map(() => '') }])
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
    Object.entries(pairs).slice(0, 15).forEach(([k, v]) => {
      const [s, t] = k.split('→')
      sources.push(labelIdx[s]); targets.push(labelIdx[t]); values.push(v)
    })

    renderSankey([{
      type: 'sankey', orientation: 'h',
      node: { pad: 15, thickness: 20, line: { color: 'black', width: 0.5 }, label: labels },
      link: { source: sources, target: targets, value: values },
    }], { title: '实体关系流向图' })

    // Heatmap
    const srcTypes = [...new Set(edges.map(e => e.source_type || '?'))].sort()
    const tgtTypes = [...new Set(edges.map(e => e.target_type || '?'))].sort()
    const mat = srcTypes.map(() => tgtTypes.map(() => 0))
    edges.forEach(e => {
      const si = srcTypes.indexOf(e.source_type || '?')
      const ti = tgtTypes.indexOf(e.target_type || '?')
      if (si >= 0 && ti >= 0) mat[si][ti]++
    })

    renderHeatmap([{
      type: 'heatmap', z: mat, x: tgtTypes, y: srcTypes,
      colorscale: 'Viridis', reversescale: true,
    }], { title: '实体类型关系热力图', xaxis: { tickangle: -30 } })
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
    </div>

    <hr>

    <div class="chart-row">
      <div class="chart-half"><h4>文本块大小统计</h4><div ref="boxChart" class="chart"/></div>
      <div class="chart-half"><h4>实体密度分析</h4><div ref="treemapChart" class="chart"/></div>
    </div>

    <h4>关系网络分析</h4>
    <div class="chart-row">
      <div class="chart-half"><div ref="sankeyChart" class="chart"/></div>
      <div class="chart-half"><div ref="heatmapChart" class="chart"/></div>
    </div>
  </div>
</template>

<style scoped>
.view { max-width: 1400px; }
.view-title { font-size: 1.4rem; margin-bottom: 1rem; color: var(--accent); }
.kpi-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; }
.chart { background: var(--bg-card); border-radius: 8px; min-height: 300px; }
.chart-row { display: flex; gap: 1rem; }
.chart-half { flex: 1; min-width: 0; }
h4 { font-size: 0.95rem; margin: 0.8rem 0 0.4rem; }
hr { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
</style>
