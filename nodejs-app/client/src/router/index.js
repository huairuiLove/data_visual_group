import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/Home.vue') },
  { path: '/overview', name: 'overview', component: () => import('../views/Overview.vue') },
  { path: '/timeline', name: 'timeline', component: () => import('../views/Timeline.vue') },
  { path: '/knowledge-graph', name: 'knowledgeGraph', component: () => import('../views/KnowledgeGraph.vue') },
  { path: '/spatial', name: 'spatial', component: () => import('../views/Spatial.vue') },
  { path: '/source-analysis', name: 'sourceAnalysis', component: () => import('../views/SourceAnalysis.vue') },
  { path: '/qa', name: 'qa', component: () => import('../views/QA.vue') },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
