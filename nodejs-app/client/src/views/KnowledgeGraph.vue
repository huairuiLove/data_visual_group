<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'
import { usePlotly, generateColors } from '../composables/usePlotly'
import { useFisheye, useForceGraph } from '../composables/useFisheye'
import { useDynamicGraph } from '../composables/useDynamicGraph'
import KpiCard from '../components/KpiCard.vue'
import { escapeHtml } from '../utils/html'

const store = useAppStore()

const vizMode = ref('standard')
const selectedTypes = ref([])
const standardChart = ref(null)
const forceChart = ref(null)
const fisheyeChart = ref(null)
const dynamicChart = ref(null)
const chart3d = ref(null)

const { render: renderStandard } = usePlotly(standardChart, { layout: { height: 620 } })
const { render: render3d } = usePlotly(chart3d, { layout: { height: 650, margin: { l: 0, r: 0, t: 0, b: 0 } } })
const { render: renderFisheye } = useFisheye(fisheyeChart)
const { render: renderForce } = useForceGraph(forceChart)
const { render2DDynamic, stop: stopDynamic } = useDynamicGraph()

const allTypes = computed(() => {
  const types = {}
  store.graphData.nodes.forEach(n => { types[n.type] = (types[n.type] || 0) + 1 })
  return Object.entries(types).sort((a, b) => b[1] - a[1])
})

const filteredData = computed(() => {
  if (!selectedTypes.value.length) return store.graphData
  const sel = new Set(selectedTypes.value)
  const nodes = store.graphData.nodes.filter(n => sel.has(n.type))
  const ids = new Set(nodes.map(n => String(n.id)))
  const links = store.graphData.links.filter(l => ids.has(endpointId(l.source)) && ids.has(endpointId(l.target)))
  return { nodes, links }
})

const nodeTypes = computed(() => {
  const types = {}
  filteredData.value.nodes.forEach(n => { types[n.type] = (types[n.type] || 0) + 1 })
  return types
})

function endpointId(value) {
  if (value && typeof value === 'object') return String(value.id ?? value.name ?? value.text ?? '')
  return String(value ?? '')
}

function renderStandardGraph() {
  const { nodes, links } = filteredData.value
  if (!nodes.length) return

  const types = Object.keys(nodeTypes.value).sort()
  const colors = generateColors(types.length)
  const colorMap = {}
  types.forEach((t, i) => { colorMap[t] = colors[i] })

  // Simple layout
  const positions = {}
  const adj = {}
  nodes.forEach(n => { adj[n.id] = []; positions[n.id] = { x: (Math.random()-0.5)*10, y: (Math.random()-0.5)*10 } })
  links.forEach(l => {
    const source = endpointId(l.source)
    const target = endpointId(l.target)
    if (adj[source]) adj[source].push(target)
    if (adj[target]) adj[target].push(source)
  })

  for (let iter = 0; iter < 40; iter++) {
    const forces = {}
    nodes.forEach(n => { forces[n.id] = { x: 0, y: 0 }
      nodes.forEach(m => {
        if (n.id === m.id) return
        const dx = positions[n.id].x - positions[m.id].x, dy = positions[n.id].y - positions[m.id].y
        const dist = Math.hypot(dx, dy) || 1, f = 5 / (dist * dist)
        forces[n.id].x += (dx/dist) * f; forces[n.id].y += (dy/dist) * f
      });
      (adj[n.id] || []).forEach(nb => {
        if (!positions[nb]) return
        forces[n.id].x -= (positions[n.id].x - positions[nb].x) * 0.02
        forces[n.id].y -= (positions[n.id].y - positions[nb].y) * 0.02
      })
      positions[n.id].x += forces[n.id].x * 0.1; positions[n.id].y += forces[n.id].y * 0.1
    })
  }

  // Edges
  const ex = [], ey = []
  links.forEach(l => {
    const s = positions[endpointId(l.source)], t = positions[endpointId(l.target)]
    if (s && t) { ex.push(s.x, t.x, null); ey.push(s.y, t.y, null) }
  })

  // Nodes
  const nx = [], ny = [], nc = [], nt = [], ns = []
  nodes.forEach(n => {
    const p = positions[n.id] || { x: 0, y: 0 }
    nx.push(p.x); ny.push(p.y)
    nc.push(colorMap[n.type] || '#888')
    nt.push(`<b>${escapeHtml((n.id||'').slice(0,30))}</b><br>Type: ${escapeHtml(n.type)}<br>${escapeHtml((n.text||'').slice(0,80))}`)
    ns.push(10 + (adj[n.id]?.length || 0) * 3)
  })

  const traces = [
    { type: 'scatter', x: ex, y: ey, mode: 'lines', line: { width: 0.5, color: '#888' }, hoverinfo: 'none' },
    { type: 'scatter', x: nx, y: ny, mode: 'markers', hoverinfo: 'text', hovertext: nt, marker: { color: nc, size: ns, line: { width: 1 } } },
  ]

  types.forEach(t => {
    traces.push({ type: 'scatter', x: [null], y: [null], mode: 'markers', marker: { size: 10, color: colorMap[t] }, name: `${t} (${nodeTypes.value[t]})` })
  })

  renderStandard(traces, {
    title: '实体关系网络', showlegend: true, hovermode: 'closest',
    xaxis: { showgrid: false, zeroline: false, showticklabels: false },
    yaxis: { showgrid: false, zeroline: false, showticklabels: false },
  })
}

function render3dGraph() {
  const { nodes, links } = filteredData.value
  if (!nodes.length) return

  const types = Object.keys(nodeTypes.value).sort()
  const colors = generateColors(types.length)
  const colorMap = {}
  types.forEach((t, i) => { colorMap[t] = colors[i] })

  // Compute degree for sizing
  const adj = {}
  const degrees = {}
  nodes.forEach(n => { adj[n.id] = []; degrees[n.id] = 0 })
  links.forEach(l => {
    const source = endpointId(l.source)
    const target = endpointId(l.target)
    if (adj[source]) adj[source].push(target)
    if (adj[target]) adj[target].push(source)
    degrees[source] = (degrees[source] || 0) + 1
    degrees[target] = (degrees[target] || 0) + 1
  })

  // Use semantic landscape for X/Y if available, with degree as Z
  const landscape = store.analysisResult?.semanticLandscape
  const positions = {}
  const nodeList = nodes.map((n, i) => {
    const id = String(n.id || '')
    const deg = degrees[id] || 1
    // Try semantic matching
    const semPt = landscape?.points?.find(p =>
      (p.label || '').includes(n.type) || (p.label || '').includes(id.slice(0, 4))
    )
    return {
      id, type: n.type, text: n.text || id, deg,
      x: semPt ? semPt.x * 3 : Math.cos((i / nodes.length) * Math.PI * 2) * (1 + Math.sin(i * 0.5) * 0.3),
      y: semPt ? semPt.y * 3 : Math.sin((i / nodes.length) * Math.PI * 2) * (1 + Math.cos(i * 0.5) * 0.3),
      z: deg * 0.5,
    }
  })
  nodeList.forEach(n => { positions[n.id] = n })

  const ex = [], ey = [], ez = []
  links.forEach(l => {
    const s = positions[endpointId(l.source)], t = positions[endpointId(l.target)]
    if (s && t) { ex.push(s.x, t.x, null); ey.push(s.y, t.y, null); ez.push(s.z, t.z, null) }
  })

  const traces = [{
    type: 'scatter3d', x: ex, y: ey, z: ez, mode: 'lines',
    line: { width: 0.5, color: '#555' }, hoverinfo: 'none', name: '关系',
  }]

  types.forEach(t => {
    const tn = nodeList.filter(n => n.type === t)
    if (!tn.length) return
    traces.push({
      type: 'scatter3d', mode: 'markers+text',
      x: tn.map(n => n.x), y: tn.map(n => n.y), z: tn.map(n => n.z),
      text: tn.map(n => (n.text || '').slice(0, 8)),
      textposition: 'top center', textfont: { size: 8, color: '#bbb' },
      name: `${t} (${tn.length})`,
      marker: {
        size: tn.map(n => 4 + Math.log2(n.deg + 1) * 3),
        color: colorMap[t],
        opacity: 0.9,
        line: { width: 0.5, color: '#fff' },
      },
      hovertext: tn.map(n => `<b>${escapeHtml((n.text||'').slice(0, 30))}</b><br>类型: ${escapeHtml(n.type)}<br>关联数: ${n.deg}`),
      hoverinfo: 'text',
    })
  })

  render3d(traces, {
    title: landscape?.points?.length ? '3D 语义空间 (X/Y=语义, Z=重要度)' : '3D 实体空间 (Z轴=关联度)',
    scene: {
      xaxis: { showticklabels: false, showgrid: true, gridcolor: 'rgba(255,255,255,0.05)' },
      yaxis: { showticklabels: false, showgrid: true, gridcolor: 'rgba(255,255,255,0.05)' },
      zaxis: { showticklabels: false, showgrid: true, gridcolor: 'rgba(255,255,255,0.05)' },
      camera: { eye: { x: 1.8, y: 1.8, z: 1.2 } },
    },
    legend: { x: 0.01, y: 0.99, bgcolor: 'rgba(0,0,0,0.5)' },
  })
}

function updateViz() {
  nextTick(() => {
    if (!filteredData.value.nodes.length) return
    if (vizMode.value === 'standard') renderStandardGraph()
    else if (vizMode.value === 'force') renderForce(filteredData.value.nodes, filteredData.value.links, nodeTypes.value)
    else if (vizMode.value === 'fisheye') renderFisheye(filteredData.value.nodes, filteredData.value.links, nodeTypes.value)
    else if (vizMode.value === 'dynamic') {
      stopDynamic()
      if (dynamicChart.value) {
        render2DDynamic(dynamicChart.value, filteredData.value.nodes, filteredData.value.links, { height: 620 })
      }
    }
    else if (vizMode.value === '3d') render3dGraph()
  })
}

onUnmounted(() => stopDynamic())

function toggleType(type) {
  const idx = selectedTypes.value.indexOf(type)
  if (idx >= 0) selectedTypes.value.splice(idx, 1)
  else selectedTypes.value.push(type)
}

// Init
watch(() => store.graphData, (data) => {
  if (data?.nodes?.length && !selectedTypes.value.length) {
    selectedTypes.value = allTypes.value.slice(0, 5).map(t => t[0])
  }
  updateViz()
}, { immediate: true })

watch(vizMode, updateViz)
watch(selectedTypes, updateViz, { deep: true })
onMounted(updateViz)
</script>

<template>
  <div v-if="!store.fileProcessed" class="empty"><p>请先上传并处理文档。</p></div>
  <div v-else class="view">
    <h2 class="view-title">知识图谱</h2>

    <div v-if="!store.graphData.nodes.length" class="hint">暂无图谱数据。</div>

    <div v-else>
      <div class="kpi-row">
        <KpiCard label="节点总数" :value="store.graphData.nodes.length" />
        <KpiCard label="关系总数" :value="store.graphData.links.length" />
        <KpiCard label="实体类型数" :value="allTypes.length" />
      </div>

      <hr>

      <div class="form-group">
        <label>筛选实体类型</label>
        <div class="type-chips">
          <button v-for="[type, count] in allTypes" :key="type"
            class="chip" :class="{ active: selectedTypes.includes(type) }"
            @click="toggleType(type)">
            {{ type }} ({{ count }})
          </button>
        </div>
      </div>

      <!-- Legend -->
      <div class="legend">
        <span v-for="([type], i) in allTypes" :key="type" class="legend-item">
          <span class="dot" :style="{ background: generateColors(allTypes.length)[i] }"/>{{ type }}
        </span>
      </div>

      <!-- Viz mode tabs -->
      <div class="sub-tabs">
        <button v-for="mode in ['standard','force','fisheye','dynamic','3d']" :key="mode"
          class="sub-tab" :class="{ active: vizMode === mode }"
          @click="vizMode = mode">
          {{ { standard: '标准视图', force: '力导向', fisheye: '鱼眼视图', dynamic: '2D动态', '3d': '三维视图' }[mode] }}
        </button>
      </div>

      <div ref="standardChart" class="chart" v-show="vizMode === 'standard'"/>
      <div ref="forceChart" class="chart chart-tall" v-show="vizMode === 'force'"/>
      <div ref="fisheyeChart" class="chart chart-tall" v-show="vizMode === 'fisheye'"/>
      <div ref="dynamicChart" class="chart chart-tall" v-show="vizMode === 'dynamic'"/>
      <div ref="chart3d" class="chart chart-tall" v-show="vizMode === '3d'"/>

      <details>
        <summary>查看所有节点详情</summary>
        <table class="table">
          <thead><tr><th>ID</th><th>类型</th><th>内容</th></tr></thead>
          <tbody>
            <tr v-for="n in filteredData.nodes.slice(0, 100)" :key="n.id">
              <td>{{ (n.id || '').slice(0, 30) }}</td>
              <td>{{ n.type }}</td>
              <td class="ctx">{{ (n.text || '').slice(0, 100) }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </div>
  </div>
</template>

<style scoped>
.view { max-width: 1400px; }
.view-title { font-size: 1.4rem; margin-bottom: 1rem; color: var(--accent); }
.kpi-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; }
.chart { background: var(--bg-card); border-radius: 8px; min-height: 300px; }
.chart-tall { height: 650px; }
h4 { font-size: 0.95rem; margin: 0.8rem 0 0.4rem; }
hr { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }
.form-group { margin-bottom: 0.8rem; }
.form-group label { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.3rem; }
.type-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chip { padding: 0.25rem 0.6rem; border-radius: 20px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; transition: all 0.2s; }
.chip.active { background: rgba(74,158,255,0.2); border-color: var(--accent); color: var(--accent); }
.sub-tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border); margin: 0.8rem 0 1rem; }
.sub-tab { padding: 0.5rem 1rem; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; font-size: 0.85rem; }
.sub-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.legend { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-bottom: 0.5rem; font-size: 0.8rem; }
.legend-item { display: flex; align-items: center; gap: 0.3rem; }
.dot { width: 10px; height: 10px; border-radius: 50%; }
.table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table th { background: var(--bg-sidebar); color: var(--text-muted); padding: 0.5rem 0.8rem; text-align: left; border-bottom: 2px solid var(--border); }
.table td { padding: 0.4rem 0.8rem; border-bottom: 1px solid var(--border); }
.ctx { color: var(--text-muted); font-size: 0.8rem; }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
.hint { color: var(--text-muted); font-size: 0.9rem; }
details { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; margin: 0.5rem 0; }
details summary { cursor: pointer; font-weight: 600; }
</style>
