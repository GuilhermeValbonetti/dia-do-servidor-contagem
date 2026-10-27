<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import brasao from '../../assets/images/brasao-contagem.png'
import './TelaoView.css'

const route = useRoute()
const projectionSessionId = typeof route.query.session === 'string' ? route.query.session : null
const projectionChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('dia-do-servidor-telao') : null
const projectionScreen = ref(null)
const phase = ref('disconnected')
const ballNumber = ref('?')
const drawNumber = ref(1)
const winner = ref(null)
const lastWinner = ref(null)
const showConfetti = ref(false)
const confettiRound = ref(0)
const fullscreen = ref(false)
const statusMessage = ref('')
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
let confettiTimeout

const confettiPieces = Array.from({ length: 180 }, (_, index) => ({
  id: index,
  x: `${(index * 47) % 100}%`,
  delay: `${(index % 8) * 0.06}s`,
  duration: `${2.5 + (index % 6) * 0.2}s`,
  color: ['#f4c84c', '#6ed4a2', '#bca0f5', '#f38e9b'][index % 4],
  rotation: `${index * 19}deg`,
  drift: `${((index % 9) - 4) * 12}px`,
}))

function isValidDraw(draw) {
  return (
    draw &&
    typeof draw.nome === 'string' &&
    typeof draw.matricula === 'string' &&
    typeof draw.origem === 'string'
  )
}

function celebrate() {
  if (reducedMotion) return

  confettiRound.value += 1
  showConfetti.value = true
  window.clearTimeout(confettiTimeout)
  confettiTimeout = window.setTimeout(() => {
    showConfetti.value = false
  }, 5200)
}

function handleProjectionMessage({ data }) {
  if (
    data?.type !== 'state' ||
    data.sessionId !== projectionSessionId ||
    !['ready', 'drawing', 'winner', 'preparing'].includes(data.phase) ||
    (data.phase === 'winner' && !isValidDraw(data.draw))
  ) {
    return
  }

  const previousPhase = phase.value
  const previousDrawNumber = drawNumber.value
  phase.value = data.phase
  drawNumber.value = Number.isInteger(data.drawNumber) ? data.drawNumber : 1
  ballNumber.value = typeof data.ballNumber === 'string' ? data.ballNumber : '?'

  if (data.phase === 'winner') {
    winner.value = data.draw
    lastWinner.value = data.draw
    if (!data.snapshot && (previousPhase !== 'winner' || previousDrawNumber !== drawNumber.value)) {
      celebrate()
    }
  } else if (data.phase === 'preparing') {
    winner.value = null
    lastWinner.value = isValidDraw(data.lastDraw) ? data.lastDraw : null
  } else {
    winner.value = null
    lastWinner.value = null
  }
}

function requestSnapshot() {
  if (!projectionChannel || !projectionSessionId) return
  projectionChannel.postMessage({ type: 'snapshot-request', sessionId: projectionSessionId })
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      if (!projectionScreen.value?.requestFullscreen) {
        statusMessage.value = 'Tela cheia não é suportada por este navegador.'
        return
      }

      await projectionScreen.value.requestFullscreen()
    }
  } catch (error) {
    statusMessage.value = 'Não foi possível alterar o modo de tela cheia neste navegador.'
    console.error('Falha ao alterar o modo de tela cheia do Telão.', error)
  }
}

function updateFullscreenState() {
  fullscreen.value = document.fullscreenElement === projectionScreen.value
}

onMounted(() => {
  if (!projectionChannel) {
    statusMessage.value = 'A sincronização requer um navegador com suporte ao BroadcastChannel.'
  } else if (!projectionSessionId) {
    statusMessage.value = 'Abra o Telão pelo botão da tela Sorteio para sincronizar a apresentação.'
  } else {
    projectionChannel.addEventListener('message', handleProjectionMessage)
    requestSnapshot()
  }

  document.addEventListener('fullscreenchange', updateFullscreenState)
})

onBeforeUnmount(() => {
  projectionChannel?.close()
  document.removeEventListener('fullscreenchange', updateFullscreenState)
  window.clearTimeout(confettiTimeout)
})
</script>

<template>
  <section
    ref="projectionScreen"
    class="projection-screen"
    :class="`phase-${phase}`"
    aria-label="Apresentação do sorteio em telão"
  >
    <header class="projection-top">
      <div class="projection-identity">
        <span class="projection-logo">
          <img :src="brasao" alt="Brasão da Prefeitura Municipal de Contagem" />
        </span>
        <div>
          <strong>Dia do Servidor</strong>
          <small>Prefeitura Municipal de Contagem</small>
        </div>
      </div>
      <div class="projection-top-actions">
        <span class="projection-label">
          {{
            phase === 'ready'
              ? 'AGUARDANDO INÍCIO'
              : phase === 'drawing'
                ? 'SORTEIO EM ANDAMENTO'
                : phase === 'winner'
                  ? 'RESULTADO DIVULGADO'
                  : phase === 'preparing'
                    ? 'AGUARDANDO PRÓXIMO SORTEIO'
                    : 'CONECTANDO AO SORTEIO'
          }}
        </span>
        <button class="projection-fullscreen-button" type="button" @click="toggleFullscreen">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path
              d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"
            />
          </svg>
          {{ fullscreen ? 'Sair da tela cheia' : 'Tela cheia' }}
        </button>
      </div>
    </header>

    <section class="projection-scene" aria-live="polite" aria-atomic="true">
      <div class="projection-ball-zone" aria-hidden="true">
        <div class="projection-ring"></div>
        <div class="projection-ball">
          <span class="projection-ball-label">MATRÍCULA</span>
          <strong
            class="projection-ball-number"
            :style="{ '--number-length': Math.max(ballNumber.length, 1) }"
          >
            {{ ballNumber }}
          </strong>
          <span class="projection-ball-caption">
            {{ phase === 'winner' ? 'SORTEADO' : 'Nº DA SORTE' }}
          </span>
        </div>
      </div>

      <div class="projection-copy">
        <p class="projection-eyebrow">
          {{
            phase === 'drawing'
              ? 'SORTEIO EM ANDAMENTO'
              : phase === 'winner'
                ? 'TEMOS UM VENCEDOR!'
                : phase === 'ready'
                  ? 'DIA DO SERVIDOR · CONTAGEM'
                  : phase === 'preparing'
                    ? 'PRÓXIMA RODADA'
                    : 'APRESENTAÇÃO DO SORTEIO'
          }}
        </p>
        <p v-if="phase !== 'disconnected'" class="projection-draw-number">
          {{
            phase === 'ready'
              ? 'PRIMEIRO SORTEIO'
              : `SORTEIO Nº ${String(drawNumber).padStart(3, '0')}`
          }}
        </p>
        <h1 class="projection-headline">
          {{
            phase === 'drawing'
              ? 'Boa sorte a todos!'
              : phase === 'winner'
                ? winner?.nome
                : phase === 'ready'
                  ? 'Quem será o primeiro contemplado?'
                  : phase === 'preparing'
                    ? 'Preparando o próximo sorteio...'
                    : 'Aguardando conexão com a tela Sorteio'
          }}
        </h1>
        <p v-if="phase === 'winner' && winner" class="projection-subtitle">
          Matrícula {{ winner.matricula }} ·
          {{
            winner.origem === 'camara'
              ? 'Câmara Municipal de Contagem'
              : 'Prefeitura Municipal de Contagem'
          }}
        </p>
        <p v-else-if="phase === 'drawing'" class="projection-subtitle">
          O resultado será revelado em instantes.
        </p>
        <p v-else-if="phase === 'ready'" class="projection-subtitle">
          Prepare-se! Em instantes, conheceremos nosso primeiro contemplado.
        </p>
        <p v-else-if="phase === 'preparing'" class="projection-subtitle">
          A próxima rodada começará quando o operador estiver pronto.
        </p>
        <p v-else-if="phase === 'disconnected'" class="projection-subtitle">
          Abra o Telão pela tela Sorteio para iniciar a apresentação.
        </p>
        <p
          v-if="phase === 'preparing' && lastWinner"
          class="projection-last-winner"
          aria-label="Último contemplado"
        >
          Último contemplado: <strong>{{ lastWinner.nome }}</strong> · Sorteio nº
          {{ String(lastWinner.numero).padStart(3, '0') }}
        </p>
        <div v-if="phase === 'winner' && winner?.premioNome" class="projection-prize">
          <span aria-hidden="true">🎁</span>
          {{ winner.premioNome }}
        </div>
        <button
          v-if="phase === 'winner' && winner"
          class="projection-celebrate-button"
          type="button"
          @click="celebrate"
        >
          <span aria-hidden="true">✦</span>
          Comemorar novamente
        </button>
      </div>
    </section>

    <footer class="projection-footer">
      <span><strong>Dia do Servidor</strong> · Contagem</span>
      <span class="projection-stars" aria-hidden="true">✦ ✦ ✦</span>
      <span>Uma celebração para quem faz a cidade acontecer</span>
    </footer>
    <p v-if="statusMessage" class="projection-status" role="status">{{ statusMessage }}</p>

    <div v-if="showConfetti" :key="confettiRound" class="projection-confetti" aria-hidden="true">
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
  </section>
</template>
