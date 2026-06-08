<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api'

const router = useRouter()
const reports = ref([])
const selected = ref(null)
const loading = ref(false)

async function loadReports() {
  loading.value = true
  try {
    const res = await api.get('/research-reports')
    reports.value = res.reports || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function openReport(id) {
  try {
    const res = await api.get(`/research-reports/${id}`)
    selected.value = res.report
  } catch (e) {
    console.error(e)
  }
}

function parseInline(text) {
  const segments = []
  const pattern = /\*\*(.+?)\*\*/g
  let lastIndex = 0
  let match
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'strong', text: match[1] })
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) })
  }
  return segments.length ? segments : [{ type: 'text', text }]
}

function markdownBlocks(md) {
  if (!md) return []
  return md.split(/\n+/).map((line, index) => {
    const trimmed = line.trim()
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (heading) {
      return {
        id: `${index}-${trimmed}`,
        type: `h${Math.min(heading[1].length + 1, 4)}`,
        segments: parseInline(heading[2]),
      }
    }
    return {
      id: `${index}-${trimmed}`,
      type: 'p',
      segments: parseInline(trimmed),
    }
  }).filter(block => block.segments.some(segment => segment.text))
}

onMounted(loadReports)
</script>

<template>
  <div class="view">
    <h2 class="view-title">研究报告库</h2>
    <p class="desc">自动保存的单文/多文研究报告（存于 Neo4j）。不保存 Notebook 代码。</p>

    <div v-if="loading" class="hint">加载中...</div>
    <div v-else-if="!reports.length" class="hint">暂无报告。请在 Notebook 实验室完成「一键生成报告」。</div>

    <div v-else class="layout">
      <aside class="list">
        <div
          v-for="r in reports"
          :key="r.id"
          class="item"
          :class="{ active: selected?.id === r.id }"
          @click="openReport(r.id)"
        >
          <div class="item-title">{{ r.title }}</div>
          <div class="item-meta">
            <span class="badge" :class="r.mode">{{ r.mode === 'multi' ? '多文' : '单文' }}</span>
            <span>{{ (r.createdAt || '').slice(0, 10) }}</span>
            <span>{{ r.chartCount || 0 }} 图</span>
          </div>
        </div>
      </aside>

      <main v-if="selected" class="detail">
        <div class="detail-header">
          <h3>{{ selected.title }}</h3>
          <span class="risk" :class="selected.riskLevel">{{ selected.riskLevel }}</span>
        </div>
        <div class="highlights" v-if="selected.highlights?.length">
          <span v-for="h in selected.highlights" :key="h" class="hl-tag">{{ h }}</span>
        </div>
        <div class="charts" v-if="selected.charts?.length">
          <div v-for="c in selected.charts" :key="c.index" class="chart-block">
            <h4>{{ c.title }}</h4>
            <img v-if="c.imageBase64" :src="`data:image/png;base64,${c.imageBase64}`" alt="chart">
          </div>
        </div>
        <article class="report-body">
          <component
            :is="block.type"
            v-for="block in markdownBlocks(selected.markdown)"
            :key="block.id"
          >
            <template v-for="(segment, i) in block.segments" :key="i">
              <strong v-if="segment.type === 'strong'">{{ segment.text }}</strong>
              <span v-else>{{ segment.text }}</span>
            </template>
          </component>
        </article>
      </main>
      <main v-else class="detail empty-detail">
        <p>← 选择一份报告查看</p>
      </main>
    </div>

    <button class="btn btn-outline" style="margin-top:1rem" @click="router.push('/notebook-lab')">
      前往 Notebook 实验室
    </button>
  </div>
</template>

<style scoped>
.view { max-width: 1200px; }
.view-title { font-size: 1.4rem; color: var(--accent); margin-bottom: 0.5rem; }
.desc { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem; }
.hint { color: var(--text-muted); padding: 2rem; text-align: center; }
.layout { display: flex; gap: 1rem; min-height: 500px; }
.list { width: 280px; flex-shrink: 0; overflow-y: auto; max-height: 70vh; }
.item { padding: 0.75rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.5rem; cursor: pointer; background: var(--bg-card); }
.item:hover, .item.active { border-color: var(--accent); background: rgba(74,158,255,0.08); }
.item-title { font-size: 0.85rem; font-weight: 600; margin-bottom: 0.3rem; }
.item-meta { display: flex; gap: 0.5rem; font-size: 0.72rem; color: var(--text-muted); }
.badge { padding: 0.1rem 0.35rem; border-radius: 8px; background: rgba(74,158,255,0.2); color: var(--accent); }
.badge.multi { background: rgba(255,127,80,0.2); color: #ff7f50; }
.detail { flex: 1; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; overflow-y: auto; max-height: 70vh; }
.empty-detail { display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
.detail-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
.detail-header h3 { font-size: 1.1rem; color: var(--accent); }
.risk { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 10px; text-transform: uppercase; }
.risk.high { background: rgba(244,67,54,0.2); color: #f44336; }
.risk.medium { background: rgba(255,152,0,0.2); color: #ff9800; }
.risk.low { background: rgba(76,175,80,0.2); color: #4caf50; }
.highlights { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem; }
.hl-tag { font-size: 0.75rem; padding: 0.2rem 0.5rem; background: var(--bg-sidebar); border-radius: 10px; color: var(--text-muted); }
.charts { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
.chart-block { background: var(--bg-sidebar); border-radius: 6px; padding: 0.5rem; }
.chart-block h4 { font-size: 0.8rem; margin-bottom: 0.4rem; color: var(--text-muted); }
.chart-block img { width: 100%; border-radius: 4px; }
.report-body { font-size: 0.9rem; line-height: 1.7; color: var(--text); }
.report-body :deep(h2) { font-size: 1.2rem; color: var(--accent); margin: 1rem 0 0.5rem; }
.report-body :deep(h3) { font-size: 1rem; margin: 0.8rem 0 0.4rem; }
.report-body :deep(h4) { font-size: 0.9rem; margin: 0.6rem 0 0.3rem; }
</style>
