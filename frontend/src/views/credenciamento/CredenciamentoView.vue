<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import api from '../../services/api'
import {
  listParticipants,
  listRecentConfirmations,
  toggleParticipantPresence,
} from '../../services/participant-service'
import { loadEventIndicators } from '../../services/event-indicators'
import './CredenciamentoView.css'

const participants = ref([])
const environmentLabel = ref('AMBIENTE NÃO CONFIRMADO')

async function loadEnvironment() {
  try {
    const { data: health } = await api.get('/health')
    const labels = {
      oficial: 'BASE OFICIAL',
      testes: 'AMBIENTE DE TESTES',
      configurado: 'AMBIENTE CONFIGURADO',
    }
    environmentLabel.value =
      health.status === 'ok'
        ? (labels[health.ambiente] ?? 'AMBIENTE NÃO CONFIRMADO')
        : 'AMBIENTE NÃO CONFIRMADO'
  } catch {
    environmentLabel.value = 'AMBIENTE NÃO CONFIRMADO'
  }
}
const indicatorData = ref({
  totalServidores: 0,
  servidoresPendentes: 0,
  presencasConfirmadas: 0,
  servidoresContemplados: 0,
})

const isSaving = ref(false)
const loading = ref(true)
const loadError = ref('')
const indicatorsError = ref('')
const indicatorsLoaded = ref(false)
const directorySearch = ref('')
const activeFilter = ref('all')
const currentPage = ref(1)
const pageSize = 10
const totalPages = ref(0)
const totalRecords = ref(0)

const filters = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'winner', label: 'Vencedores' },
]

const indicators = computed(() => [
  {
    label: 'Servidores na base',
    value: indicatorsLoaded.value ? indicatorData.value.totalServidores : '—',
    tone: 'total',
  },
  {
    label: 'Pendentes de presença',
    value: indicatorsLoaded.value ? indicatorData.value.servidoresPendentes : '—',
    tone: 'pending',
  },
  {
    label: 'Presenças confirmadas',
    value: indicatorsLoaded.value ? indicatorData.value.presencasConfirmadas : '—',
    tone: 'present',
  },
  {
    label: 'Já contemplados',
    value: indicatorsLoaded.value ? indicatorData.value.servidoresContemplados : '—',
    tone: 'winners',
  },
])

const latestConfirmations = ref([])
const recentError = ref('')
let directoryRequest = 0
let searchTimer

const directoryResultsLabel = computed(() => {
  const total = participants.value.length
  const noun = total === 1 ? 'servidor' : 'servidores'

  return `${total} ${noun} nesta página · ${totalRecords.value} no resultado`
})

async function loadDirectory(page = currentPage.value) {
  const requestId = ++directoryRequest
  loading.value = true
  loadError.value = ''

  try {
    const search = directorySearch.value.trim()
    const normalizedSearch = search
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    const publicAgency = normalizedSearch.includes('camara')
      ? 'CAMARA'
      : normalizedSearch.includes('prefeitura')
        ? 'PREFEITURA'
        : undefined
    const requestSearch = publicAgency ? '' : search
    const filters = {
      present:
        activeFilter.value === 'pending'
          ? false
          : ['confirmed', 'winner'].includes(activeFilter.value)
            ? true
            : undefined,
      publicAgency,
      search: requestSearch || undefined,
    }
    const fetchPage = (pageNumber, limit) =>
      listParticipants({ ...filters, page: pageNumber, pageSize: limit })

    if (['confirmed', 'winner'].includes(activeFilter.value)) {
      const firstPage = await fetchPage(1, 100)
      const allParticipants = [...firstPage.participantes]
      for (let nextPage = 2; nextPage <= firstPage.paginacao.totalPages; nextPage += 1) {
        const result = await fetchPage(nextPage, 100)
        allParticipants.push(...result.participantes)
      }
      if (requestId !== directoryRequest) return
      const filtered = allParticipants
        .map(mapParticipant)
        .filter((participant) =>
          activeFilter.value === 'winner' ? participant.contemplado : !participant.contemplado,
        )
      totalRecords.value = filtered.length
      totalPages.value = Math.ceil(filtered.length / pageSize)
      currentPage.value = Math.min(page, Math.max(totalPages.value, 1))
      participants.value = filtered.slice(
        (currentPage.value - 1) * pageSize,
        currentPage.value * pageSize,
      )
    } else {
      const result = await fetchPage(page, pageSize)
      if (requestId !== directoryRequest) return
      participants.value = result.participantes.map(mapParticipant)
      currentPage.value = result.paginacao.page
      totalPages.value = result.paginacao.totalPages
      totalRecords.value = result.total
    }
  } catch (error) {
    if (requestId === directoryRequest) loadError.value = error.message
  } finally {
    if (requestId === directoryRequest) loading.value = false
  }
}

function mapParticipant(participant) {
  return {
    ...participant,
    nome: participant.name,
    matricula: participant.registrationNumber ?? '',
    origem: participant.publicAgency === 'CAMARA' ? 'camara' : 'prefeitura',
    localTrabalhoDescricao: participant.department ?? '',
    confirmadoEm: participant.confirmedAt,
    presente: participant.present,
    contemplado: participant.isWinner,
  }
}

async function loadIndicators() {
  indicatorsError.value = ''
  try {
    indicatorData.value = await loadEventIndicators()
    indicatorsLoaded.value = true
  } catch (error) {
    indicatorsError.value = error.message
  }
}

async function refreshData(page = currentPage.value) {
  await Promise.all([
    loadDirectory(page),
    loadIndicators(),
    loadRecentConfirmations(),
    loadEnvironment(),
  ])
}

async function changePage(page) {
  if (loading.value || page < 1 || page > totalPages.value) return
  await loadDirectory(page)
}

async function loadRecentConfirmations() {
  recentError.value = ''
  try {
    const participants = await listRecentConfirmations()
    latestConfirmations.value = participants.map(mapParticipant)
  } catch (error) {
    latestConfirmations.value = []
    recentError.value = error.message
  }
}

function formatConfirmation(value) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

watch([directorySearch, activeFilter], () => {
  clearTimeout(searchTimer)
  // Invalida respostas anteriores assim que o filtro muda.
  directoryRequest += 1
  loading.value = true
  currentPage.value = 1
  searchTimer = setTimeout(() => loadDirectory(1), 250)
})

onUnmounted(() => {
  clearTimeout(searchTimer)
  directoryRequest += 1
})

function institutionName(origin) {
  return origin === 'camara' ? 'Câmara Municipal de Contagem' : 'Prefeitura Municipal de Contagem'
}

function participantStatus(person) {
  if (person.contemplado) return 'winner'
  return person.presente ? 'confirmed' : 'pending'
}

function statusLabel(person) {
  const labels = { pending: 'Pendente', confirmed: 'Confirmado', winner: 'Vencedor' }
  return labels[participantStatus(person)]
}

function selectFilter(filter) {
  activeFilter.value = filter
}

async function confirmPresence(person) {
  if (
    isSaving.value ||
    loading.value ||
    !!loadError.value ||
    !participants.value.some((result) => result.id === person.id)
  ) {
    return
  }

  if (person.contemplado || person.presente) {
    await Swal.fire({
      icon: 'warning',
      title: 'Presença não disponível',
      text: person.contemplado
        ? 'A presença de um vencedor não pode ser alterada.'
        : 'A presença deste servidor já está confirmada.',
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#0868af',
    })
    return
  }

  isSaving.value = true
  try {
    const confirmation = await Swal.fire({
      icon: 'question',
      title: 'Confirmar presença?',
      text: `${person.nome} · ${person.matricula} · ${institutionName(person.origem)}`,
      showCancelButton: true,
      confirmButtonText: 'Confirmar presença',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0868af',
      cancelButtonColor: '#e8eef4',
      reverseButtons: true,
    })
    if (!confirmation.isConfirmed) return

    const updatedParticipant = await toggleParticipantPresence(person.id)
    person.presente = updatedParticipant.present
    person.contemplado = updatedParticipant.isWinner
    await refreshData()
    await Swal.fire({
      icon: 'success',
      title: 'Presença confirmada',
      text: `${person.nome} · ${institutionName(person.origem)}`,
      confirmButtonText: 'Concluir',
      confirmButtonColor: '#0868af',
    })
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: 'Não foi possível confirmar',
      text: error.message,
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#0868af',
    })
    if (error.message.includes('já foi confirmada')) {
      await refreshData()
    }
  } finally {
    isSaving.value = false
  }
}

async function undoPresence(person) {
  if (isSaving.value) return
  isSaving.value = true
  try {
    if (!person.presente || person.contemplado) {
      await Swal.fire({
        icon: 'warning',
        title: 'Ação não permitida',
        text: 'A presença de um vencedor não pode ser desfeita.',
        confirmButtonText: 'Entendi',
        confirmButtonColor: '#0868af',
      })
      return
    }

    const result = await Swal.fire({
      icon: 'warning',
      title: 'Desfazer presença?',
      text: `${person.nome} · ${institutionName(person.origem)}`,
      showCancelButton: true,
      confirmButtonText: 'Desfazer presença',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#a83e4b',
      cancelButtonColor: '#e8eef4',
      reverseButtons: true,
    })
    if (!result.isConfirmed) return

    await toggleParticipantPresence(person.id)
    await refreshData()
    await Swal.fire({
      icon: 'success',
      title: 'Presença desfeita',
      text: `A presença de ${person.nome} foi desfeita.`,
      confirmButtonText: 'Concluir',
      confirmButtonColor: '#0868af',
    })
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: 'Não foi possível desfazer',
      text: error.message.includes('contemplado')
        ? 'Este servidor já foi contemplado; a presença deve ser mantida.'
        : error.message,
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#0868af',
    })
    await refreshData()
  } finally {
    isSaving.value = false
  }
}

onMounted(refreshData)
</script>

<template>
  <svg class="checkin-icon-library" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <symbol id="checkin-search" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m16 16 5 5" />
    </symbol>
    <symbol id="checkin-id" viewBox="0 0 24 24">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M4 17c0-2 2-3 4-3s4 1 4 3m3-7h5m-5 4h4" />
    </symbol>
    <symbol id="checkin-check" viewBox="0 0 24 24">
      <path d="m5 12 4 4L19 6" />
    </symbol>
    <symbol id="checkin-check-circle" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </symbol>
    <symbol id="checkin-clock" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </symbol>
    <symbol id="checkin-trophy" viewBox="0 0 24 24">
      <path
        d="M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0V3zM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4"
      />
    </symbol>
    <symbol id="checkin-info" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </symbol>
  </svg>

  <div class="checkin-view">
    <header class="checkin-topline">
      <div>
        <p class="checkin-eyebrow">CONTROLE DE ACESSO</p>
        <h1 class="checkin-page-title">Credenciamento</h1>
        <p class="checkin-page-desc">
          Confirme a chegada dos servidores para habilitá-los aos sorteios.
        </p>
      </div>
      <div class="checkin-demo-tag">{{ environmentLabel }} · DADOS REAIS</div>
    </header>

    <section class="checkin-layout" aria-label="Credenciamento de servidores">
      <div class="checkin-search-column">
        <section class="checkin-panel checkin-directory" aria-labelledby="checkin-directory-title">
          <header class="checkin-directory-head">
            <div>
              <h2 id="checkin-directory-title" class="checkin-panel-title">
                <svg class="checkin-icon" aria-hidden="true"><use href="#checkin-id" /></svg>
                Servidores da base
              </h2>
              <p>Pesquise por nome ou matrícula e confirme a presença no registro correto.</p>
            </div>
          </header>

          <div class="checkin-summary" aria-label="Resumo dos servidores">
            <article
              v-for="indicator in indicators"
              :key="indicator.label"
              :class="['checkin-summary-item', `checkin-summary-${indicator.tone}`]"
            >
              <strong>{{ indicator.value }}</strong>
              <span>{{ indicator.label }}</span>
            </article>
          </div>
          <p v-if="indicatorsError" class="checkin-feedback checkin-feedback-warning" role="alert">
            Não foi possível atualizar os indicadores: {{ indicatorsError }}
          </p>

          <div class="checkin-directory-tools">
            <label class="checkin-directory-search">
              <svg class="checkin-icon" aria-hidden="true"><use href="#checkin-search" /></svg>
              <span class="checkin-sr-only">
                Buscar na base por nome, matrícula ou instituição</span
              >
              <input
                v-model="directorySearch"
                type="search"
                autocomplete="off"
                placeholder="Buscar na base por nome, matrícula ou instituição..."
                maxlength="200"
              />
            </label>
            <div class="checkin-filter" role="group" aria-label="Filtrar servidores por situação">
              <button
                v-for="filter in filters"
                :key="filter.value"
                :class="{ active: activeFilter === filter.value }"
                type="button"
                :aria-pressed="activeFilter === filter.value"
                @click="selectFilter(filter.value)"
              >
                {{ filter.label }}
              </button>
            </div>
          </div>

          <div class="checkin-list-heading" aria-hidden="true">
            <span>Servidor / instituição</span>
            <span>Matrícula</span>
            <span>Situação</span>
            <span>Ação</span>
          </div>

          <div v-if="loading" class="checkin-directory-empty" role="status" aria-live="polite">
            <strong>Carregando servidores…</strong>
          </div>
          <div v-else-if="loadError" class="checkin-directory-empty" role="alert">
            <strong>Não foi possível carregar os servidores</strong>
            <span>{{ loadError }}</span>
            <button
              class="checkin-button checkin-button-secondary checkin-button-small"
              type="button"
              @click="refreshData()"
            >
              Tentar novamente
            </button>
          </div>
          <div v-else-if="participants.length" class="checkin-participant-list" role="list">
            <article
              v-for="person in participants"
              :key="person.id"
              class="checkin-participant-row"
              role="listitem"
            >
              <div class="checkin-participant-identity">
                <div>
                  <strong>{{ person.nome }}</strong>
                  <span>{{ institutionName(person.origem) }}</span>
                  <span v-if="person.localTrabalhoDescricao" class="checkin-workplace"
                    >Local de trabalho: {{ person.localTrabalhoDescricao }}</span
                  >
                </div>
              </div>
              <span class="checkin-participant-number">{{ person.matricula }}</span>
              <span :class="['checkin-status', `checkin-status-${participantStatus(person)}`]">
                <svg class="checkin-icon checkin-icon-small" aria-hidden="true">
                  <use
                    :href="`#checkin-${person.contemplado ? 'trophy' : person.presente ? 'check-circle' : 'clock'}`"
                  />
                </svg>
                {{ statusLabel(person) }}
              </span>
              <div class="checkin-participant-action">
                <button
                  v-if="person.presente && !person.contemplado"
                  class="checkin-button checkin-button-danger checkin-button-small"
                  type="button"
                  :aria-label="`Desfazer presença de ${person.nome}`"
                  :disabled="isSaving"
                  @click="undoPresence(person)"
                >
                  Desfazer presença
                </button>
                <span v-else-if="person.contemplado" class="checkin-action-note">
                  <svg class="checkin-icon checkin-icon-small" aria-hidden="true">
                    <use href="#checkin-trophy" />
                  </svg>
                  Presença mantida
                </span>
                <button
                  v-else
                  class="checkin-button checkin-button-primary checkin-button-small"
                  type="button"
                  :aria-label="`Confirmar presença de ${person.nome}, matrícula ${person.matricula}, ${institutionName(person.origem)}`"
                  :disabled="isSaving"
                  @click="confirmPresence(person)"
                >
                  Confirmar presença
                </button>
              </div>
            </article>
          </div>
          <div v-else class="checkin-directory-empty" role="status">
            <strong>Nenhum servidor encontrado</strong>
            <span>
              {{
                directorySearch || activeFilter !== 'all'
                  ? 'Tente outro termo ou ajuste o filtro.'
                  : 'Não há servidores nesta página.'
              }}
            </span>
          </div>

          <footer class="checkin-directory-footer">
            <span role="status" aria-live="polite">{{ directoryResultsLabel }}</span>
            <nav
              v-if="totalPages > 1"
              class="checkin-pagination"
              aria-label="Paginação dos servidores"
            >
              <button
                class="checkin-button checkin-button-secondary checkin-button-small"
                type="button"
                :disabled="loading || currentPage <= 1"
                @click="changePage(currentPage - 1)"
              >
                Anterior
              </button>
              <span>Página {{ currentPage }} de {{ totalPages }}</span>
              <button
                class="checkin-button checkin-button-secondary checkin-button-small"
                type="button"
                :disabled="loading || currentPage >= totalPages"
                @click="changePage(currentPage + 1)"
              >
                Próxima
              </button>
            </nav>
          </footer>
        </section>
        <aside class="checkin-help-strip">
          <svg class="checkin-icon" aria-hidden="true"><use href="#checkin-info" /></svg>
          <p>
            <strong>Apenas quem chegou participa.</strong>
            Localizar um servidor na base não confirma sua presença. Confirme somente após verificar
            que a pessoa está no evento.
          </p>
        </aside>
      </div>

      <div class="checkin-history-column">
        <section class="checkin-recent" aria-labelledby="checkin-recent-title">
          <header class="checkin-panel-head">
            <div>
              <h2 id="checkin-recent-title" class="checkin-panel-title">
                <svg class="checkin-icon" aria-hidden="true">
                  <use href="#checkin-check-circle" />
                </svg>
                Presenças recentes
              </h2>
              <p class="checkin-panel-subtitle">Últimas confirmações registradas em toda a base.</p>
            </div>
            <span class="checkin-count">{{ latestConfirmations.length }} recentes</span>
          </header>
          <p v-if="recentError" class="checkin-feedback checkin-feedback-warning" role="alert">
            Não foi possível atualizar as presenças recentes: {{ recentError }}
          </p>
          <div v-else-if="latestConfirmations.length" class="checkin-confirmation-list">
            <article
              v-for="person in latestConfirmations"
              :key="person.id"
              class="checkin-confirmation-item"
            >
              <span class="checkin-avatar" aria-hidden="true">
                {{
                  person.nome
                    .split(' ')
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('')
                    .toUpperCase()
                }}
              </span>
              <div class="checkin-confirmation-person">
                <strong>{{ person.nome }}</strong>
                <small>{{ person.matricula }} · {{ institutionName(person.origem) }}</small>
                <small v-if="person.localTrabalhoDescricao" class="checkin-workplace"
                  >Local de trabalho: {{ person.localTrabalhoDescricao }}</small
                >
                <small
                  ><time :datetime="person.confirmadoEm">{{
                    formatConfirmation(person.confirmadoEm)
                  }}</time></small
                >
              </div>
              <span
                v-if="person.contemplado"
                class="checkin-locked"
                :aria-label="`${person.nome}, vencedor; presença mantida`"
              >
                <svg class="checkin-icon checkin-icon-small" aria-hidden="true">
                  <use href="#checkin-trophy" />
                </svg>
                Vencedor
              </span>
              <button
                v-else
                class="checkin-button checkin-button-danger checkin-button-small"
                type="button"
                :aria-label="`Desfazer presença de ${person.nome}`"
                :disabled="isSaving"
                @click="undoPresence(person)"
              >
                Desfazer
              </button>
            </article>
          </div>
          <div v-else class="checkin-empty">
            Nenhuma confirmação com horário registrado.
          </div>
        </section>

        <aside class="checkin-tip">
          <h2 class="checkin-panel-title">Dica de utilização</h2>
          <p class="checkin-panel-subtitle">
            Pesquise pelo nome ou matrícula e confira o nome, a matrícula e a instituição. Se houver
            mais de um resultado, selecione o registro correto antes de confirmar.
          </p>
        </aside>
      </div>
    </section>
  </div>
</template>
