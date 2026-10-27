<script setup>
import { computed, onMounted, ref } from 'vue'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import './CredenciamentoView.css'

const participants = ref([])
const indicatorData = ref({
  totalServidores: 0,
  servidoresPendentes: 0,
  presencasConfirmadas: 0,
  servidoresContemplados: 0,
})

const searchMode = ref('matricula')
const searchValue = ref('')
const searchResults = ref([])
const searchMessage = ref('')
const searchMessageType = ref('info')
const isSearching = ref(false)
const selectedServerId = ref(null)
const isSaving = ref(false)
const loading = ref(true)
const loadError = ref('')
const indicatorsError = ref('')
const indicatorsLoaded = ref(false)
const directorySearch = ref('')
const activeFilter = ref('all')
const currentPage = ref(1)
const pageSize = 50
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

const latestConfirmations = computed(() =>
  participants.value
    .filter((person) => person.presente)
    .sort(
      (first, second) =>
        new Date(second.confirmadoEm).getTime() - new Date(first.confirmadoEm).getTime(),
    )
    .slice(0, 8),
)

const filteredParticipants = computed(() => {
  const query = normalize(directorySearch.value.trim())

  return participants.value
    .filter((person) => {
      const status = participantStatus(person)
      const matchesFilter =
        activeFilter.value === 'all' ||
        status === activeFilter.value ||
        (activeFilter.value === 'confirmed' && status === 'winner')
      const searchableText = normalize(
        `${person.nome} ${person.matricula} ${institutionName(person.origem)}`,
      )

      return matchesFilter && (!query || searchableText.includes(query))
    })
    .sort((first, second) => first.nome.localeCompare(second.nome, 'pt-BR'))
})

const directoryResultsLabel = computed(() => {
  const total = filteredParticipants.value.length
  const noun = total === 1 ? 'servidor' : 'servidores'

  return `${total} ${noun} nesta página · ${totalRecords.value} no total`
})

async function requestApi(url, options) {
  let response
  try {
    response = await fetch(url, options)
  } catch {
    throw new Error('Não foi possível conectar à API. Verifique se o back-end está em execução.')
  }

  let data
  try {
    data = await response.json()
  } catch {
    if (!response.ok && response.status >= 500) {
      throw new Error('Não foi possível conectar à API. Verifique se o back-end está em execução.')
    }
    throw new Error('A API retornou uma resposta inválida.')
  }

  if (!response.ok) {
    const messages = {
      400: `Dados inválidos: ${data.erro || 'verifique os campos enviados.'}`,
      404: data.erro || 'O servidor ou credenciamento não foi encontrado.',
      409: data.erro || 'A operação não pode ser realizada devido ao estado atual do registro.',
      500: 'Ocorreu um erro interno na API. Tente novamente.',
    }
    throw new Error(
      messages[response.status] || data.erro || 'Não foi possível concluir a operação.',
    )
  }

  return data
}

function mapServer(server) {
  return {
    ...server,
    presente: Boolean(server.credenciado),
    contemplado: Boolean(server.contemplado),
  }
}

async function loadDirectory(page = currentPage.value) {
  loading.value = true
  loadError.value = ''

  try {
    const data = await requestApi(`/api/servidores?page=${page}&limit=${pageSize}`)
    participants.value = data.dados.map(mapServer)
    currentPage.value = data.paginacao.pagina
    totalPages.value = data.paginacao.paginas
    totalRecords.value = data.paginacao.total
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

async function loadIndicators() {
  indicatorsError.value = ''
  try {
    indicatorData.value = await requestApi('/api/credenciamentos/indicadores')
    indicatorsLoaded.value = true
  } catch (error) {
    indicatorsError.value = error.message
  }
}

async function refreshData(page = currentPage.value) {
  await Promise.all([loadDirectory(page), loadIndicators()])
}

async function changePage(page) {
  if (loading.value || page < 1 || page > totalPages.value) return
  directorySearch.value = ''
  await loadDirectory(page)
}

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

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

function clearSearch() {
  searchResults.value = []
  searchMessage.value = ''
  selectedServerId.value = null
}

function setSearchMode(mode) {
  if (mode !== 'matricula') return
  searchMode.value = mode
  searchValue.value = ''
  clearSearch()
}

async function searchParticipants() {
  if (isSearching.value) return
  const searchTerm = searchValue.value.trim()
  searchResults.value = []
  selectedServerId.value = null

  if (!searchTerm || !/^\d+$/.test(searchTerm)) {
    searchMessage.value = 'Informe uma matrícula contendo somente números.'
    searchMessageType.value = 'warning'
    return
  }

  isSearching.value = true
  try {
    const data = await requestApi(
      `/api/servidores?matricula=${encodeURIComponent(searchTerm)}&limit=100`,
    )
    searchResults.value = data.dados.map(mapServer)
    searchMessage.value = searchResults.value.length
      ? `${searchResults.value.length} servidor${searchResults.value.length === 1 ? '' : 'es'} encontrado${searchResults.value.length === 1 ? '' : 's'}. Confira a instituição e selecione o registro correto.`
      : 'Nenhum servidor encontrado para esta matrícula.'
    searchMessageType.value = searchResults.value.length ? 'info' : 'warning'
  } catch (error) {
    searchMessage.value = error.message
    searchMessageType.value = 'warning'
  } finally {
    isSearching.value = false
  }
}

function selectServer(person) {
  if (person.presente || person.contemplado || isSaving.value) return
  selectedServerId.value = person.id
}

function selectFilter(filter) {
  activeFilter.value = filter
}

async function confirmPresence(person) {
  if (
    isSaving.value ||
    selectedServerId.value !== person.id ||
    !searchResults.value.some((result) => result.id === person.id)
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

    await requestApi('/api/credenciamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servidorId: person.id, matricula: person.matricula }),
    })
    selectedServerId.value = null
    await Promise.all([refreshData(), searchParticipants()])
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
      await Promise.all([searchParticipants(), refreshData()])
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

    await requestApi(`/api/credenciamentos/${person.id}`, { method: 'DELETE' })
    await Promise.all([
      refreshData(),
      searchValue.value.trim() ? searchParticipants() : Promise.resolve(),
    ])
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
    if (searchValue.value.trim()) await searchParticipants()
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
      <div class="checkin-demo-tag">BASE OFICIAL · DADOS REAIS</div>
    </header>

    <section class="checkin-layout" aria-label="Credenciamento de servidores">
      <div class="checkin-search-column">
        <section class="checkin-panel checkin-panel-pad">
          <h2 class="checkin-panel-title">
            <svg class="checkin-icon" aria-hidden="true"><use href="#checkin-search" /></svg>
            Buscar servidor
          </h2>
          <p class="checkin-panel-subtitle">
            Pesquise na base de participantes e confirme a presença de quem chegou.
          </p>

          <div class="checkin-segment" role="group" aria-label="Tipo de documento">
            <button
              type="button"
              :class="{ active: searchMode === 'matricula' }"
              :aria-pressed="searchMode === 'matricula'"
              @click="setSearchMode('matricula')"
            >
              Matrícula
            </button>
            <button
              type="button"
              disabled
              aria-disabled="true"
              title="A base atual não possui CPF para consulta."
            >
              CPF
            </button>
          </div>

          <form class="checkin-search-form" @submit.prevent="searchParticipants">
            <label for="checkin-search-input">
              {{ searchMode === 'matricula' ? 'Matrícula do servidor' : 'CPF do servidor' }}
            </label>
            <div class="checkin-search-row">
              <input
                id="checkin-search-input"
                v-model="searchValue"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                maxlength="18"
                placeholder="Ex.: 001234"
                :disabled="isSearching || isSaving"
                aria-describedby="checkin-search-help"
                @input="clearSearch"
              />
              <button
                class="checkin-button checkin-button-primary"
                type="submit"
                :disabled="isSearching || isSaving"
              >
                <svg class="checkin-icon" aria-hidden="true"><use href="#checkin-search" /></svg>
                {{ isSearching ? 'Consultando…' : 'Consultar' }}
              </button>
            </div>
            <p id="checkin-search-help" class="checkin-field-note">
              A matrícula é consultada como texto, inclusive zeros à esquerda. A busca por CPF não
              está disponível.
            </p>
          </form>

          <p
            v-if="searchMessage"
            :class="['checkin-search-message', `checkin-search-message-${searchMessageType}`]"
            role="status"
            aria-live="polite"
          >
            {{ searchMessage }}
          </p>

          <div v-if="searchResults.length" class="checkin-results">
            <h3>Resultados da consulta</h3>
            <article
              v-for="person in searchResults"
              :key="person.id"
              class="checkin-person-card"
              :class="{ 'checkin-person-card-selected': selectedServerId === person.id }"
            >
              <div class="checkin-person-main">
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
                <div class="checkin-person-identity">
                  <h4>{{ person.nome }}</h4>
                  <p>{{ institutionName(person.origem) }}</p>
                </div>
              </div>
              <div class="checkin-person-details">
                <div>
                  <span>Matrícula</span><strong>{{ person.matricula }}</strong>
                </div>
                <span :class="['checkin-status', `checkin-status-${participantStatus(person)}`]">
                  <svg class="checkin-icon checkin-icon-small" aria-hidden="true">
                    <use
                      :href="`#checkin-${person.contemplado ? 'trophy' : person.presente ? 'check-circle' : 'clock'}`"
                    />
                  </svg>
                  {{
                    person.contemplado
                      ? 'Vencedor · presença mantida'
                      : person.presente
                        ? 'Presença confirmada'
                        : 'Aguardando presença'
                  }}
                </span>
              </div>
              <button
                v-if="!person.presente && !person.contemplado && selectedServerId !== person.id"
                class="checkin-button checkin-button-primary checkin-confirm-button"
                type="button"
                :disabled="isSaving"
                @click="selectServer(person)"
              >
                Selecionar servidor
              </button>
              <div v-else-if="selectedServerId === person.id" class="checkin-selected-actions">
                <span role="status">Servidor selecionado</span>
                <button
                  class="checkin-button checkin-button-primary checkin-confirm-button"
                  type="button"
                  :disabled="isSaving"
                  @click="confirmPresence(person)"
                >
                  <svg class="checkin-icon" aria-hidden="true"><use href="#checkin-check" /></svg>
                  {{ isSaving ? 'Aguarde…' : 'Confirmar presença' }}
                </button>
              </div>
            </article>
          </div>
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
        <section class="checkin-panel">
          <header class="checkin-panel-head">
            <div>
              <h2 class="checkin-panel-title">
                <svg class="checkin-icon" aria-hidden="true">
                  <use href="#checkin-check-circle" />
                </svg>
                Presenças nesta página
              </h2>
              <p class="checkin-panel-subtitle">
                Confirmações entre os servidores carregados nesta página.
              </p>
            </div>
            <span class="checkin-count">{{ latestConfirmations.length }} nesta página</span>
          </header>
          <div v-if="latestConfirmations.length" class="checkin-confirmation-list">
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
          <div v-else class="checkin-empty">Nenhuma presença confirmada.</div>
        </section>

        <aside class="checkin-panel checkin-tip">
          <h2 class="checkin-panel-title">Dica de utilização</h2>
          <p class="checkin-panel-subtitle">
            Consulte a matrícula <strong>001234</strong> para ver resultados da Prefeitura e da
            Câmara. Escolha a pessoa correta antes de confirmar.
          </p>
        </aside>
      </div>
    </section>

    <section class="checkin-panel checkin-directory" aria-labelledby="checkin-directory-title">
      <header class="checkin-directory-head">
        <div>
          <h2 id="checkin-directory-title" class="checkin-panel-title">
            <svg class="checkin-icon" aria-hidden="true"><use href="#checkin-id" /></svg>
            Servidores da base
          </h2>
          <p>
            Consulte os servidores desta página e acompanhe suas situações. Para confirmar presença,
            pesquise a matrícula acima; pela lista, é possível apenas desfazer uma presença.
          </p>
        </div>
        <span class="checkin-source">Base oficial</span>
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
            Buscar nesta página por nome, matrícula ou instituição</span
          >
          <input
            v-model="directorySearch"
            type="search"
            autocomplete="off"
            placeholder="Buscar nesta página por nome, matrícula ou instituição..."
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
      <div v-else-if="filteredParticipants.length" class="checkin-participant-list" role="list">
        <article
          v-for="person in filteredParticipants"
          :key="person.id"
          class="checkin-participant-row"
          role="listitem"
        >
          <div class="checkin-participant-identity">
            <div>
              <strong>{{ person.nome }}</strong>
              <span>{{ institutionName(person.origem) }}</span>
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
            <span v-else class="checkin-action-note">Confirmar pela busca</span>
          </div>
        </article>
      </div>
      <div v-else class="checkin-directory-empty" role="status">
        <strong>Nenhum servidor encontrado</strong>
        <span>
          {{
            directorySearch || activeFilter !== 'all'
              ? 'Tente outro termo, ajuste o filtro ou consulte outra página.'
              : 'Não há servidores nesta página.'
          }}
        </span>
      </div>

      <footer class="checkin-directory-footer">
        <span role="status" aria-live="polite">{{ directoryResultsLabel }}</span>
        <nav v-if="totalPages > 1" class="checkin-pagination" aria-label="Paginação dos servidores">
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
  </div>
</template>
