<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()
defineProps({
  settingsOpen: {
    type: Boolean,
    default: true,
  },
})
const emit = defineEmits(['toggle-settings'])

const links = [
  { path: '/', label: '首页', icon: 'mdi-home-outline' },
  { path: '/overview', label: '总览', icon: 'mdi-view-dashboard-outline' },
  { path: '/knowledge-graph', label: '图谱', icon: 'mdi-graph-outline' },
  { path: '/dynamic-viz', label: '动态', icon: 'mdi-chart-scatter-plot' },
  { path: '/timeline', label: '时间线', icon: 'mdi-timeline-clock-outline' },
  { path: '/spatial', label: '空间', icon: 'mdi-map-marker-radius-outline' },
  { path: '/source-analysis', label: '来源', icon: 'mdi-source-branch' },
  { path: '/multi-article', label: '多文', icon: 'mdi-file-document-multiple-outline' },
  { path: '/notebook-lab', label: 'Notebook', icon: 'mdi-notebook-outline' },
  { path: '/research-reports', label: '报告库', icon: 'mdi-bookshelf' },
  { path: '/qa', label: '问答', icon: 'mdi-message-question-outline' },
]
</script>

<template>
  <v-sheet class="nav-surface" rounded="sm">
    <div class="nav-inner">
      <v-btn
        class="settings-tab"
        :class="{ active: settingsOpen }"
        :variant="settingsOpen ? 'flat' : 'text'"
        size="small"
        prepend-icon="mdi-tune-variant"
        @click="emit('toggle-settings')"
      >
        设置
      </v-btn>

      <v-divider vertical class="nav-divider" />

      <v-tabs
        :model-value="route.path"
        density="comfortable"
        show-arrows
        class="nav-tabs"
      >
        <v-tab
          v-for="link in links"
          :key="link.path"
          :to="link.path"
          :value="link.path"
          :prepend-icon="link.icon"
          class="nav-tab"
        >
          {{ link.label }}
        </v-tab>
      </v-tabs>
    </div>
  </v-sheet>
</template>

<style scoped>
.nav-surface {
  margin-bottom: 24px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #181b20;
}

.nav-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.settings-tab {
  flex: 0 0 auto;
  color: #aeb6bf;
}

.settings-tab.active {
  color: #0f1418;
  background: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.nav-divider {
  min-height: 28px;
  opacity: 0.35;
}

.nav-tabs {
  min-width: 0;
}

.nav-tab {
  min-width: auto;
  padding: 0 12px;
  letter-spacing: 0;
  text-transform: none;
}

:deep(.v-tab--selected) {
  color: rgb(var(--v-theme-primary));
}

@media (max-width: 700px) {
  .nav-inner {
    align-items: stretch;
    flex-direction: column;
  }

  .nav-divider {
    display: none;
  }
}
</style>
