<script setup>
import { ref, nextTick } from 'vue'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const question = ref('')
const messages = ref([])
const loading = ref(false)
const chatContainer = ref(null)

async function send() {
  const q = question.value.trim()
  if (!q || loading.value) return

  messages.value.push({ role: 'user', content: q })
  question.value = ''
  loading.value = true

  try {
    const res = await store.askQuestion(q)
    messages.value.push({
      role: 'assistant',
      content: res.answer || 'No response',
      sources: res.sources || [],
      trace: res.trace || null,
    })
  } catch (e) {
    messages.value.push({ role: 'assistant', content: `Error: ${e.message}` })
  } finally {
    loading.value = false
    nextTick(() => {
      const el = chatContainer.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
</script>

<template>
  <div v-if="!store.fileProcessed" class="empty"><p>请先上传并处理文档。</p></div>
  <div v-else class="view">
    <h2 class="view-title">证据问答</h2>
    <p class="hint">基于知识图谱的智能问答，答案可追溯到原文段落。</p>

    <div class="qa-box">
      <div ref="chatContainer" class="qa-messages">
        <div v-for="(msg, i) in messages" :key="i" class="qa-message" :class="'qa-' + msg.role">
          <div class="qa-role">{{ msg.role === 'user' ? 'You' : 'AI' }}</div>
          <div class="qa-content">{{ msg.content }}</div>
          <details v-if="msg.trace" class="qa-trace">
            <summary>检索计划</summary>
            <div><strong>意图:</strong> {{ msg.trace.intent }}</div>
            <div v-if="msg.trace.searchQueries?.length"><strong>查询词:</strong> {{ msg.trace.searchQueries.join('、') }}</div>
            <div v-if="msg.trace.entities?.length"><strong>重点实体:</strong> {{ msg.trace.entities.join('、') }}</div>
            <div v-if="msg.trace.reasoningSteps?.length">
              <strong>步骤:</strong>
              <ol>
                <li v-for="(step, j) in msg.trace.reasoningSteps" :key="j">{{ step }}</li>
              </ol>
            </div>
          </details>
          <details v-if="msg.sources?.length" class="qa-sources">
            <summary>证据来源 ({{ msg.sources.length }})</summary>
            <div v-for="(src, j) in msg.sources.slice(0, 5)" :key="j" class="qa-source">
              <template v-if="typeof src === 'string'">
                {{ src.slice(0, 300) }}...
              </template>
              <template v-else>
                <div class="source-meta">{{ src.type }} · {{ src.title || '未命名证据' }} · {{ Number(src.score || 0).toFixed(2) }}</div>
                <div>{{ (src.content || '').slice(0, 420) }}...</div>
              </template>
            </div>
          </details>
        </div>
      </div>

      <div class="qa-input-row">
        <textarea v-model="question" @keydown="handleKeydown"
          placeholder="输入问题，系统将从知识图谱中检索证据并回答..."
          rows="2" :disabled="loading"/>
        <button class="btn btn-primary" @click="send" :disabled="loading || !question.trim()">
          {{ loading ? '...' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.view { max-width: 900px; }
.view-title { font-size: 1.4rem; margin-bottom: 0.5rem; color: var(--accent); }
.hint { color: var(--text-muted); margin-bottom: 1rem; }
.qa-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; }
.qa-messages { max-height: 500px; overflow-y: auto; margin-bottom: 1rem; }
.qa-message { margin: 0.5rem 0; padding: 0.6rem 0.8rem; border-radius: 8px; }
.qa-user { background: rgba(74,158,255,0.1); text-align: right; }
.qa-assistant { background: rgba(76,175,80,0.1); }
.qa-role { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.2rem; }
.qa-content { font-size: 0.9rem; white-space: pre-wrap; }
.qa-sources, .qa-trace { margin-top: 0.5rem; font-size: 0.78rem; }
.qa-sources summary, .qa-trace summary { cursor: pointer; color: var(--text-muted); }
.qa-trace { color: var(--text-muted); }
.qa-trace ol { margin: 0.35rem 0 0 1.1rem; padding: 0; }
.qa-source { padding: 0.3rem; color: var(--text-muted); font-size: 0.78rem; border-bottom: 1px solid var(--border); }
.source-meta { color: var(--accent); margin-bottom: 0.2rem; }
.qa-input-row { display: flex; gap: 0.5rem; }
.qa-input-row textarea {
  flex: 1; padding: 0.5rem; background: #1e1e3a; border: 1px solid var(--border);
  border-radius: 6px; color: var(--text); font-size: 0.9rem; resize: none;
}
.qa-input-row textarea:focus { outline: none; border-color: var(--accent); }
.qa-input-row .btn { align-self: flex-end; }
.empty { display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); }
</style>
