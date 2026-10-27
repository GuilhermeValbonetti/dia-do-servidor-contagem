<script setup>
import { useRoute } from 'vue-router'
import Sidebar from './components/Sidebar.vue'

const route = useRoute()
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--telao': route.path === '/telao' }">
    <Sidebar v-if="route.path !== '/telao'" />
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<style>
.app-shell {
  min-height: 100vh;
}

.main-content {
  min-width: 0;
  min-height: 1px;
}

@media (min-width: 850px) {
  .app-shell {
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
  }

  .app-shell--telao {
    display: block;
  }
}

@media (min-width: 1150px) {
  .app-shell {
    grid-template-columns: 255px minmax(0, 1fr);
  }
}
</style>
