<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useAppStore } from '../stores/app'
import { usePlotly, generateColors } from '../composables/usePlotly'
import { useDynamicGraph } from '../composables/useDynamicGraph'
import KpiCard from '../components/KpiCard.vue'
import { escapeHtml } from '../utils/html'

const store = useAppStore()
const { render2DDynamic, stop: stopDynamic } = useDynamicGraph()

const mode = ref('trend')
const networkContainer = ref(null)
const timelineChart = ref(null)
const flowChart = ref(null)
const animFrame = ref(0)
const isPlaying = ref(true)
let animTimer = null
let timelineFrameCount = 1

const { render: renderTimeline } = usePlotly(timelineChart, { layout: { height: 400 } })
const { render: renderFlow } = usePlotly(flowChart, { layout: { height: 520 } })

const metrics = computed(() => store.analysisResult?.work1Metrics || {})
const entityTypeById = computed(() => {
  const map = new Map()
  for (const node of store.graphData.nodes || []) {
    const id = endpointId(node.id || node.name)
    if (id) map.set(id, displayText(node.type) || '未分类实体')
  }
  for (const entity of store.analysisResult?.entities || []) {
    const id = endpointId(entity.id || entity.name)
    if (id) map.set(id, displayText(entity.type) || map.get(id) || '未分类实体')
  }
  return map
})

const graphNodeIds = computed(() => new Set((store.graphData.nodes || []).map((node) => endpointId(node.id))))

function cleanType(type) {
  const text = displayText(type).trim()
  if (!text || text.toLowerCase() === 'unknown' || text === 'UNKNOWN') return '未分类实体'
  return text
}

function relationEndpoint(rel, side) {
  const raw = side === 'source'
    ? rel.source ?? rel.source_id ?? rel.from
    : rel.target ?? rel.target_id ?? rel.to
  return endpointId(raw)
}

function relationType(rel) {
  const text = displayText(rel.type ?? rel.relation ?? rel.relationType ?? rel.label)
  return text && text !== 'UNKNOWN' ? text : '关系'
}

const normalizedRelations = computed(() => {
  const rawRelations =
    store.analysisResult?.relations?.length
      ? store.analysisResult.relations
      : store.edges?.length
        ? store.edges
        : store.graphData.links || []

  const nodeIds = graphNodeIds.value
  return rawRelations
    .map((rel, index) => {
      const source = relationEndpoint(rel, 'source')
      const target = relationEndpoint(rel, 'target')
      const sourceType = cleanType(rel.source_type || entityTypeById.value.get(source))
      const targetType = cleanType(rel.target_type || entityTypeById.value.get(target))
      return {
        source,
        target,
        type: relationType(rel),
        sourceType,
        targetType,
        count: Number(rel.count || rel.weight || 1),
        step: index,
        summary: displayText(rel.summary || rel.text || ''),
      }
    })
    .filter((rel) => rel.source && rel.target && (!nodeIds.size || (nodeIds.has(rel.source) && nodeIds.has(rel.target))))
    .map((rel, index) => ({ ...rel, step: index }))
})

function endpointId(value) {
  if (value && typeof value === 'object') return String(value.id ?? value.name ?? value.text ?? '')
  return String(value ?? '')
}

function displayText(value) {
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join(' ')
  if (value && typeof value === 'object') return String(value.label ?? value.name ?? value.id ?? value.text ?? '')
  return String(value ?? '')
}

function timelineTriples() {
  const triples = (metrics.value.relationTriples || [])
    .map((triple) => ({
      source: relationEndpoint(triple, 'source'),
      target: relationEndpoint(triple, 'target'),
      type: relationType(triple),
      count: Number(triple.count || 1),
    }))
    .filter((triple) => triple.source && triple.target)
  if (triples.length) return triples
  return normalizedRelations.value
}

function buildEvolutionRows() {
  const days = (store.timeline || [])
    .map((day) => ({
      date: String(day.date || ''),
      events: day.events || [],
      count: day.count || day.events?.length || 0,
      categories: day.categories || [],
    }))
    .filter((day) => day.date)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (days.length) {
    const rows = []
    for (const day of days) {
      const counts = {}
      if (day.events.length) {
        for (const event of day.events) {
          const category = displayText(event.category || '其他') || '其他'
          counts[category] = (counts[category] || 0) + 1
        }
      } else if (day.categories.length) {
        for (const category of day.categories) counts[displayText(category) || '其他'] = Math.max(day.count, 1)
      } else {
        counts['事件'] = Math.max(day.count, 1)
      }
      Object.entries(counts).forEach(([category, count]) => rows.push({ date: day.date, category, count }))
    }
    return rows
  }

  const triples = timelineTriples().slice(0, 30)
  return triples.map((triple, index) => ({
    date: `结构阶段 ${index + 1}`,
    category: displayText(triple.type) || '关系',
    count: triple.count || 1,
    label: `${displayText(triple.source).slice(0, 12)} → ${displayText(triple.target).slice(0, 12)}`,
  }))
}

function renderNetwork2D() {
  stopDynamic()
  nextTick(() => {
    if (!networkContainer.value || !store.graphData.nodes.length) return
    const links = normalizedRelations.value.length ? normalizedRelations.value : store.graphData.links
    render2DDynamic(networkContainer.value, store.graphData.nodes, links, {
      height: 620,
      relationSequence: links,
    })
  })
}

function renderEvolutionTrend() {
  const rows = buildEvolutionRows()
  if (!rows.length) return

  const dates = [...new Set(rows.map(r => r.date))]
  const categories = [...new Set(rows.map(r => r.category))]
    .sort((a, b) => rows.filter(r => r.category === b).reduce((s, r) => s + r.count, 0) - rows.filter(r => r.category === a).reduce((s, r) => s + r.count, 0))
    .slice(0, 8)
  const colors = generateColors(categories.length || 1)
  timelineFrameCount = Math.max(dates.length, 1)
  const frameIndex = animFrame.value % timelineFrameCount
  const visibleDates = dates.slice(0, frameIndex + 1)
  const visible = rows.filter(r => visibleDates.includes(r.date) && categories.includes(r.category))
  const currentDate = visibleDates[visibleDates.length - 1]
  const currentRows = visible.filter(r => r.date === currentDate)

  const cumulativeByCategory = new Map()
  const traces = categories.map((category, i) => ({
    type: 'scatter',
    mode: 'lines+markers',
    name: category,
    x: visibleDates,
    y: visibleDates.map(date => {
      const previous = cumulativeByCategory.get(category) || 0
      const next = previous + visible.filter(r => r.date === date && r.category === category).reduce((s, r) => s + r.count, 0)
      cumulativeByCategory.set(category, next)
      return next
    }),
    stackgroup: 'trend',
    line: { width: 1.8, color: colors[i] },
    fillcolor: colors[i].replace('rgb(', 'rgba(').replace(')', ',0.28)'),
    hovertemplate: `%{x}<br>${escapeHtml(category)}: %{y}<extra></extra>`,
  }))

  traces.push({
    type: 'scatter',
    mode: 'markers+text',
    name: '当前阶段',
    x: currentRows.map(() => currentDate),
    y: currentRows.map(r => r.count),
    text: currentRows.map(r => r.category),
    textposition: 'top center',
    marker: {
      size: currentRows.map(r => 12 + Math.sqrt(r.count) * 10),
      color: currentRows.map(r => colors[categories.indexOf(r.category)] || '#4a9eff'),
      line: { width: 1, color: '#fff' },
      opacity: 0.9,
    },
    hovertemplate: '%{text}<br>当前事件量: %{y}<extra></extra>',
    yaxis: 'y2',
  })

  renderTimeline(traces, {
    title: dates[0]?.startsWith('结构阶段')
      ? `关系结构累积变化 (${frameIndex + 1}/${timelineFrameCount})`
      : `事件态势趋势 (${visibleDates[0]} 至 ${currentDate})`,
    uirevision: 'dynamic-evolution',
    xaxis: { title: '时间/阶段', tickangle: dates.length > 6 ? -35 : 0 },
    yaxis: { title: '累计事件规模', rangemode: 'tozero' },
    yaxis2: { title: '当前阶段事件量', overlaying: 'y', side: 'right', rangemode: 'tozero', showgrid: false },
    hovermode: 'closest',
    height: 460,
    legend: { orientation: 'h', y: -0.22 },
  })
}

function renderRelationFlow() {
  const relations = normalizedRelations.value
  if (!relations.length) return

  const pairs = new Map()
  for (const rel of relations) {
    const sourceType = rel.sourceType || '未分类实体'
    const targetType = rel.targetType || '未分类实体'
    const relation = rel.type || '关系'
    const key = `${sourceType}|||${relation}|||${targetType}`
    pairs.set(key, (pairs.get(key) || 0) + (rel.count || 1))
  }

  const topPairs = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)
  const labels = []
  const labelIndex = new Map()
  function addLabel(label) {
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
  for (const [key, count] of topPairs) {
    const [sourceType, relation, targetType] = key.split('|||')
    const sourceIndex = addLabel(`源:${sourceType}`)
    const relationIndex = addLabel(`关系:${relation}`)
    const targetIndex = addLabel(`目标:${targetType}`)
    source.push(sourceIndex)
    target.push(relationIndex)
    value.push(count)
    hover.push(`${sourceType} -[${relation}]-> ${targetType}: ${count}`)
    source.push(relationIndex)
    target.push(targetIndex)
    value.push(count)
    hover.push(`${sourceType} -[${relation}]-> ${targetType}: ${count}`)
  }

  renderFlow([{
    type: 'sankey',
    arrangement: 'snap',
    node: {
      pad: 18,
      thickness: 16,
      label: labels,
      color: generateColors(labels.length),
      line: { color: 'rgba(255,255,255,0.25)', width: 0.5 },
    },
    link: {
      source,
      target,
      value,
      customdata: hover,
      hovertemplate: '%{customdata}<extra></extra>',
      color: 'rgba(74,158,255,0.24)',
    },
  }], {
    title: '实体类型 → 关系 → 目标类型流向',
    margin: { l: 10, r: 10, t: 45, b: 20 },
  })
}

function startAnimation() {
  stopAnimation()
  if (!isPlaying.value) return
  animTimer = setInterval(() => {
    animFrame.value = (animFrame.value + 1) % timelineFrameCount
    if (mode.value === 'trend') renderEvolutionTrend()
  }, 900)
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
  nextTick(() => requestAnimationFrame(() => {
    if (mode.value === 'network2d') renderNetwork2D()
    else if (mode.value === 'trend') { renderEvolutionTrend(); startAnimation() }
    else if (mode.value === 'flow') renderRelationFlow()
  }))
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
    <p class="desc">展示事件趋势、关系流向和网络活跃结构。</p>

    <div class="kpi-row">
      <KpiCard label="节点" :value="store.graphData.nodes.length" />
      <KpiCard label="关系" :value="normalizedRelations.length || store.graphData.links.length" />
      <KpiCard label="时间节点" :value="store.timeline.length" />
      <KpiCard label="传导阶段" :value="normalizedRelations.length" />
    </div>

    <div class="sub-tabs">
      <button v-for="m in ['trend','flow','network2d']" :key="m"
        class="sub-tab" :class="{ active: mode === m }" @click="mode = m">
        {{ { trend: '事件趋势', flow: '关系流向', network2d: '动态网络' }[m] }}
      </button>
      <button v-if="mode === 'trend'" class="sub-tab play-btn" @click="togglePlay">
        {{ isPlaying ? '⏸ 暂停' : '▶ 播放' }}
      </button>
    </div>

    <div ref="timelineChart" class="chart chart-trend" v-show="mode === 'trend'"/>
    <div ref="flowChart" class="chart" v-show="mode === 'flow'"/>
    <div ref="networkContainer" class="chart chart-tall" v-show="mode === 'network2d'"/>
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
.chart { position: relative; background: var(--bg-card); border-radius: 8px; min-height: 300px; overflow: hidden; }
.chart-trend { min-height: 500px; }
.chart-tall { height: 620px; }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
</style>
