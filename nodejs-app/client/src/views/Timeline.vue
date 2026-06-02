<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { usePlotly } from '../composables/usePlotly'
import KpiCard from '../components/KpiCard.vue'

const store = useAppStore()

const scatterChart = ref(null)
const { render } = usePlotly(scatterChart, { layout: { height: 400 } })
const selectedCategory = ref('全部')

const allCategories = computed(() => {
  const cats = new Set()
  store.timeline.forEach(d => (d.categories || []).forEach(c => cats.add(c)))
  return ['全部', ...cats]
})

const filteredTimeline = computed(() => {
  if (selectedCategory.value === '全部') return store.timeline
  return store.timeline.map(d => ({
    ...d,
    events: (d.events || []).filter(e => e.category === selectedCategory.value),
  })).filter(d => d.events.length)
})

const isSparse = computed(() => store.timeline.length <= 3)

function renderChart() {
  const data = []
  store.timeline.forEach(day => {
    (day.events || []).forEach(evt => {
      data.push({ date: day.date, category: evt.category || '其他' })
    })
  })

  const counts = {}
  data.forEach(d => { const k = d.date + '|' + d.category; counts[k] = (counts[k] || 0) + 1 })

  const x = [], y = [], s = []
  Object.entries(counts).forEach(([key, count]) => {
    const [date, cat] = key.split('|')
    x.push(date); y.push(cat); s.push(Math.max(5, count * 12))
  })

  render([{ type: 'scatter', mode: 'markers', x, y,
    marker: { size: s, sizemode: 'diameter', color: '#4a9eff' },
    text: s.map((si, i) => `${y[i]}: ${si} events`), hoverinfo: 'text',
  }], { xaxis: { tickangle: -45 } })
}

onMounted(renderChart)
watch(() => store.analysisResult, renderChart)
</script>

<template>
  <div v-if="!store.fileProcessed" class="empty"><p>请先上传并处理文档。</p></div>
  <div v-else class="view">
    <h2 class="view-title">事件时间线</h2>

    <p v-if="!store.timeline.length" class="hint">暂无时间线数据。</p>

    <div v-else>
      <div class="kpi-row">
        <KpiCard label="时间节点数" :value="store.timeline.length" />
        <KpiCard label="总事件数" :value="store.timeline.reduce((s,d) => s + (d.count || 0), 0)" />
        <KpiCard label="事件类别数" :value="allCategories.length - 1" />
      </div>

      <hr>
      <h4>事件时间线图</h4>
      <div ref="scatterChart" class="chart"/>

      <h4>事件详情</h4>
      <div class="form-group">
        <label>按事件类别筛选</label>
        <select v-model="selectedCategory">
          <option v-for="cat in allCategories" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>

      <div class="events-list">
        <template v-for="day in [...filteredTimeline].reverse()" :key="day.date">
          <details v-if="day.events.length" :open="isSparse">
            <summary><b>{{ day.date }}</b> &mdash; {{ day.events.length }} 个事件</summary>
            <p v-for="(evt, j) in day.events" :key="j">
              <b>[{{ evt.category || '其他' }}]</b>
              {{ isSparse ? (evt.summary || '').slice(0, 600) : (evt.summary || '').slice(0, 200) + '...' }}
            </p>
          </details>
        </template>
        <p v-if="!filteredTimeline.filter(d => d.events.length).length" class="hint">暂无匹配事件</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view { max-width: 1400px; }
.view-title { font-size: 1.4rem; margin-bottom: 1rem; color: var(--accent); }
.kpi-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; }
.chart { background: var(--bg-card); border-radius: 8px; min-height: 300px; }
h4 { font-size: 0.95rem; margin: 0.8rem 0 0.4rem; }
hr { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }
.form-group { margin-bottom: 0.6rem; max-width: 300px; }
.form-group label { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; }
.form-group select { width: 100%; padding: 0.4rem 0.6rem; background: #1e1e3a; border: 1px solid var(--border); border-radius: 6px; color: var(--text); }
.events-list details { background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; margin: 0.3rem 0; }
.events-list summary { cursor: pointer; font-weight: 600; }
.events-list p { margin: 0.3rem 0; padding-left: 1rem; border-left: 2px solid var(--border); font-size: 0.9rem; }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
.hint { color: var(--text-muted); font-size: 0.9rem; }
</style>
