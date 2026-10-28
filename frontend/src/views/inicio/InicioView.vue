<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { loadEventIndicators } from '../../services/evento'
import { requestDrawApi } from '../../services/sorteios'
import crestUrl from '../../assets/images/brasao-contagem.png'
import './InicioView.css'

const winners = ref([])
const indicatorData = ref(null)
const indicatorsLoading = ref(true)
const indicatorsError = ref('')
const historyLoading = ref(true)
const historyError = ref('')
const historyTotal = ref(null)
let viewActive = true
let summaryRevision = 0
let historyRevision = 0

function indicatorValue(field) {
  return indicatorsLoading.value || indicatorsError.value || !indicatorData.value
    ? '—'
    : indicatorData.value[field]
}

async function refreshIndicators(fresh = false) {
  const revision = ++summaryRevision
  indicatorsLoading.value = true
  indicatorsError.value = ''
  try {
    const data = await loadEventIndicators(fresh)
    if (viewActive && revision === summaryRevision) indicatorData.value = data
  } catch (error) {
    if (viewActive && revision === summaryRevision) indicatorsError.value = error.message
  } finally {
    if (viewActive && revision === summaryRevision) indicatorsLoading.value = false
  }
}

async function refreshHistory() {
  const revision = ++historyRevision
  historyLoading.value = true
  historyError.value = ''
  try {
    const data = await requestDrawApi('/api/sorteios?limit=6')
    if (
      !Array.isArray(data?.dados) ||
      data.dados.length > 6 ||
      !Number.isSafeInteger(data?.paginacao?.total) ||
      data.paginacao.total < data.dados.length ||
      new Set(data.dados.map((draw) => draw?.id)).size !== data.dados.length ||
      !data.dados.every(
        (draw) =>
          draw &&
          Number.isSafeInteger(draw.id) &&
          draw.id > 0 &&
          Number.isSafeInteger(draw.numero) &&
          draw.numero > 0 &&
          typeof draw.nome === 'string' &&
          draw.nome.trim() &&
          typeof draw.matricula === 'string' &&
          ['camara', 'prefeitura'].includes(draw.origem) &&
          typeof draw.sorteadoEm === 'string' &&
          Number.isFinite(Date.parse(draw.sorteadoEm)) &&
          (draw.premioNome === null || typeof draw.premioNome === 'string'),
      )
    ) {
      throw new Error('A API retornou um histórico inválido.')
    }
    if (!viewActive || revision !== historyRevision) return
    winners.value = data.dados.map((draw) => ({
      id: draw.id,
      order: draw.numero,
      name: draw.nome,
      registration: draw.matricula,
      localTrabalhoDescricao: draw.localTrabalhoDescricao?.trim() || '',
      institution:
        draw.origem === 'camara'
          ? 'Câmara Municipal de Contagem'
          : 'Prefeitura Municipal de Contagem',
      prize: draw.premioNome ?? 'Sorteio sem prêmio associado',
      drawnAt: draw.sorteadoEm,
    }))
    historyTotal.value = data.paginacao.total
  } catch {
    if (viewActive && revision === historyRevision)
      historyError.value =
        'Não foi possível consultar os últimos contemplados. Verifique a API e tente novamente.'
  } finally {
    if (viewActive && revision === historyRevision) historyLoading.value = false
  }
}

function refreshData(fresh = false) {
  return Promise.all([refreshIndicators(fresh), refreshHistory()])
}
const refreshAfterChange = () => refreshData(true)
onMounted(() => {
  window.addEventListener('focus', refreshAfterChange)
  window.addEventListener('evento-atualizado', refreshAfterChange)
  refreshData()
})
onBeforeUnmount(() => {
  viewActive = false
  summaryRevision += 1
  historyRevision += 1
  window.removeEventListener('focus', refreshAfterChange)
  window.removeEventListener('evento-atualizado', refreshAfterChange)
})

const indicators = computed(() => [
  {
    label: 'Presentes no evento',
    value: indicatorValue('presencasConfirmadas'),
    caption:
      indicatorValue('totalServidores') === '—'
        ? 'Participação confirmada'
        : `${indicatorData.value.totalServidores} servidores · ${indicatorData.value.servidoresPendentes} pendentes`,
    icon: 'users',
    color: 'blue',
  },
  {
    label: 'Aptos ao sorteio',
    value: indicatorValue('elegiveis'),
    caption: 'Ainda não contemplados',
    icon: 'check-circle',
    color: 'green',
  },
  {
    label: 'Contemplados',
    value: indicatorValue('servidoresContemplados'),
    caption:
      indicatorValue('sorteiosRealizados') === '—'
        ? 'Resultados registrados'
        : `${indicatorData.value.sorteiosRealizados} sorteios realizados`,
    icon: 'trophy',
    color: 'purple',
  },
  {
    label: 'Prêmios livres',
    value: indicatorValue('premiosDisponiveis'),
    caption:
      indicatorValue('premiosCadastrados') === '—'
        ? 'Cadastro opcional'
        : `${indicatorData.value.premiosCadastrados} cadastrados · ${indicatorData.value.premiosUtilizados} utilizados`,
    icon: 'gift',
    color: 'gold',
  },
])

// Ordena uma cópia para manter os destaques e o histórico do mais recente ao mais antigo.
const orderedWinners = computed(() =>
  [...winners.value].sort((first, second) => second.order - first.order),
)
const latestWinners = computed(() => orderedWinners.value.slice(0, 3))
const winnerTotal = computed(() =>
  historyLoading.value || historyError.value
    ? '—'
    : `${historyTotal.value} contemplado${historyTotal.value === 1 ? '' : 's'}`,
)

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(date))
}
</script>

<template>
  <svg class="home-icon-library" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <symbol id="home-calendar" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 11h18" />
    </symbol>
    <symbol id="home-info" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </symbol>
    <symbol id="home-id" viewBox="0 0 24 24">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M4 17c0-2 2-3 4-3s4 1 4 3m3-7h5m-5 4h4" />
    </symbol>
    <symbol id="home-arrow" viewBox="0 0 24 24">
      <path d="M4 12h16m-7-7 7 7-7 7" />
    </symbol>
    <symbol id="home-users" viewBox="0 0 24 24">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </symbol>
    <symbol id="home-check-circle" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </symbol>
    <symbol id="home-trophy" viewBox="0 0 24 24">
      <path
        d="M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0V3zM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4"
      />
    </symbol>
    <symbol id="home-gift" viewBox="0 0 24 24">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path
        d="M5 12v9h14v-9M12 8v13M12 8C9 8 6 7 6 4.5a2.5 2.5 0 0 1 5 0c0 1.4 1 3.5 1 3.5zm0 0c3 0 6-1 6-3.5a2.5 2.5 0 0 0-5 0c0 1.4-1 3.5-1 3.5z"
      />
    </symbol>
  </svg>

  <div class="home-view">
    <header class="home-topline">
      <div>
        <p class="home-eyebrow">Celebração</p>
        <h1 class="home-page-title">Olá, equipe! <span aria-hidden="true"></span></h1>
        <p class="home-page-desc">Tudo pronto para celebrar quem faz nossa cidade acontecer.</p>
      </div>
      <div class="home-top-right">
        <div class="home-mini-date">
          <svg class="home-icon home-icon-sm" aria-hidden="true">
            <use href="#home-calendar" />
          </svg>
          <span>Dia do Servidor</span>
        </div>
      </div>
    </header>

    <section aria-label="Visão geral">
      <section class="home-hero" aria-labelledby="home-hero-title">
        <div class="home-hero-text">
          <div class="home-hero-label"><span></span> Prefeitura Municipal de Contagem</div>
          <h2 id="home-hero-title">Quem faz a cidade acontecer <em>merece celebrar.</em></h2>
          <p>
            Um dia especial para nossos servidores. Credenciamento simples, sorteios transparentes e
            muita comemoração.
          </p>
          <div class="home-hero-actions">
            <RouterLink class="home-button home-button-gold" to="/credenciamento">
              <svg class="home-icon" aria-hidden="true">
                <use href="#home-id" />
              </svg>
              Registrar presença
            </RouterLink>
            <RouterLink class="home-button home-button-outline" to="/sorteio">
              Ir para sorteio
              <svg class="home-icon home-icon-sm" aria-hidden="true">
                <use href="#home-arrow" />
              </svg>
            </RouterLink>
          </div>
        </div>

        <div class="home-hero-art" aria-hidden="true">
          <div class="home-orbit"></div>
          <div class="home-star-row">✦✦✦✦✦✦✦</div>
          <div class="home-hero-emblem">
            <img :src="crestUrl" alt="" />
          </div>
          <div class="home-hero-bubble">
            <div class="home-hero-bubble-icon">
              <svg class="home-icon" aria-hidden="true">
                <use href="#home-check-circle" />
              </svg>
            </div>
            <div>
              <strong>{{ indicatorValue('presencasConfirmadas') }}</strong
              ><span>presenças confirmadas</span>
            </div>
          </div>
        </div>
      </section>

      <section class="home-metrics" aria-label="Indicadores do evento">
        <article v-for="indicator in indicators" :key="indicator.label" class="home-metric">
          <div class="home-metric-top">
            <span class="home-metric-label">{{ indicator.label }}</span>
            <span :class="['home-metric-icon', `home-metric-icon-${indicator.color}`]">
              <svg class="home-icon" aria-hidden="true">
                <use :href="`#home-${indicator.icon}`" />
              </svg>
            </span>
          </div>
          <p class="home-metric-number">{{ indicator.value }}</p>
          <p class="home-metric-caption">{{ indicator.caption }}</p>
        </article>
      </section>

      <p v-if="indicatorsLoading" class="home-section-support" role="status">
        Consultando indicadores…
      </p>
      <p v-else-if="indicatorsError" class="home-section-support" role="status">
        Indicadores indisponíveis.
        <button class="home-text-link" type="button" @click="refreshIndicators(true)">
          Tentar novamente
        </button>
      </p>

      <div class="home-section-line">
        <div>
          <h2>Últimos contemplados</h2>
          <p class="home-section-support">
            Os três últimos sorteios, do mais recente à esquerda. Todos os contemplados têm o mesmo
            destaque.
          </p>
        </div>
        <RouterLink class="home-text-link" to="/vencedores">Histórico completo →</RouterLink>
      </div>

      <section class="home-winner-showcase" aria-label="Destaques dos três últimos sorteios">
        <div class="home-winner-showcase-head">
          <div class="home-showcase-star" aria-hidden="true">✦</div>
          <div>
            <span class="home-showcase-kicker">NOSSA CELEBRAÇÃO</span>
            <h2>Quem acaba de ganhar merece brilhar!</h2>
          </div>
          <span class="home-showcase-deco" aria-hidden="true">✧ ✦ ✧</span>
        </div>

        <div
          class="home-winner-showcase-grid"
          :class="{
            'home-winner-showcase-grid-two': latestWinners.length === 2,
            'home-winner-showcase-grid-three': latestWinners.length === 3,
            'home-winner-showcase-grid-single': latestWinners.length === 1,
          }"
          aria-live="polite"
        >
          <div v-if="historyLoading" class="home-showcase-empty" role="status">
            Consultando últimos contemplados…
          </div>
          <div v-else-if="historyError" class="home-showcase-empty" role="status">
            <p>{{ historyError }}</p>
            <button
              class="home-button home-button-gold home-button-small"
              type="button"
              @click="refreshHistory"
            >
              Tentar novamente
            </button>
          </div>
          <template v-else-if="latestWinners.length">
            <article
              v-for="(winner, index) in latestWinners"
              :key="winner.id"
              :class="[
                'home-showcase-card',
                { 'home-showcase-latest': index === 0, 'home-showcase-older': index > 0 },
              ]"
            >
              <div class="home-showcase-glow"></div>
              <div class="home-showcase-topline">
                <span class="home-showcase-label"
                  >SORTEIO #{{ String(winner.order).padStart(3, '0') }}</span
                >
                <span class="home-showcase-status">✓ Contemplado</span>
              </div>
              <span class="home-showcase-medal">
                <svg class="home-icon home-icon-xl" aria-hidden="true">
                  <use href="#home-trophy" />
                </svg>
              </span>
              <h3 class="home-showcase-name">{{ winner.name }}</h3>
              <span class="home-showcase-registration">Matrícula {{ winner.registration }}</span>
              <span class="home-showcase-registration">{{ winner.institution }}</span>
              <span
                v-if="winner.localTrabalhoDescricao"
                class="home-showcase-registration home-workplace"
                >Local de trabalho: {{ winner.localTrabalhoDescricao }}</span
              >
              <div class="home-showcase-bottom">
                <span>
                  <svg class="home-icon home-icon-sm" aria-hidden="true">
                    <use href="#home-gift" />
                  </svg>
                  {{ winner.prize }}
                </span>
                <small>{{ formatDate(winner.drawnAt) }}</small>
              </div>
            </article>
          </template>

          <div v-else class="home-showcase-empty">
            <div class="home-showcase-empty-icon">
              <svg class="home-icon home-icon-xl" aria-hidden="true">
                <use href="#home-trophy" />
              </svg>
            </div>
            <h3>O primeiro vencedor aparecerá aqui!</h3>
            <p>Os três sorteios mais recentes aparecerão aqui, em clima de celebração.</p>
            <RouterLink class="home-button home-button-gold home-button-small" to="/sorteio">
              Começar a sortear
              <svg class="home-icon home-icon-sm" aria-hidden="true">
                <use href="#home-arrow" />
              </svg>
            </RouterLink>
          </div>
        </div>
      </section>

      <div class="home-section-line home-winners-all-heading">
        <div>
          <h2>Contemplados recentes</h2>
          <p class="home-section-support">
            Até seis resultados recentes. Consulte o histórico completo em Vencedores.
          </p>
        </div>
        <span class="home-winner-total">{{ winnerTotal }}</span>
      </div>

      <section class="home-winners-panel" aria-label="Lista de contemplados recentes">
        <div
          class="home-recent-list"
          :class="{ 'home-recent-list-with-winners': orderedWinners.length > 0 }"
          aria-live="polite"
        >
          <article
            v-for="winner in historyLoading || historyError ? [] : orderedWinners"
            :key="winner.id"
            class="home-recent-card"
          >
            <div class="home-recent-card-top">
              <span class="home-recent-sequence">
                SORTEIO #{{ String(winner.order).padStart(3, '0') }}
              </span>
              <span class="home-recent-status">✓ Contemplado</span>
            </div>
            <div class="home-recent-identity">
              <span class="home-recent-avatar">{{ winner.name.slice(0, 2).toUpperCase() }}</span>
              <div class="home-recent-body">
                <strong>{{ winner.name }}</strong>
                <span>Matrícula {{ winner.registration }}</span>
                <span>{{ winner.institution }}</span>
                <span v-if="winner.localTrabalhoDescricao" class="home-workplace"
                  >Local de trabalho: {{ winner.localTrabalhoDescricao }}</span
                >
              </div>
            </div>
            <div class="home-recent-prize">
              <svg class="home-icon home-icon-sm" aria-hidden="true">
                <use href="#home-gift" />
              </svg>
              <span>{{ winner.prize }}</span>
            </div>
            <div class="home-recent-time">
              <svg class="home-icon home-icon-sm" aria-hidden="true">
                <use href="#home-calendar" />
              </svg>
              {{ formatDate(winner.drawnAt) }}
            </div>
          </article>

          <div v-if="historyLoading || historyError" class="home-recent-empty" role="status">
            {{
              historyLoading
                ? 'Consultando histórico…'
                : 'Histórico indisponível. Tente novamente no destaque acima.'
            }}
          </div>
          <div v-else-if="!orderedWinners.length" class="home-recent-empty">
            <div class="home-empty-icon">
              <svg class="home-icon home-icon-xl" aria-hidden="true">
                <use href="#home-trophy" />
              </svg>
            </div>
            <div>
              <strong>Aguardando o primeiro contemplado</strong>
              <p>Depois do sorteio, o histórico de vencedores também aparecerá aqui.</p>
            </div>
          </div>
        </div>
      </section>
    </section>
  </div>
</template>
