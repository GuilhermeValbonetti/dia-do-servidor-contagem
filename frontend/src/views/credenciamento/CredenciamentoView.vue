<script setup>
import { computed, ref } from 'vue'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import './CredenciamentoView.css'

// Matrículas podem se repetir entre instituições; o ID identifica cada participante.
const participants = ref([
  {
    id: 1,
    nome: 'Ana Martins',
    matricula: '001234',
    origem: 'prefeitura',
    cpf: '90000000001',
    presente: false,
    contemplado: false,
    confirmadaEm: null,
  },
  {
    id: 2,
    nome: 'Bruno Almeida',
    matricula: '001234',
    origem: 'camara',
    cpf: '90000000002',
    presente: false,
    contemplado: false,
    confirmadaEm: null,
  },
  {
    id: 3,
    nome: 'Camila Rocha',
    matricula: '001003',
    origem: 'prefeitura',
    cpf: '90000000003',
    presente: true,
    contemplado: false,
    confirmadaEm: Date.now() - 240000,
  },
  {
    id: 4,
    nome: 'Diego Santos',
    matricula: '001004',
    origem: 'camara',
    cpf: '90000000004',
    presente: true,
    contemplado: false,
    confirmadaEm: Date.now() - 180000,
  },
  {
    id: 5,
    nome: 'Elisa Ferreira',
    matricula: '001005',
    origem: 'prefeitura',
    cpf: '90000000005',
    presente: true,
    contemplado: true,
    confirmadaEm: Date.now() - 120000,
  },
  {
    id: 6,
    nome: 'Felipe Costa',
    matricula: '001006',
    origem: 'camara',
    cpf: '90000000006',
    presente: true,
    contemplado: false,
    confirmadaEm: Date.now() - 60000,
  },
  {
    id: 7,
    nome: 'Gabriela Nunes',
    matricula: '001007',
    origem: 'prefeitura',
    cpf: '90000000007',
    presente: false,
    contemplado: false,
    confirmadaEm: null,
  },
  {
    id: 8,
    nome: 'Heitor Lima',
    matricula: '001008',
    origem: 'camara',
    cpf: '90000000008',
    presente: false,
    contemplado: false,
    confirmadaEm: null,
  },
  {
    id: 9,
    nome: 'Isabela Duarte',
    matricula: '001009',
    origem: 'prefeitura',
    cpf: '90000000009',
    presente: false,
    contemplado: false,
    confirmadaEm: null,
  },
  {
    id: 10,
    nome: 'João Ribeiro',
    matricula: '001010',
    origem: 'camara',
    cpf: '90000000010',
    presente: false,
    contemplado: false,
    confirmadaEm: null,
  },
  {
    id: 11,
    nome: 'Lara Mendes',
    matricula: '001011',
    origem: 'prefeitura',
    cpf: '90000000011',
    presente: false,
    contemplado: false,
    confirmadaEm: null,
  },
  {
    id: 12,
    nome: 'Miguel Barros',
    matricula: '001012',
    origem: 'camara',
    cpf: '90000000012',
    presente: false,
    contemplado: false,
    confirmadaEm: null,
  },
])

const searchMode = ref('matricula')
const searchValue = ref('')
const searchResults = ref([])
const searchMessage = ref('')
const searchMessageType = ref('info')
const directorySearch = ref('')
const activeFilter = ref('all')

const filters = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'winner', label: 'Vencedores' },
]

const indicators = computed(() => [
  { label: 'Servidores na base', value: participants.value.length, tone: 'total' },
  {
    label: 'Pendentes de presença',
    value: participants.value.filter((person) => !person.presente).length,
    tone: 'pending',
  },
  {
    label: 'Presenças confirmadas',
    value: participants.value.filter((person) => person.presente).length,
    tone: 'present',
  },
  {
    label: 'Já contemplados',
    value: participants.value.filter((person) => person.contemplado).length,
    tone: 'winners',
  },
])

const latestConfirmations = computed(() =>
  participants.value
    .filter((person) => person.presente)
    .sort((first, second) => second.confirmadaEm - first.confirmadaEm)
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

  return directorySearch.value || activeFilter.value !== 'all'
    ? `${total} ${noun} ${total === 1 ? 'encontrado' : 'encontrados'}`
    : `${total} ${noun} na base`
})

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
}

function setSearchMode(mode) {
  searchMode.value = mode
  searchValue.value = ''
  clearSearch()
}

function searchParticipants() {
  const searchTerm =
    searchMode.value === 'cpf' ? searchValue.value.replace(/\D/g, '') : searchValue.value.trim()
  searchResults.value = []

  if (!searchTerm || (searchMode.value === 'cpf' && searchTerm.length !== 11)) {
    searchMessage.value =
      searchMode.value === 'cpf'
        ? 'Informe um CPF com 11 dígitos para consultar.'
        : 'Informe a matrícula para consultar.'
    searchMessageType.value = 'warning'
    return
  }

  searchResults.value = participants.value.filter((person) =>
    searchMode.value === 'cpf' ? person.cpf === searchTerm : person.matricula === searchTerm,
  )
  searchMessage.value = searchResults.value.length
    ? `${searchResults.value.length} servidor${searchResults.value.length === 1 ? '' : 'es'} encontrado${searchResults.value.length === 1 ? '' : 's'}. Confira a instituição antes de confirmar.`
    : 'Nenhum servidor encontrado. Confira o documento e tente novamente.'
  searchMessageType.value = searchResults.value.length ? 'info' : 'warning'
}

function searchExample(value) {
  searchMode.value = 'matricula'
  searchValue.value = value
  searchParticipants()
}

function selectFilter(filter) {
  activeFilter.value = filter
}

async function confirmPresence(person) {
  if (!searchResults.value.some((result) => result.id === person.id)) return
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

  person.presente = true
  person.confirmadaEm = Date.now()
  await Swal.fire({
    icon: 'success',
    title: 'Presença confirmada',
    text: `${person.nome} · ${institutionName(person.origem)}`,
    confirmButtonText: 'Concluir',
    confirmButtonColor: '#0868af',
  })
}

async function undoPresence(person) {
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

  person.presente = false
  person.confirmadaEm = null
  await Swal.fire({
    icon: 'success',
    title: 'Presença desfeita',
    text: `A presença de ${person.nome} foi desfeita.`,
    confirmButtonText: 'Concluir',
    confirmButtonColor: '#0868af',
  })
}
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
      <div class="checkin-demo-tag">BASE FICTÍCIA · DEMONSTRAÇÃO</div>
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
              :class="{ active: searchMode === 'cpf' }"
              :aria-pressed="searchMode === 'cpf'"
              @click="setSearchMode('cpf')"
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
                :maxlength="searchMode === 'cpf' ? 14 : 18"
                :placeholder="searchMode === 'matricula' ? 'Ex.: 001234' : 'Ex.: 900.000.000-01'"
                aria-describedby="checkin-search-help"
                @input="clearSearch"
              />
              <button class="checkin-button checkin-button-primary" type="submit">
                <svg class="checkin-icon" aria-hidden="true"><use href="#checkin-search" /></svg>
                Consultar
              </button>
            </div>
            <p id="checkin-search-help" class="checkin-field-note">
              {{
                searchMode === 'matricula'
                  ? 'A matrícula é consultada como texto, inclusive zeros à esquerda.'
                  : 'Digite os 11 dígitos do CPF fictício.'
              }}
            </p>
          </form>

          <div class="checkin-quick-search">
            <span>Teste rápido:</span>
            <button
              class="checkin-button checkin-button-secondary checkin-button-small"
              type="button"
              @click="searchExample('001234')"
            >
              Matrícula duplicada
            </button>
            <button
              class="checkin-button checkin-button-secondary checkin-button-small"
              type="button"
              @click="searchExample('001007')"
            >
              Servidor pendente
            </button>
          </div>

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
            <article v-for="person in searchResults" :key="person.id" class="checkin-person-card">
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
                <div>
                  <span>CPF</span><strong>***.***.***-{{ person.cpf.slice(-2) }}</strong>
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
                v-if="!person.presente && !person.contemplado"
                class="checkin-button checkin-button-primary checkin-confirm-button"
                type="button"
                @click="confirmPresence(person)"
              >
                <svg class="checkin-icon" aria-hidden="true"><use href="#checkin-check" /></svg>
                Confirmar presença
              </button>
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
                Últimas confirmações
              </h2>
              <p class="checkin-panel-subtitle">Acompanhe a entrada dos participantes.</p>
            </div>
            <span class="checkin-count">{{ latestConfirmations.length }} no local</span>
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
            Consulte os servidores e acompanhe suas situações. Para confirmar presença, use a busca
            individual acima; pela lista, é possível apenas desfazer uma presença.
          </p>
        </div>
        <span class="checkin-source">Base fictícia · demonstração</span>
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

      <div class="checkin-directory-tools">
        <label class="checkin-directory-search">
          <svg class="checkin-icon" aria-hidden="true"><use href="#checkin-search" /></svg>
          <span class="checkin-sr-only">Buscar na lista por nome, matrícula ou instituição</span>
          <input
            v-model="directorySearch"
            type="search"
            autocomplete="off"
            placeholder="Buscar por nome, matrícula ou instituição..."
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

      <div v-if="filteredParticipants.length" class="checkin-participant-list" role="list">
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
        <span>Tente outro termo ou altere o filtro.</span>
      </div>

      <footer class="checkin-directory-footer">
        <span role="status" aria-live="polite">{{ directoryResultsLabel }}</span>
      </footer>
    </section>
  </div>
</template>
