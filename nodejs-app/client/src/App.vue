<script setup>
import Sidebar from './components/Sidebar.vue'
import NavBar from './components/NavBar.vue'
</script>

<template>
  <div class="app-container">
    <Sidebar />
    <main class="main-content">
      <NavBar />
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-container { display: flex; min-height: 100vh; }
.main-content { flex: 1; padding: 1.5rem 2rem; overflow-y: auto; }

@media (max-width: 768px) {
  .app-container { flex-direction: column; }
}
</style>
