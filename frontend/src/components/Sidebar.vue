<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { loadEventIndicators } from '../services/evento'
import crestUrl from '../assets/images/brasao-contagem.png'

defineOptions({ name: 'AppSidebar' })

const route = useRoute()
const indicatorData = ref(null)
const indicatorsLoading = ref(true)
const indicatorsError = ref('')
let requestRevision = 0
let viewActive = true

async function refreshIndicators(fresh = false) {
  const revision = ++requestRevision
  indicatorsLoading.value = true
  indicatorsError.value = ''
  try {
    const data = await loadEventIndicators(fresh)
    if (viewActive && revision === requestRevision) indicatorData.value = data
  } catch (error) {
    if (viewActive && revision === requestRevision) indicatorsError.value = error.message
  } finally {
    if (viewActive && revision === requestRevision) indicatorsLoading.value = false
  }
}

function indicatorValue(field) {
  return indicatorsLoading.value || indicatorsError.value || !indicatorData.value
    ? '—'
    : indicatorData.value[field]
}

const refreshAfterChange = () => refreshIndicators(true)
watch(
  () => route.fullPath,
  () => refreshIndicators(),
)
onMounted(() => {
  window.addEventListener('focus', refreshAfterChange)
  window.addEventListener('evento-atualizado', refreshAfterChange)
  refreshIndicators()
})
onBeforeUnmount(() => {
  viewActive = false
  requestRevision += 1
  window.removeEventListener('focus', refreshAfterChange)
  window.removeEventListener('evento-atualizado', refreshAfterChange)
})

const navigationItems = [
  { label: 'Visão geral', mobileLabel: 'Início', to: '/', icon: 'home' },
  {
    label: 'Credenciamento',
    mobileLabel: 'Presença',
    to: '/credenciamento',
    icon: 'id',
    countLabel: 'presenças',
    countField: 'presencasConfirmadas',
  },
  {
    label: 'Realizar sorteio',
    mobileLabel: 'Sorteio',
    to: '/sorteio',
    icon: 'sparkles',
  },
  {
    label: 'Vencedores',
    mobileLabel: 'Vencedores',
    to: '/vencedores',
    icon: 'trophy',
    countLabel: 'vencedores',
    countField: 'servidoresContemplados',
  },
  { label: 'Prêmios', mobileLabel: 'Prêmios', to: '/premios', icon: 'gift' },
]

const guideSteps = [
  { title: 'Confirme a presença', description: 'Registre quem chegou.' },
  { title: 'Realize o sorteio', description: 'Somente quem está apto.' },
  { title: 'Veja os vencedores', description: 'Consulte os resultados.' },
]

function accessibleLabel(item) {
  if (!item.countLabel) return item.label
  if (indicatorsError.value) return `${item.label}, contagem indisponível`
  if (indicatorsLoading.value) return `${item.label}, consultando contagem`
  return `${item.label}, ${indicatorValue(item.countField)} ${item.countLabel}`
}
</script>

<template>
  <svg class="icon-library" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <symbol id="sidebar-home" viewBox="0 0 24 24">
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9 21v-8h6v8" />
    </symbol>
    <symbol id="sidebar-id" viewBox="0 0 24 24">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M4 17c0-2 2-3 4-3s4 1 4 3m3-7h5m-5 4h4" />
    </symbol>
    <symbol id="sidebar-sparkles" viewBox="0 0 24 24">
      <path
        d="m12 3 1.9 5.6L20 10.5l-6.1 1.9L12 18l-1.9-5.6L4 10.5l6.1-1.9zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z"
      />
    </symbol>
    <symbol id="sidebar-trophy" viewBox="0 0 24 24">
      <path
        d="M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0V3zM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4"
      />
    </symbol>
    <symbol id="sidebar-gift" viewBox="0 0 24 24">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path
        d="M5 12v9h14v-9M12 8v13M12 8C9 8 6 7 6 4.5a2.5 2.5 0 0 1 5 0c0 1.4 1 3.5 1 3.5zm0 0c3 0 6-1 6-3.5a2.5 2.5 0 0 0-5 0c0 1.4-1 3.5-1 3.5z"
      />
    </symbol>
    <symbol id="sidebar-info" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </symbol>
    <symbol id="sidebar-arrow" viewBox="0 0 24 24">
      <path d="M4 12h16m-7-7 7 7-7 7" />
    </symbol>
  </svg>

  <aside class="sidebar" aria-label="Menu principal">
    <div class="brand">
      <div class="brand-mark">
        <img :src="crestUrl" alt="Brasão da Prefeitura Municipal de Contagem" />
      </div>
      <div>
        <p class="brand-overline">Prefeitura de Contagem</p>
        <p class="brand-name">Dia do Servidor</p>
        <p class="brand-sub">Celebração &amp; sorteios</p>
      </div>
    </div>

    <nav class="sidebar-nav" aria-label="Navegação principal">
      <RouterLink
        v-for="item in navigationItems"
        :key="item.to"
        :to="item.to"
        class="nav-btn"
        exact-active-class="active"
        :aria-label="accessibleLabel(item)"
      >
        <svg class="icon" aria-hidden="true">
          <use :href="`#sidebar-${item.icon}`" />
        </svg>
        <span>{{ item.label }}</span>
        <span
          v-if="item.countLabel"
          class="nav-num"
          aria-hidden="true"
          :title="indicatorsError || undefined"
          >{{ indicatorValue(item.countField) }}</span
        >
      </RouterLink>
    </nav>
    <button
      v-if="indicatorsError"
      class="sidebar-guide-link"
      type="button"
      @click="refreshAfterChange"
    >
      Indicadores indisponíveis · Tentar novamente
    </button>

    <section class="sidebar-guide" aria-labelledby="desktop-guide-title">
      <div class="sidebar-guide-heading">
        <svg class="icon icon-sm" aria-hidden="true"><use href="#sidebar-info" /></svg>
        <h2 id="desktop-guide-title">Como funciona</h2>
      </div>
      <p class="sidebar-guide-subtitle">Três passos para o evento</p>
      <ol class="sidebar-guide-steps">
        <li v-for="(step, index) in guideSteps" :key="step.title">
          <span class="guide-mini-number">{{ `0${index + 1}` }}</span>
          <span>
            <strong>{{ step.title }}</strong>
            <small>{{ step.description }}</small>
          </span>
        </li>
      </ol>
      <RouterLink class="sidebar-guide-link" to="/guia">
        Ver guia completo
        <svg class="icon icon-sm" aria-hidden="true"><use href="#sidebar-arrow" /></svg>
      </RouterLink>
    </section>
  </aside>

  <header class="mobile-head">
    <div class="brand">
      <div class="brand-mark">
        <img :src="crestUrl" alt="Brasão da Prefeitura Municipal de Contagem" />
      </div>
      <div>
        <p class="brand-overline">Prefeitura de Contagem</p>
        <p class="brand-name">Dia do Servidor</p>
      </div>
    </div>
  </header>

  <nav class="mobile-nav" aria-label="Navegação principal">
    <RouterLink
      v-for="item in navigationItems"
      :key="item.to"
      :to="item.to"
      class="nav-btn"
      exact-active-class="active"
      :aria-label="accessibleLabel(item)"
    >
      <svg class="icon" aria-hidden="true">
        <use :href="`#sidebar-${item.icon}`" />
      </svg>
      <span>{{ item.mobileLabel }}</span>
    </RouterLink>
  </nav>

  <details class="mobile-quick-guide">
    <summary>
      <svg class="icon icon-sm" aria-hidden="true"><use href="#sidebar-info" /></svg>
      Como funciona
      <span class="mobile-guide-chevron" aria-hidden="true">⌄</span>
    </summary>
    <ol>
      <li v-for="step in guideSteps" :key="step.title">
        <strong>{{ step.title }}:</strong> {{ step.description }}
      </li>
    </ol>
    <RouterLink class="mobile-guide-full" to="/guia">Ver guia completo</RouterLink>
  </details>
</template>

<style scoped src="./Sidebar.css"></style>
