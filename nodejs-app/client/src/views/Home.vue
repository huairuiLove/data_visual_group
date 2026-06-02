<script setup>
import { useAppStore } from '../stores/app'
import { useRouter } from 'vue-router'

const store = useAppStore()
const router = useRouter()

function goToDashboard() {
  router.push('/overview')
}
</script>

<template>
  <div class="home">
    <h1>DataGraphX</h1>
    <p v-if="!store.apiConfigured">请先在侧边栏完成 API 设置。</p>
    <p v-else-if="!store.neo4jConnected">请连接 Neo4j 数据库。</p>
    <p v-else-if="!store.fileProcessed">请上传文档开始分析。</p>
    <div v-else>
      <p>文档处理完成。选择导航标签页查看分析结果。</p>
      <button class="btn btn-primary" @click="goToDashboard">进入仪表板</button>
    </div>
  </div>
</template>

<style scoped>
.home { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; gap: 1rem; }
.home h1 { font-size: 2rem; color: var(--accent); }
.home p { color: var(--text-muted); font-size: 1rem; }
</style>
