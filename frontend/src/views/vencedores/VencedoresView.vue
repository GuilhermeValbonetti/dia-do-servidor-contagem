<script setup>
import { nextTick, ref } from 'vue'
import './VencedoresView.css'

const winners = [
  {
    participantId: 'camara-000123',
    drawNumber: 2,
    nome: 'Bruno Lopes',
    matricula: '000123',
    origem: 'camara',
    drawnAt: '2026-10-25T15:30:00-03:00',
    premio: '',
  },
  {
    participantId: 'prefeitura-000124',
    drawNumber: 1,
    nome: 'Carolina Duarte',
    matricula: '000124',
    origem: 'prefeitura',
    drawnAt: '2026-10-22T14:15:00-03:00',
    premio: 'Vale-presente de R$ 200',
  },
]

const orderedWinners = [...winners].sort(
  (first, second) => new Date(second.drawnAt) - new Date(first.drawnAt),
)
const celebrationDialog = ref(null)
const celebrationWinners = ref([])
const confettiPieces = ref([])
const celebrationRound = ref(0)
let confettiTimeout

function institutionName(origin) {
  return origin === 'camara' ? 'Câmara Municipal de Contagem' : 'Prefeitura Municipal de Contagem'
}

function formatDrawnAt(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
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
  celebrationWinners.value = selectedWinners
  celebrationRound.value += 1
  window.clearTimeout(confettiTimeout)
  confettiPieces.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? []
    : createConfetti()

  await nextTick()
  if (!celebrationDialog.value?.open) celebrationDialog.value?.showModal()

  confettiTimeout = window.setTimeout(() => {
    confettiPieces.value = []
  }, 5200)
}

function closeCelebration() {
  celebrationDialog.value?.close()
}

function clearCelebration() {
  window.clearTimeout(confettiTimeout)
  confettiPieces.value = []
  celebrationWinners.value = []
}
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
      <span class="winners-demo-tag">DADOS DEMONSTRATIVOS</span>
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
          <span class="winners-count">
            {{ orderedWinners.length }}
            {{ orderedWinners.length === 1 ? 'resultado' : 'resultados' }}
          </span>
        </div>
        <button
          v-if="orderedWinners.length"
          class="winners-celebrate-all"
          type="button"
          @click="celebrate(orderedWinners)"
        >
          <svg class="winners-icon winners-icon-small" aria-hidden="true">
            <use href="#winners-sparkles" />
          </svg>
          Celebrar todos
        </button>
      </header>

      <div v-if="orderedWinners.length" class="winners-list">
        <article v-for="winner in orderedWinners" :key="winner.participantId" class="winner-card">
          <div class="winner-card-top">
            <span class="winner-sequence">
              SORTEIO #{{ String(winner.drawNumber).padStart(3, '0') }}
            </span>
            <span class="winner-time">
              <svg class="winners-icon winners-icon-small" aria-hidden="true">
                <use href="#winners-calendar" />
              </svg>
              {{ formatDrawnAt(winner.drawnAt) }}
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
    aria-describedby="celebration-description"
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

      <template v-if="celebrationWinners.length === 1">
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
          <article
            v-for="winner in celebrationWinners"
            :key="winner.participantId"
            class="celebration-card"
          >
            <small>SORTEIO #{{ String(winner.drawNumber).padStart(3, '0') }}</small>
            <strong>{{ winner.nome }}</strong>
            <span>
              {{ winner.premio ? `Prêmio: ${winner.premio}` : 'Sorteio sem prêmio associado' }}
            </span>
          </article>
        </div>
      </template>

      <p v-if="celebrationWinners.length === 1" class="celebration-copy">
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
