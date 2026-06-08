<template>
  <v-app>
    <v-layout class="app-shell">
      <v-navigation-drawer
        v-model="settingsOpen"
        width="340"
        :permanent="!smAndDown"
        :temporary="smAndDown"
        class="app-drawer"
      >
        <Sidebar />
      </v-navigation-drawer>

      <v-main>
        <div class="workspace">
          <NavBar :settings-open="settingsOpen" @toggle-settings="settingsOpen = !settingsOpen" />
          <slot />
        </div>
      </v-main>
    </v-layout>
  </v-app>
</template>

<script setup>
import { ref } from 'vue'
import { useDisplay } from 'vuetify'
import Sidebar from '../components/Sidebar.vue'
import NavBar from '../components/NavBar.vue'

const { smAndDown } = useDisplay()
const settingsOpen = ref(true)
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: rgb(var(--v-theme-background));
}

.app-drawer {
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: #14171b;
}

.workspace {
  min-height: 100vh;
  padding: 18px 24px 32px;
}

@media (max-width: 960px) {
  .workspace {
    padding: 14px;
  }
}
</style>
