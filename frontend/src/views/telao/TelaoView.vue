<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { requestDrawApi } from '../../services/sorteios'
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
const connectionLost = ref(false)
const sessionEnded = ref(false)
const suppressEntrance = ref(false)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
let confettiTimeout
let connectionCheckInterval
let lastOperatorMessageAt = 0
let messageRevision = 0
let viewActive = true
let digitsFrame = null
let awaitingApiSync = false
let winnerVisibleTimeout
let preparationRequestTimeout
let acknowledgedWinnerId = null
const verifiedDraws = new Map()

const connectionTimeout = 70000
let disconnectDeadline = null
const connectionCheckFrequency = 1000

const confettiPieces = ref([])

function createConfetti() {
  // Amostras independentes evitam correlação entre posição, início e velocidade.
  // Aleatoriedade apenas visual; não participa da escolha dos vencedores.
  return Array.from({ length: 132 }, (_, id) => ({
    id,
    x: `${Math.random() * 100}%`,
    delay: `${Math.random() * 3900}ms`,
    duration: `${2880 + Math.random() * 720}ms`,
    color: ['#f4c84c', '#6ed4a2', '#bca0f5', '#f38e9b'][Math.floor(Math.random() * 4)],
    rotation: `${Math.random() * 360}deg`,
    spin: `${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 240)}deg`,
    sway: `${(Math.random() - 0.5) * 56}px`,
    drift: `${(Math.random() - 0.5) * 140}px`,
  }))
}

function isValidDraw(draw) {
  return (
    draw &&
    Number.isSafeInteger(draw.id) &&
    draw.id > 0 &&
    typeof draw.nome === 'string' &&
    typeof draw.matricula === 'string' &&
    typeof draw.origem === 'string'
  )
}

function celebrate() {
  if (reducedMotion) return

  confettiPieces.value = createConfetti()
  const confettiLifetime =
    Math.max(
      ...confettiPieces.value.map((piece) => parseFloat(piece.delay) + parseFloat(piece.duration)),
    ) + 150
  confettiRound.value += 1
  showConfetti.value = true
  window.clearTimeout(confettiTimeout)
  confettiTimeout = window.setTimeout(() => {
    showConfetti.value = false
  }, confettiLifetime)
}

function stopDigits() {
  if (digitsFrame !== null) window.cancelAnimationFrame(digitsFrame)
  digitsFrame = null
}

function startDigits() {
  stopDigits()
  if (reducedMotion) return
  const start = performance.now()
  let lastStep = -1
  const update = (now) => {
    if (!viewActive || phase.value !== 'drawing') return
    const step = Math.floor((now - start) / 50)
    if (step !== lastStep) {
      lastStep = step
      // Efeito local de apresentação: nunca seleciona participantes nem chama a API.
      ballNumber.value = [1, 3, 7, 9, 3, 7]
        .map((factor, position) => (step * factor + position * 2) % 10)
        .join('')
    }
    digitsFrame = window.requestAnimationFrame(update)
  }
  digitsFrame = window.requestAnimationFrame(update)
}

async function handleProjectionMessage({ data }) {
  if (sessionEnded.value || data?.sessionId !== projectionSessionId) return

  if (data.type === 'heartbeat') {
    const wasDisconnected = connectionLost.value
    lastOperatorMessageAt = Date.now()
    connectionLost.value = false
    disconnectDeadline = null
    if (wasDisconnected || awaitingApiSync) requestSnapshot()
    return
  }

  if (data.type === 'operator-disconnected') {
    markConnectionLost()
    disconnectDeadline = Date.now() + 3000
    return
  }

  if (
    data?.type !== 'state' ||
    !['ready', 'drawing', 'winner', 'preparing'].includes(data.phase) ||
    (data.phase === 'winner' && !isValidDraw(data.draw))
  ) {
    return
  }

  lastOperatorMessageAt = Date.now()
  connectionLost.value = false
  disconnectDeadline = null
  if (
    data.phase === 'drawing' &&
    phase.value === 'drawing' &&
    data.drawNumber === drawNumber.value
  ) {
    if (
      reducedMotion &&
      typeof data.ballNumber === 'string' &&
      data.ballNumber !== ballNumber.value
    ) {
      ballNumber.value = data.ballNumber
    }
    return
  }
  const revision = ++messageRevision
  window.clearTimeout(winnerVisibleTimeout)
  if (data.phase !== 'winner') window.clearTimeout(preparationRequestTimeout)
  const candidate =
    data.phase === 'winner' ? data.draw : data.phase === 'preparing' ? data.lastDraw : null
  let confirmedDraw = null
  if (candidate) {
    if (!isValidDraw(candidate)) return
    try {
      confirmedDraw =
        verifiedDraws.get(candidate.id) ?? (await requestDrawApi(`/api/sorteios/${candidate.id}`))
      if (!viewActive || revision !== messageRevision) return
      verifiedDraws.set(confirmedDraw.id, confirmedDraw)
      awaitingApiSync = false
      statusMessage.value = ''
    } catch {
      if (viewActive && revision === messageRevision) {
        awaitingApiSync = true
        stopDigits()
        phase.value = 'disconnected'
        winner.value = null
        showConfetti.value = false
        statusMessage.value =
          'Não foi possível confirmar o resultado na API. Aguardando nova sincronização.'
      }
      return
    }
  }
  const previousPhase = phase.value
  const previousDrawNumber = drawNumber.value
  phase.value = data.phase
  drawNumber.value = Number.isInteger(data.drawNumber) ? data.drawNumber : 1
  ballNumber.value = typeof data.ballNumber === 'string' ? data.ballNumber : '?'
  if (data.phase === 'drawing') startDigits()
  else stopDigits()

  if (data.phase === 'winner') {
    suppressEntrance.value =
      Boolean(data.snapshot) ||
      (previousPhase === 'winner' && previousDrawNumber === confirmedDraw.numero)
    winner.value = confirmedDraw
    lastWinner.value = confirmedDraw
    drawNumber.value = confirmedDraw.numero
    ballNumber.value = confirmedDraw.matricula
    if (acknowledgedWinnerId !== confirmedDraw.id) {
      const id = confirmedDraw.id
      await nextTick()
      winnerVisibleTimeout = window.setTimeout(
        () => {
          if (!viewActive || phase.value !== 'winner' || winner.value?.id !== id) return
          acknowledgedWinnerId = id
          projectionChannel?.postMessage({
            type: 'winner-visible',
            sessionId: projectionSessionId,
            drawId: id,
          })
          // O Telão pede a transição caso os timers do operador estejam limitados.
          preparationRequestTimeout = window.setTimeout(() => {
            if (viewActive && phase.value === 'winner' && winner.value?.id === id) {
              projectionChannel?.postMessage({
                type: 'prepare-request',
                sessionId: projectionSessionId,
                drawId: id,
              })
            }
          }, 10000)
        },
        suppressEntrance.value || reducedMotion ? 0 : 800,
      )
    }
    if (!data.snapshot && (previousPhase !== 'winner' || previousDrawNumber !== drawNumber.value)) {
      celebrate()
    }
  } else if (data.phase === 'preparing') {
    winner.value = null
    lastWinner.value = confirmedDraw
  } else if (data.phase === 'ready') {
    winner.value = null
    lastWinner.value = null
  } else {
    winner.value = null
  }
}

function endOperatorSession() {
  if (sessionEnded.value) return
  markConnectionLost()
  sessionEnded.value = true
  messageRevision += 1
  lastWinner.value = null
  statusMessage.value = 'A conexão com o operador foi encerrada. Você pode fechar esta janela.'
  window.clearInterval(connectionCheckInterval)
  projectionChannel?.close()
  try {
    window.close()
  } catch {
    // O aviso permanece visível quando o navegador impede o fechamento.
  }
}

function checkOperatorConnection() {
  if (sessionEnded.value) return
  // Uma janela viva pode ter seus timers suspensos. Silêncio não prova encerramento.
  if (window.opener?.closed && disconnectDeadline === null) {
    markConnectionLost()
    disconnectDeadline = Date.now() + 3000
  }
  const silence = Date.now() - lastOperatorMessageAt
  if (disconnectDeadline !== null && Date.now() >= disconnectDeadline) {
    endOperatorSession()
  } else if (silence >= connectionTimeout) {
    if (!window.opener || window.opener.closed) markConnectionLost()
    requestSnapshot()
  }
}

function markConnectionLost() {
  if (connectionLost.value) return
  connectionLost.value = true
  stopDigits()
  messageRevision += 1
  phase.value = 'disconnected'
  winner.value = null
  ballNumber.value = '?'
  window.clearTimeout(confettiTimeout)
  window.clearTimeout(winnerVisibleTimeout)
  window.clearTimeout(preparationRequestTimeout)
  showConfetti.value = false
  recoverLastDraw()
}

async function recoverLastDraw() {
  const revision = messageRevision
  try {
    const history = await requestDrawApi('/api/sorteios?limit=1')
    if (
      viewActive &&
      !sessionEnded.value &&
      revision === messageRevision &&
      phase.value === 'disconnected'
    ) {
      lastWinner.value = history.dados[0] ?? null
    }
  } catch {
    if (viewActive && !sessionEnded.value && revision === messageRevision)
      statusMessage.value = 'Não foi possível recuperar o último sorteio na API.'
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
  recoverLastDraw()
  if (!projectionChannel) {
    statusMessage.value = 'A sincronização requer um navegador com suporte ao BroadcastChannel.'
  } else if (!projectionSessionId) {
    statusMessage.value = 'Abra o Telão pelo botão da tela Sorteio para sincronizar a apresentação.'
  } else {
    projectionChannel.addEventListener('message', handleProjectionMessage)
    lastOperatorMessageAt = Date.now()
    requestSnapshot()
    connectionCheckInterval = window.setInterval(checkOperatorConnection, connectionCheckFrequency)
  }

  document.addEventListener('fullscreenchange', updateFullscreenState)
})

onBeforeUnmount(() => {
  window.clearTimeout(preparationRequestTimeout)
  window.clearTimeout(winnerVisibleTimeout)
  viewActive = false
  stopDigits()
  messageRevision += 1
  window.clearInterval(connectionCheckInterval)
  projectionChannel?.close()
  document.removeEventListener('fullscreenchange', updateFullscreenState)
  window.clearTimeout(confettiTimeout)
})
</script>

<template>
  <section v-if="sessionEnded" class="projection-screen phase-disconnected" role="status">
    <h1>Conexão com o operador encerrada</h1>
    <p>{{ statusMessage }}</p>
  </section>
  <section
    v-else
    ref="projectionScreen"
    class="projection-screen"
    :class="[`phase-${phase}`, { 'is-snapshot': suppressEntrance }]"
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
            connectionLost
              ? 'COMUNICAÇÃO INTERROMPIDA'
              : phase === 'ready'
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
        <span v-if="connectionLost" class="projection-connection-warning" role="status">
          Aguardando reconexão do operador
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

    <section class="projection-scene">
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
        <p v-if="phase === 'winner' && winner?.localTrabalhoDescricao" class="projection-workplace">
          Local de trabalho: {{ winner.localTrabalhoDescricao }}
        </p>
        <p v-if="phase === 'drawing'" class="projection-subtitle">
          O resultado será revelado em instantes.
        </p>
        <p v-else-if="phase === 'ready'" class="projection-subtitle">
          Prepare-se! Em instantes, conheceremos nosso primeiro contemplado.
        </p>
        <p v-else-if="phase === 'preparing'" class="projection-subtitle">
          A próxima rodada começará quando o operador estiver pronto.
        </p>
        <p v-else-if="phase === 'disconnected'" class="projection-subtitle">
          {{
            connectionLost
              ? 'A apresentação será retomada quando a tela Sorteio se reconectar.'
              : 'Abra o Telão pela tela Sorteio para iniciar a apresentação.'
          }}
        </p>
        <p
          v-if="(phase === 'preparing' || phase === 'disconnected') && lastWinner"
          class="projection-last-winner"
          aria-label="Último resultado recebido"
        >
          {{ phase === 'disconnected' ? 'Último resultado recebido:' : 'Último contemplado:' }}
          <strong>{{ lastWinner.nome }}</strong>
          · Matrícula {{ lastWinner.matricula }} · Sorteio nº
          {{ String(lastWinner.numero).padStart(3, '0') }}
        </p>
        <div v-if="phase === 'winner' && winner?.premioNome" class="projection-prize">
          <span aria-hidden="true">🎁</span>
          {{ winner.premioNome }}
        </div>
      </div>
    </section>
    <p class="projection-sr-only" aria-live="polite" aria-atomic="true">
      {{
        phase === 'winner' && winner
          ? `Resultado do sorteio ${String(drawNumber).padStart(3, '0')}: ${winner.nome}, matrícula ${winner.matricula}, ${winner.origem === 'camara' ? 'Câmara Municipal de Contagem' : 'Prefeitura Municipal de Contagem'}${winner.premioNome ? `, prêmio: ${winner.premioNome}` : ', sem prêmio associado'}.`
          : ''
      }}
    </p>

    <footer class="projection-footer">
      <span><strong>Dia do Servidor</strong> · Contagem</span>
      <span class="projection-stars" aria-hidden="true">✦ ✦ ✦</span>
      <span>Uma celebração para quem faz a cidade acontecer</span>
    </footer>
    <p v-if="statusMessage" class="projection-status" role="status">{{ statusMessage }}</p>

    <div
      v-if="showConfetti"
      :key="confettiRound"
      v-memo="[confettiRound]"
      class="projection-confetti"
      aria-hidden="true"
    >
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
          '--confetti-sway': piece.sway,
          '--confetti-spin': piece.spin,
        }"
      ></span>
    </div>
  </section>
</template>
