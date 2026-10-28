<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { requestDrawApi } from '../../services/sorteios'
import './VencedoresView.css'

const winners = ref([])
const latestWinners = ref([])
const loading = ref(true)
const loadError = ref('')
const totalRecords = ref(0)
const currentPage = ref(1)
const totalPages = ref(0)
const pageSize = 20
let viewActive = true
let loadRevision = 0
const winnerGroups = computed(() =>
  [
    { id: 'latest', title: 'Últimos contemplados', winners: latestWinners.value },
    {
      id: 'history',
      title: 'Demais resultados',
      winners: winners.value.filter(
        (winner) => !latestWinners.value.some((latest) => latest.id === winner.id),
      ),
    },
  ].filter((group) => group.winners.length),
)
const celebratingAll = ref(false)
const celebrationLoading = ref(false)
const celebrationError = ref('')
const celebrationPage = ref(1)
const celebrationPages = ref(0)
const celebrationTotal = ref(0)
let celebrationRevision = 0
const celebrationDialog = ref(null)
const celebrationWinners = ref([])
const confettiPieces = ref([])
const celebrationRound = ref(0)
let confettiTimeout

async function getHistoryPage(page, limit = pageSize) {
  const data = await requestDrawApi(`/api/sorteios?page=${page}&limit=${limit}`)
  const pagination = data?.paginacao
  if (
    !Array.isArray(data?.dados) ||
    !pagination ||
    pagination.pagina !== page ||
    pagination.limite !== limit ||
    !Number.isSafeInteger(pagination.total) ||
    pagination.total < 0 ||
    pagination.paginas !== Math.ceil(pagination.total / limit) ||
    data.dados.length > limit ||
    data.dados.length > pagination.total ||
    new Set(data.dados.map((draw) => draw?.id)).size !== data.dados.length ||
    !data.dados.every(
      (draw) =>
        draw &&
        Number.isSafeInteger(draw.id) &&
        draw.id > 0 &&
        Number.isSafeInteger(draw.numero) &&
        draw.numero > 0 &&
        Number.isSafeInteger(draw.participanteId) &&
        draw.participanteId > 0 &&
        typeof draw.nome === 'string' &&
        draw.nome.trim() &&
        typeof draw.matricula === 'string' &&
        ['prefeitura', 'camara'].includes(draw.origem) &&
        typeof draw.sorteadoEm === 'string' &&
        Number.isFinite(Date.parse(draw.sorteadoEm)) &&
        (draw.premioNome === null || typeof draw.premioNome === 'string'),
    )
  ) {
    throw new Error('A API retornou um histórico inválido. Tente atualizar os dados.')
  }
  return {
    dados: data.dados.map((draw) => ({
      id: draw.id,
      participantId: draw.participanteId,
      drawNumber: draw.numero,
      nome: draw.nome,
      matricula: draw.matricula,
      origem: draw.origem,
      localTrabalhoDescricao: draw.localTrabalhoDescricao?.trim() || '',
      drawnAt: draw.sorteadoEm,
      premio: draw.premioNome ?? '',
    })),
    paginacao: pagination,
  }
}

async function loadWinners(page = currentPage.value) {
  const revision = ++loadRevision
  loading.value = true
  loadError.value = ''
  try {
    const [history, highlights] = await Promise.all([
      getHistoryPage(page),
      page === 1 ? Promise.resolve(null) : getHistoryPage(1, 3),
    ])
    if (!viewActive || revision !== loadRevision) return
    if (page > Math.max(1, history.paginacao.paginas)) {
      return await loadWinners(Math.max(1, history.paginacao.paginas))
    }
    winners.value = history.dados
    latestWinners.value = highlights?.dados ?? history.dados.slice(0, 3)
    totalRecords.value = history.paginacao.total
    totalPages.value = history.paginacao.paginas
    currentPage.value = page
  } catch (error) {
    if (viewActive && revision === loadRevision) loadError.value = historyError(error)
  } finally {
    if (viewActive && revision === loadRevision) loading.value = false
  }
}

function historyError(error) {
  if (error.status)
    return error.status >= 500
      ? 'Não foi possível consultar o histórico na API. Tente novamente.'
      : error.message
  // O serviço compartilhado também atende ao POST; aqui não existe operação pendente.
  return error.message.includes('operação pendente')
    ? 'Não foi possível consultar o histórico. Verifique a conexão com a API e tente novamente.'
    : error.message
}

function changePage(page) {
  if (loading.value || page < 1 || page > totalPages.value) return
  return loadWinners(page)
}

async function loadCelebrationPage(page) {
  const revision = ++celebrationRevision
  celebrationLoading.value = true
  celebrationError.value = ''
  celebrationPage.value = page
  try {
    const history = await getHistoryPage(page)
    if (!viewActive || revision !== celebrationRevision) return
    if (page > Math.max(1, history.paginacao.paginas)) {
      return await loadCelebrationPage(Math.max(1, history.paginacao.paginas))
    }
    celebrationWinners.value = history.dados
    celebrationPage.value = page
    celebrationPages.value = history.paginacao.paginas
    celebrationTotal.value = history.paginacao.total
  } catch (error) {
    if (viewActive && revision === celebrationRevision) celebrationError.value = historyError(error)
  } finally {
    if (viewActive && revision === celebrationRevision) celebrationLoading.value = false
  }
}

async function celebrateAll() {
  if (celebrationLoading.value) return
  celebrationLoading.value = true
  celebratingAll.value = true
  celebrationTotal.value = totalRecords.value
  celebrationWinners.value = []
  celebrationError.value = ''
  await nextTick()
  if (!viewActive) return
  if (!celebrationDialog.value?.open) celebrationDialog.value?.showModal()
  await loadCelebrationPage(1)
  if (viewActive && !celebrationError.value && celebrationWinners.value.length) startConfetti()
}

function institutionName(origin) {
  return origin === 'camara' ? 'Câmara Municipal de Contagem' : 'Prefeitura Municipal de Contagem'
}

function formatDrawnAt(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(date))
}

function createConfetti() {
  return Array.from({ length: 100 }, (_, index) => ({
    id: index,
    x: `${(index * 47) % 100}%`,
    delay: `${(index % 8) * 0.06}s`,
    duration: `${3.5 + (index % 6) * 0.2}s`,
    color: ['#f4c84c', '#6ed4a2', '#bca0f5', '#f38e9b'][index % 4],
    rotation: `${index * 19}deg`,
    drift: `${((index % 9) - 4) * 16}px`,
  }))
}

async function celebrate(selectedWinners) {
  if (!selectedWinners.length) return
  celebrationRevision += 1
  celebratingAll.value = false
  celebrationLoading.value = false
  celebrationError.value = ''
  celebrationWinners.value = selectedWinners
  startConfetti()
  await nextTick()
  if (viewActive && !celebrationDialog.value?.open) celebrationDialog.value?.showModal()
}

function startConfetti() {
  celebrationRound.value += 1
  window.clearTimeout(confettiTimeout)
  confettiPieces.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? []
    : createConfetti()

  confettiTimeout = window.setTimeout(() => {
    confettiPieces.value = []
  }, 5200)
}

function closeCelebration() {
  celebrationDialog.value?.close()
}

function clearCelebration() {
  celebrationRevision += 1
  celebrationLoading.value = false
  celebrationError.value = ''
  window.clearTimeout(confettiTimeout)
  confettiPieces.value = []
  celebrationWinners.value = []
}

onMounted(() => loadWinners(1))
onBeforeUnmount(() => {
  viewActive = false
  loadRevision += 1
  clearCelebration()
})
</script>

<template>
  <svg class="winners-icon-library" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <symbol id="winners-check-circle" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </symbol>
    <symbol id="winners-calendar" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 11h18" />
    </symbol>
    <symbol id="winners-gift" viewBox="0 0 24 24">
      <path
        d="M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9H7.5a2.5 2.5 0 1 1 2.2-3.7L12 9zm0 0h4.5a2.5 2.5 0 1 0-2.2-3.7L12 9z"
      />
    </symbol>
    <symbol id="winners-sparkles" viewBox="0 0 24 24">
      <path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3z" />
      <path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </symbol>
    <symbol id="winners-trophy" viewBox="0 0 24 24">
      <path
        d="M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0V3zM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4"
      />
    </symbol>
    <symbol id="winners-close" viewBox="0 0 24 24">
      <path d="m18 6-12 12M6 6l12 12" />
    </symbol>
  </svg>

  <div class="winners-view">
    <header class="winners-topline">
      <div>
        <p class="winners-eyebrow">HISTÓRICO</p>
        <h1 class="winners-title">Vencedores</h1>
        <p class="winners-description">Todos os resultados e momentos especiais em um só lugar.</p>
      </div>
      <span class="winners-demo-tag">RESULTADOS REGISTRADOS</span>
    </header>

    <section class="winners-intro" aria-label="Sobre o histórico de vencedores">
      <span class="winners-intro-icon">
        <svg class="winners-icon" aria-hidden="true"><use href="#winners-check-circle" /></svg>
      </span>
      <div>
        <strong>Quem ganhou, fica registrado.</strong>
        <p>Veja os contemplados e o prêmio escolhido em cada sorteio.</p>
      </div>
    </section>

    <section aria-labelledby="winners-record-title">
      <header class="winners-section-heading">
        <div>
          <h2 id="winners-record-title">Registro de contemplados</h2>
          <span v-if="!loading && !loadError" class="winners-count">
            {{ totalRecords }}
            {{ totalRecords === 1 ? 'resultado' : 'resultados' }}
          </span>
        </div>
        <button
          v-if="totalRecords && !loadError"
          class="winners-celebrate-all"
          type="button"
          :disabled="loading || celebrationLoading"
          @click="celebrateAll"
        >
          <svg class="winners-icon winners-icon-small" aria-hidden="true">
            <use href="#winners-sparkles" />
          </svg>
          Celebrar todos
        </button>
      </header>

      <div v-if="loading" class="winners-empty" role="status" aria-live="polite">
        <strong>Carregando histórico de vencedores…</strong>
      </div>
      <div v-else-if="loadError" class="winners-empty" role="alert">
        <strong>Não foi possível carregar o histórico</strong>
        <p>{{ loadError }}</p>
        <button class="winner-celebrate-button" type="button" @click="loadWinners()">
          Tentar novamente
        </button>
      </div>
      <template v-else-if="totalRecords">
        <section
          v-for="group in winnerGroups"
          :key="group.id"
          :aria-labelledby="`winners-${group.id}`"
        >
          <h3 :id="`winners-${group.id}`" class="winners-group-title">{{ group.title }}</h3>
          <div
            class="winners-list"
            :class="{ 'winners-list-highlights': group.id === 'latest' }"
            :style="
              group.id === 'latest' ? { '--winner-columns': group.winners.length } : undefined
            "
          >
            <article v-for="winner in group.winners" :key="winner.id" class="winner-card">
              <div class="winner-card-top">
                <span class="winner-sequence">
                  SORTEIO #{{ String(winner.drawNumber).padStart(3, '0') }}
                </span>
                <span class="winner-time">
                  <svg class="winners-icon winners-icon-small" aria-hidden="true">
                    <use href="#winners-calendar" />
                  </svg>
                  <time :datetime="winner.drawnAt">{{ formatDrawnAt(winner.drawnAt) }}</time>
                </span>
              </div>

              <div class="winner-main">
                <div class="winner-avatar" aria-hidden="true">
                  {{
                    winner.nome
                      .split(' ')
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join('')
                  }}
                </div>
                <div class="winner-identity">
                  <strong>{{ winner.nome }}</strong>
                  <span>Matrícula {{ winner.matricula }}</span>
                  <span>{{ institutionName(winner.origem) }}</span>
                  <span v-if="winner.localTrabalhoDescricao"
                    >Local de trabalho: {{ winner.localTrabalhoDescricao }}</span
                  >
                </div>
                <span class="winner-status">
                  <svg class="winners-icon winners-icon-small" aria-hidden="true">
                    <use href="#winners-check-circle" />
                  </svg>
                  Contemplado
                </span>
              </div>

              <div class="winner-prize" :class="{ 'no-prize': !winner.premio }">
                <svg class="winners-icon winners-icon-small" aria-hidden="true">
                  <use href="#winners-gift" />
                </svg>
                <span v-if="winner.premio"
                  >Prêmio: <strong>{{ winner.premio }}</strong></span
                >
                <span v-else>Sorteio sem prêmio associado</span>
              </div>

              <div class="winner-actions">
                <button class="winner-celebrate-button" type="button" @click="celebrate([winner])">
                  <svg class="winners-icon winners-icon-small" aria-hidden="true">
                    <use href="#winners-sparkles" />
                  </svg>
                  Celebrar ganhador
                </button>
              </div>
            </article>
          </div>
        </section>
        <nav v-if="totalPages > 1" class="winners-pagination" aria-label="Paginação do histórico">
          <button
            class="winner-celebrate-button"
            type="button"
            :disabled="currentPage <= 1"
            @click="changePage(currentPage - 1)"
          >
            Anterior
          </button>
          <span role="status" aria-live="polite">Página {{ currentPage }} de {{ totalPages }}</span>
          <button
            class="winner-celebrate-button"
            type="button"
            :disabled="currentPage >= totalPages"
            @click="changePage(currentPage + 1)"
          >
            Próxima
          </button>
        </nav>
      </template>

      <div v-else class="winners-empty">
        <span class="winners-empty-icon">
          <svg class="winners-icon winners-icon-large" aria-hidden="true">
            <use href="#winners-trophy" />
          </svg>
        </span>
        <strong>Nenhum vencedor registrado</strong>
        <p>Após o primeiro sorteio, os contemplados aparecerão aqui.</p>
      </div>
    </section>
  </div>

  <dialog
    ref="celebrationDialog"
    class="winners-celebration-dialog"
    aria-labelledby="celebration-title"
    :aria-describedby="
      celebrationLoading || celebrationError || !celebrationWinners.length
        ? undefined
        : 'celebration-description'
    "
    @close="clearCelebration"
  >
    <div class="celebration-confetti" :key="celebrationRound" aria-hidden="true">
      <span
        v-for="piece in confettiPieces"
        :key="piece.id"
        :style="{
          '--confetti-x': piece.x,
          '--confetti-delay': piece.delay,
          '--confetti-duration': piece.duration,
          '--confetti-color': piece.color,
          '--confetti-rotation': piece.rotation,
          '--confetti-drift': piece.drift,
        }"
      ></span>
    </div>
    <div class="celebration-shell">
      <header class="celebration-top">
        <span class="celebration-kicker">
          <svg class="winners-icon winners-icon-small" aria-hidden="true">
            <use href="#winners-sparkles" />
          </svg>
          {{ celebrationWinners.length > 1 ? 'Uma conquista de todos' : 'Momento de celebrar' }}
        </span>
        <button
          class="celebration-close"
          type="button"
          aria-label="Fechar comemoração"
          autofocus
          @click="closeCelebration"
        >
          <svg class="winners-icon winners-icon-small" aria-hidden="true">
            <use href="#winners-close" />
          </svg>
        </button>
      </header>

      <div v-if="celebrationLoading" class="celebration-heading" role="status">
        <h2 id="celebration-title">Carregando contemplados…</h2>
      </div>
      <div v-else-if="celebrationError" class="celebration-heading" role="alert">
        <h2 id="celebration-title">Não foi possível carregar os contemplados</h2>
        <p>{{ celebrationError }}</p>
        <button
          class="winner-celebrate-button"
          type="button"
          @click="loadCelebrationPage(celebrationPage)"
        >
          Tentar novamente
        </button>
      </div>
      <div v-else-if="!celebrationWinners.length" class="celebration-heading" role="status">
        <h2 id="celebration-title">Nenhum vencedor registrado.</h2>
      </div>
      <template
        v-else-if="celebrationWinners.length === 1 && (!celebratingAll || celebrationTotal === 1)"
      >
        <div class="celebration-orb" aria-hidden="true">
          <svg class="winners-icon" aria-hidden="true"><use href="#winners-trophy" /></svg>
        </div>
        <h2 id="celebration-title" class="celebration-name">
          {{ celebrationWinners[0].nome }}
        </h2>
        <p id="celebration-description" class="celebration-meta">
          Matrícula {{ celebrationWinners[0].matricula }} ·
          {{ institutionName(celebrationWinners[0].origem) }}
        </p>
        <p v-if="celebrationWinners[0].localTrabalhoDescricao" class="celebration-meta">
          Local de trabalho: {{ celebrationWinners[0].localTrabalhoDescricao }}
        </p>
        <div class="celebration-prize" :class="{ 'no-prize': !celebrationWinners[0].premio }">
          <svg class="winners-icon winners-icon-small" aria-hidden="true">
            <use href="#winners-gift" />
          </svg>
          {{
            celebrationWinners[0].premio
              ? celebrationWinners[0].premio
              : 'Sorteio sem prêmio associado'
          }}
        </div>
      </template>

      <template v-else>
        <div class="celebration-heading">
          <div class="celebration-medal" aria-hidden="true">
            <svg class="winners-icon" aria-hidden="true"><use href="#winners-trophy" /></svg>
          </div>
          <h2 id="celebration-title">Parabéns a todos os contemplados!</h2>
          <p id="celebration-description">Cada conquista merece ser celebrada.</p>
        </div>
        <div class="celebration-grid" :class="{ 'one-winner': celebrationWinners.length === 1 }">
          <article v-for="winner in celebrationWinners" :key="winner.id" class="celebration-card">
            <small>SORTEIO #{{ String(winner.drawNumber).padStart(3, '0') }}</small>
            <strong>{{ winner.nome }}</strong>
            <span>
              {{ winner.premio ? `Prêmio: ${winner.premio}` : 'Sorteio sem prêmio associado' }}
            </span>
          </article>
        </div>
      </template>

      <nav
        v-if="celebratingAll && !celebrationLoading && !celebrationError && celebrationPages > 1"
        class="winners-pagination"
        aria-label="Paginação da celebração"
      >
        <button
          class="winner-celebrate-button"
          type="button"
          :disabled="celebrationPage <= 1"
          @click="loadCelebrationPage(celebrationPage - 1)"
        >
          Anterior
        </button>
        <span role="status" aria-live="polite"
          >Página {{ celebrationPage }} de {{ celebrationPages }}</span
        >
        <button
          class="winner-celebrate-button"
          type="button"
          :disabled="celebrationPage >= celebrationPages"
          @click="loadCelebrationPage(celebrationPage + 1)"
        >
          Próxima
        </button>
      </nav>

      <p
        v-if="
          !celebrationLoading &&
          !celebrationError &&
          celebrationWinners.length === 1 &&
          (!celebratingAll || celebrationTotal === 1)
        "
        class="celebration-copy"
      >
        Parabéns por essa conquista! Que este seja mais um momento especial para guardar.
      </p>
      <div class="celebration-actions">
        <button class="winner-celebrate-button" type="button" @click="closeCelebration">
          Fechar comemoração
        </button>
      </div>
    </div>
  </dialog>
</template>
