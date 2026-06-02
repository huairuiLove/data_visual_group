<script setup>
import { ref, onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { usePlotly } from '../composables/usePlotly'
import KpiCard from '../components/KpiCard.vue'

const store = useAppStore()
const mapChart = ref(null)
const barChart = ref(null)
const { render: renderMap } = usePlotly(mapChart, { layout: { height: 550 } })
const { render: renderBar } = usePlotly(barChart, { layout: { height: 350 } })

function renderCharts() {
  const locations = store.spatialData.locations || []
  if (!locations.length) return

  const maxCount = Math.max(...locations.map(l => l.mention_count || 0))

  renderMap([{
    type: 'scattergeo',
    lon: locations.map(l => l.lng),
    lat: locations.map(l => l.lat),
    text: locations.map(l => `<b>${l.name}</b><br>提及: ${l.mention_count} 次`),
    mode: 'markers+text',
    marker: {
      size: locations.map(l => 10 + ((l.mention_count || 1) / maxCount) * 40),
      color: locations.map(l => l.mention_count || 0),
      colorscale: 'Reds', showscale: true, colorbar: { title: '提及次数' },
      line: { width: 1, color: 'white' },
    },
    textposition: 'top center', textfont: { size: 10 },
  }], {
    geo: {
      projection_type: 'natural earth', showland: true,
      landcolor: 'rgb(243,243,243)', coastlinecolor: 'rgb(204,204,204)',
      showcountries: true, countrycolor: 'rgb(204,204,204)',
      center: { lat: 28, lon: 45 }, projection_scale: 3.5,
    },
    margin: { l: 10, r: 10, t: 10, b: 10 },
  })

  const top = locations.slice(0, 15)
  renderBar([{
    type: 'bar', x: top.map(l => l.name), y: top.map(l => l.mention_count),
    marker: { color: '#ff7f50' },
  }], { xaxis: { tickangle: -45 } })
}

onMounted(renderCharts)
</script>

<template>
  <div v-if="!store.fileProcessed" class="empty"><p>请先上传并处理文档。</p></div>
  <div v-else class="view">
    <h2 class="view-title">空间态势</h2>

    <p v-if="!store.spatialData.locations?.length" class="hint">暂无地理位置数据。</p>

    <div v-else>
      <div class="kpi-row">
        <KpiCard label="发现位置数" :value="store.spatialData.totalLocations || 0" />
        <KpiCard label="最频繁地点" :value="store.spatialData.topLocation?.name || '-'" />
        <KpiCard label="总提及次数" :value="(store.spatialData.locations || []).reduce((s,l) => s + (l.mention_count||0), 0)" />
      </div>

      <hr>

      <h4>地理位置分布</h4>
      <div ref="mapChart" class="chart"/>

      <h4>地理位置详情</h4>
      <table class="table">
        <thead><tr><th>地点</th><th>纬度</th><th>经度</th><th>提及次数</th></tr></thead>
        <tbody>
          <tr v-for="loc in store.spatialData.locations" :key="loc.name">
            <td>{{ loc.name }}</td><td>{{ loc.lat.toFixed(2) }}</td><td>{{ loc.lng.toFixed(2) }}</td><td>{{ loc.mention_count }}</td>
          </tr>
        </tbody>
      </table>

      <h4>地点提及频次</h4>
      <div ref="barChart" class="chart"/>
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
.table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.table th { background: var(--bg-sidebar); color: var(--text-muted); padding: 0.5rem 0.8rem; text-align: left; border-bottom: 2px solid var(--border); }
.table td { padding: 0.4rem 0.8rem; border-bottom: 1px solid var(--border); }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
.hint { color: var(--text-muted); font-size: 0.9rem; }
</style>
