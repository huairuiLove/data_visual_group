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

const { render: renderTimeline } = usePlotly(timelineChart, { layout: { height: 400 } })
const { render: render3d } = usePlotly(chart3dDynamic, { layout: { height: 650, margin: { l: 0, r: 0, t: 40, b: 0 } } })

const metrics = computed(() => store.analysisResult?.work1Metrics || {})

function renderNetwork2D() {
  stopDynamic()
  nextTick(() => {
    if (!networkContainer.value || !store.graphData.nodes.length) return
    render2DDynamic(networkContainer.value, store.graphData.nodes, store.graphData.links, { height: 620 })
  })
}

function renderTimelineAnim() {
  const triples = metrics.value.relationTriples || []
  if (!triples.length) return

  const types = [...new Set(triples.map(t => t.type))]
  const frames = types.map((type, fi) => {
    const filtered = triples.filter(t => types.indexOf(t.type) <= fi)
    return {
      name: `frame_${fi}`,
      data: [{
        type: 'bar',
        x: filtered.map(t => `${t.source.slice(0, 12)}→${t.target.slice(0, 12)}`),
        y: filtered.map(t => t.count),
        marker: { color: filtered.map(t => generateColors(types.length)[types.indexOf(t.type)]) },
      }],
    }
  })

  renderTimeline([{
    type: 'bar',
    x: triples.slice(0, 10).map(t => `${t.source.slice(0, 10)}→${t.target.slice(0, 10)}`),
    y: triples.slice(0, 10).map(t => t.count),
    marker: { color: '#4a9eff' },
  }], {
    title: `关系三元组流 (帧 ${animFrame.value + 1}/${Math.max(frames.length, 1)})`,
    xaxis: { tickangle: -45 },
    height: 400,
  })
}

function render3DDynamic() {
  const { nodes, links } = store.graphData
  if (!nodes.length) return

  const types = [...new Set(nodes.map(n => n.type))].sort()
  const colors = generateColors(types.length)
  const colorMap = {}
  types.forEach((t, i) => { colorMap[t] = colors[i] })

  const angle = animFrame.value * 0.05
  const positions = {}
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2 + angle
    const r = 1.2 + (i % 3) * 0.3
    positions[n.id] = {
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      z: Math.sin(a * 2 + angle) * 0.8,
    }
  })

  const ex = [], ey = [], ez = []
  links.forEach(l => {
    const s = positions[l.source], t = positions[l.target]
    if (s && t) { ex.push(s.x, t.x, null); ey.push(s.y, t.y, null); ez.push(s.z, t.z, null) }
  })

  const traces = [{
    type: 'scatter3d', x: ex, y: ey, z: ez, mode: 'lines',
    line: { width: 1 + Math.sin(angle) * 0.5, color: '#666' }, hoverinfo: 'none', name: '关系',
  }]

  types.forEach(t => {
    const tn = nodes.filter(n => n.type === t)
    if (!tn.length) return
    traces.push({
      type: 'scatter3d', mode: 'markers',
      x: tn.map(n => positions[n.id]?.x || 0),
      y: tn.map(n => positions[n.id]?.y || 0),
      z: tn.map(n => positions[n.id]?.z || 0),
      name: `${t} (${tn.length})`,
      marker: { size: 6 + Math.sin(angle) * 2, color: colorMap[t], opacity: 0.9 },
      hovertext: tn.map(n => `<b>${escapeHtml((n.id||'').slice(0, 20))}</b>`),
      hoverinfo: 'text',
    })
  })

  render3d(traces, {
    title: '3D 动态态势图谱',
    scene: {
      camera: { eye: { x: 1.5 * Math.cos(angle), y: 1.5 * Math.sin(angle), z: 1.2 } },
      xaxis: { showticklabels: false }, yaxis: { showticklabels: false }, zaxis: { showticklabels: false },
    },
  })
}

function startAnimation() {
  stopAnimation()
  if (!isPlaying.value) return
  animTimer = setInterval(() => {
    animFrame.value = (animFrame.value + 1) % 60
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
  if (mode.value === 'network2d') renderNetwork2D()
  else if (mode.value === 'timeline2d') { renderTimelineAnim(); startAnimation() }
  else if (mode.value === '3d') { render3DDynamic(); startAnimation() }
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
.chart-tall { min-height: 620px; }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
</style>
