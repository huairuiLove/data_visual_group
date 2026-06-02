<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: 0 },
})
</script>

<template>
  <div class="kpi-card">
    <span class="kpi-value">{{ value }}</span>
    <span class="kpi-label">{{ label }}</span>
  </div>
</template>

<style scoped>
.kpi-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 1rem 1.2rem;
  text-align: center; flex: 1; min-width: 100px;
}
.kpi-value { display: block; font-size: 1.5rem; font-weight: 700; color: var(--accent); }
.kpi-label { display: block; font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem; }
</style>
