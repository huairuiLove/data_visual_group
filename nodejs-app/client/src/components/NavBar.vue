<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()

const links = [
  { path: '/', label: '首页' },
  { path: '/overview', label: '态势总览' },
  { path: '/knowledge-graph', label: '知识图谱' },
  { path: '/dynamic-viz', label: '动态可视化' },
  { path: '/timeline', label: '事件时间线' },
  { path: '/spatial', label: '空间态势' },
  { path: '/source-analysis', label: '来源分析' },
  { path: '/multi-article', label: '多文联合' },
  { path: '/notebook-lab', label: 'Notebook' },
  { path: '/research-reports', label: '报告库' },
  { path: '/qa', label: '证据问答' },
]
</script>

<template>
  <nav class="navbar">
    <router-link
      v-for="link in links"
      :key="link.path"
      :to="link.path"
      class="nav-link"
      :class="{ active: route.path === link.path }"
    >
      {{ link.label }}
    </router-link>
  </nav>
</template>

<style scoped>
.navbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border);
}
.nav-link {
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.82rem;
  color: var(--text-muted);
  text-decoration: none;
  transition: all 0.2s;
}
.nav-link:hover { color: var(--accent); background: rgba(74,158,255,0.1); }
.nav-link.active { color: var(--accent); background: rgba(74,158,255,0.2); font-weight: 600; }
</style>
