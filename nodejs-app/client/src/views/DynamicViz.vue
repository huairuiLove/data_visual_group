<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAppStore } from '../stores/app'
import { usePlotly, generateColors } from '../composables/usePlotly'
import { useDynamicGraph } from '../composables/useDynamicGraph'
import KpiCard from '../components/KpiCard.vue'
import { escapeHtml } from '../utils/html'

const store = useAppStore()
const { render2DDynamic, stop: stopDynamic } = useDynamicGraph()

const mode = ref('network2d')
const networkContainer = ref(null)
const timelineChart = ref(null)
const chart3dDynamic = ref(null)
const animFrame = ref(0)
const isPlaying = ref(true)
let animTimer = null
let timelineFrameCount = 1

const { render: renderTimeline } = usePlotly(timelineChart, { layout: { height: 400 } })
const { render: render3d } = usePlotly(chart3dDynamic, { layout: { height: 650, margin: { l: 0, r: 0, t: 40, b: 0 } } })

const metrics = computed(() => store.analysisResult?.work1Metrics || {})

function endpointId(value) {
  if (value && typeof value === 'object') return String(value.id ?? value.name ?? value.text ?? '')
  return String(value ?? '')
}

function timelineTriples() {
  const triples = metrics.value.relationTriples || []
  if (triples.length) return triples

  const grouped = new Map()
  for (const link of store.graphData.links || []) {
    const source = endpointId(link.source)
    const target = endpointId(link.target)
    const type = link.type || link.relation || '关系'
    if (!source || !target) continue
    const key = `${source}|||${type}|||${target}`
    const item = grouped.get(key) || { source, target, type, count: 0 }
    item.count += link.count || 1
    grouped.set(key, item)
  }
  return [...grouped.values()].sort((a, b) => b.count - a.count)
}

function renderNetwork2D() {
  stopDynamic()
  nextTick(() => {
    if (!networkContainer.value || !store.graphData.nodes.length) return
    render2DDynamic(networkContainer.value, store.graphData.nodes, store.graphData.links, { height: 620 })
  })
}

function renderTimelineAnim() {
  const triples = timelineTriples()
  if (!triples.length) return

  const types = [...new Set(triples.map(t => t.type))]
  const colors = generateColors(types.length)
  timelineFrameCount = Math.max(types.length, 1)
  const frameIndex = animFrame.value % timelineFrameCount
  const activeTypes = new Set(types.slice(0, frameIndex + 1))
  const filtered = triples
    .filter(t => activeTypes.has(t.type))
    .sort((a, b) => (b.count || 1) - (a.count || 1))
    .slice(0, 16)

  renderTimeline([{
    type: 'bar',
    x: filtered.map(t => `${String(t.source).slice(0, 10)}→${String(t.target).slice(0, 10)}`),
    y: filtered.map(t => t.count || 1),
    marker: { color: filtered.map(t => colors[types.indexOf(t.type)] || '#4a9eff') },
    text: filtered.map(t => t.type),
    hovertemplate: '%{x}<br>关系: %{text}<br>次数: %{y}<extra></extra>',
  }], {
    title: `关系三元组时序动画 (帧 ${frameIndex + 1}/${timelineFrameCount}: ${types[frameIndex] || '关系'})`,
    xaxis: { tickangle: -45 },
    yaxis: { rangemode: 'tozero' },
    height: 400,
  })
}

function render3DDynamic() {
  const { nodes, links } = store.graphData
  if (!nodes.length) return

  // Use semantic landscape data if available for X/Y positions
  const landscape = store.analysisResult?.semanticLandscape
  const kdd = store.analysisResult?.kdd

  const types = [...new Set(nodes.map(n => n.type))].sort()
  const colors = generateColors(types.length)
  const colorMap = {}
  types.forEach((t, i) => { colorMap[t] = colors[i] })

  // Compute node degrees (importance) from links
  const degrees = {}
  links.forEach(l => {
    const s = endpointId(l.source), t = endpointId(l.target)
    degrees[s] = (degrees[s] || 0) + 1; degrees[t] = (degrees[t] || 0) + 1
  })

  // Build positions: use semantic landscape if available, otherwise layout by type
  const positions = {}
  const nodeList = nodes.map((n, i) => {
    const id = String(n.id || '')
    // Try to match with semantic landscape point
    const semPt = landscape?.points?.find(p =>
      (p.label || '').includes(n.type) || (p.label || '').includes(id.slice(0, 4))
    )
    const degree = degrees[id] || 1
    return {
      id, type: n.type, text: n.text || id,
      x: semPt ? semPt.x * 3 : (Math.cos((i / nodes.length) * Math.PI * 2) * (1 + (i % 3) * 0.3)),
      y: semPt ? semPt.y * 3 : (Math.sin((i / nodes.length) * Math.PI * 2) * (1 + (i % 3) * 0.3)),
      z: semPt ? degree * 0.6 : (Math.sin((i / nodes.length) * Math.PI * 4) * 0.8),
      degree,
      clusterLabel: kdd?.labels?.[Math.min(i, kdd.labels.length - 1)] ?? null,
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
    line: { width: 0.6, color: '#666' }, hoverinfo: 'none', name: '关系',
  }]

  types.forEach(t => {
    const tn = nodeList.filter(n => n.type === t)
    if (!tn.length) return
    traces.push({
      type: 'scatter3d', mode: 'markers+text',
      x: tn.map(n => n.x),
      y: tn.map(n => n.y),
      z: tn.map(n => n.z),
      text: tn.map(n => (n.text || '').slice(0, 8)),
      textposition: 'top center',
      textfont: { size: 9, color: '#ccc' },
      name: `${t} (${tn.length})`,
      marker: {
        size: tn.map(n => 5 + Math.log2(n.degree + 1) * 4),
        color: colorMap[t],
        opacity: 0.85,
        line: { width: 0.5, color: '#fff' },
      },
      hovertext: tn.map(n => {
        const cluster = n.clusterLabel !== null ? `<br>群集: ${n.clusterLabel}` : ''
        return `<b>${escapeHtml((n.text||'').slice(0, 30))}</b><br>类型: ${escapeHtml(n.type)}<br>关联数: ${n.degree}${cluster}`
      }),
      hoverinfo: 'text',
    })
  })

  const angle = animFrame.value * 0.03
  render3d(traces, {
    title: landscape?.points?.length
      ? '3D 语义聚类空间 (X/Y=语义坐标, Z=实体重要度)'
      : '3D 实体关系空间 (节点大小=关联度)',
    scene: {
      camera: { eye: { x: 2.5 * Math.cos(angle), y: 2.5 * Math.sin(angle), z: 1.2 } },
      xaxis: { showticklabels: false, title: landscape ? '语义 X' : '' },
      yaxis: { showticklabels: false, title: landscape ? '语义 Y' : '' },
      zaxis: { showticklabels: false, title: '关联度' },
    },
  })
}

function startAnimation() {
  stopAnimation()
  if (!isPlaying.value) return
  animTimer = setInterval(() => {
    animFrame.value = (animFrame.value + 1) % (mode.value === 'timeline2d' ? timelineFrameCount : 360)
    if (mode.value === 'timeline2d') renderTimelineAnim()
    else if (mode.value === '3d') render3DDynamic()
  }, 200)
}

function stopAnimation() {
  if (animTimer) { clearInterval(animTimer); animTimer = null }
}

function togglePlay() {
  isPlaying.value = !isPlaying.value
  if (isPlaying.value) startAnimation()
  else stopAnimation()
}

function updateViz() {
  stopAnimation()
  animFrame.value = 0
  nextTick(() => {
    if (mode.value === 'network2d') renderNetwork2D()
    else if (mode.value === 'timeline2d') { renderTimelineAnim(); startAnimation() }
    else if (mode.value === '3d') { render3DDynamic(); startAnimation() }
  })
}

watch(() => store.graphData, updateViz, { deep: true })
watch(mode, updateViz)
onMounted(updateViz)
onUnmounted(() => { stopAnimation(); stopDynamic() })
</script>

<template>
  <div v-if="!store.fileProcessed" class="empty"><p>请先上传并处理文档。</p></div>
  <div v-else class="view">
    <h2 class="view-title">动态可视化</h2>
    <p class="desc">2D 动态力导向网图、关系三元组时序动画、3D 旋转态势图谱。</p>

    <div class="kpi-row">
      <KpiCard label="节点" :value="store.graphData.nodes.length" />
      <KpiCard label="关系" :value="store.graphData.links.length" />
      <KpiCard label="共现对" :value="(metrics.cooccurrence || []).length" />
    </div>

    <div class="sub-tabs">
      <button v-for="m in ['network2d','timeline2d','3d']" :key="m"
        class="sub-tab" :class="{ active: mode === m }" @click="mode = m">
        {{ { network2d: '2D 动态网图', timeline2d: '2D 时序动画', '3d': '3D 动态图谱' }[m] }}
      </button>
      <button v-if="mode !== 'network2d'" class="sub-tab play-btn" @click="togglePlay">
        {{ isPlaying ? '⏸ 暂停' : '▶ 播放' }}
      </button>
    </div>

    <div ref="networkContainer" class="chart chart-tall" v-show="mode === 'network2d'"/>
    <div ref="timelineChart" class="chart" v-show="mode === 'timeline2d'"/>
    <div ref="chart3dDynamic" class="chart chart-tall" v-show="mode === '3d'"/>
  </div>
</template>

<style scoped>
.view { max-width: 1400px; }
.view-title { font-size: 1.4rem; color: var(--accent); margin-bottom: 0.5rem; }
.desc { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem; }
.kpi-row { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
.sub-tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border); margin-bottom: 1rem; align-items: center; }
.sub-tab { padding: 0.5rem 1rem; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; font-size: 0.85rem; }
.sub-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.play-btn { margin-left: auto; color: var(--accent); }
.chart { background: var(--bg-card); border-radius: 8px; min-height: 300px; }
.chart-tall { height: 620px; }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
</style>
