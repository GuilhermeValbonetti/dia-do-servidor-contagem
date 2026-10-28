<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import {
  requestDrawApi,
  readPendingDraw,
  clearPendingDraw,
  pendingDrawKey,
} from '../../services/sorteios'
import { RouterLink, useRouter } from 'vue-router'
import './SorteioView.css'

const router = useRouter()
const projectionSupported = typeof BroadcastChannel !== 'undefined'
const projectionSessionId = crypto.randomUUID()
const projectionUrl = router.resolve({
  name: 'telao',
  query: { session: projectionSessionId },
}).href
const projectionLinkVisible = ref(false)
const projectionChannel = projectionSupported ? new BroadcastChannel('dia-do-servidor-telao') : null
let projectionChannelActive = true
let projectionWindow = null
let projectionHeartbeatInterval

function sendProjectionHeartbeat() {
  if (!projectionChannel || !projectionChannelActive) return
  projectionChannel.postMessage({
    type: 'heartbeat',
    sessionId: projectionSessionId,
  })
}

function announceProjectionDisconnect() {
  if (!projectionChannel || !projectionChannelActive) return
  projectionChannel.postMessage({
    type: 'operator-disconnected',
    sessionId: projectionSessionId,
  })
}

const prizes = ref([])
const indicatorData = ref({
  presencasConfirmadas: 0,
  servidoresContemplados: 0,
  elegiveis: 0,
  proximoNumero: 1,
})
const loading = ref(true)
const loadError = ref('')
const pendingOperation = ref(null)
let viewActive = true
let activeDrawNumber = null
const draws = ref([])
const selectedPrizeId = ref('')
const drawing = ref(false)
const confirming = ref(false)
let spaceHeld = false
let drawConfirmationOpen = false
let drawConfirmationSubmitted = false

function releaseDrawShortcut(event) {
  if (event.code === 'Space' || event.key === ' ') {
    spaceHeld = false
    if (drawConfirmationOpen) event.preventDefault?.()
  }
}
const projectionPhase = ref('ready')
const ballNumber = ref('?')
const showConfetti = ref(false)
const confettiRound = ref(0)
const celebrationDialog = ref(null)
const celebrationDraws = ref([])
const showCelebrationConfetti = ref(false)
const celebrationRound = ref(0)
let confettiTimeout
let celebrationTimeout
let animationFrame = null
let animationDeadline
let finishAnimation = null

const canUseDrawShortcut = computed(
  () =>
    Boolean(canStartDraw.value) &&
    eligibleCount.value > 0 &&
    !pendingOperation.value &&
    !drawing.value &&
    !confirming.value &&
    ['ready', 'preparing'].includes(projectionPhase.value),
)

function handleDrawShortcut(event) {
  if ((event.code === 'Space' || event.key === ' ') && drawConfirmationOpen && event.repeat) {
    event.preventDefault()
    event.stopImmediatePropagation?.()
    return
  }
  if (
    (event.code !== 'Space' && event.key !== ' ') ||
    event.repeat ||
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !viewActive
  )
    return
  if (drawConfirmationOpen) {
    event.preventDefault()
    event.stopImmediatePropagation?.()
    if (spaceHeld || drawConfirmationSubmitted) return
    spaceHeld = true
    drawConfirmationSubmitted = true
    Swal.clickConfirm()
    return
  }
  if (
    spaceHeld ||
    !canUseDrawShortcut.value ||
    Swal.isVisible() ||
    document.querySelector('dialog[open], [aria-modal="true"]')
  )
    return
  const interactive =
    'input, select, textarea, button, a, summary, [contenteditable]:not([contenteditable="false"]), [role], [tabindex]'
  if (
    [event.target, document.activeElement].some(
      (element) => element?.isContentEditable || element?.closest?.(interactive),
    )
  )
    return
  event.preventDefault()
  spaceHeld = true
  void confirmDraw()
}

function sendProjectionState(snapshot = false) {
  if (!projectionChannel || !projectionChannelActive) return

  const phase = projectionPhase.value
  const draw = phase === 'winner' || phase === 'preparing' ? latestDraw.value : null
  const projectionDraw = draw
    ? {
        id: draw.id,
        sorteadoEm: draw.sorteadoEm,
        numero: draw.numero,
        participanteId: draw.participanteId,
        nome: draw.nome,
        matricula: draw.matricula,
        origem: draw.origem,
        localTrabalhoCodigo: draw.localTrabalhoCodigo ?? null,
        localTrabalhoDescricao: draw.localTrabalhoDescricao ?? null,
        premioId: draw.premioId,
        premioNome: draw.premioNome,
      }
    : null
  projectionChannel.postMessage({
    type: 'state',
    sessionId: projectionSessionId,
    phase,
    snapshot,
    drawNumber:
      phase === 'drawing' || phase === 'preparing'
        ? (activeDrawNumber ?? nextDrawNumber.value)
        : (latestDraw.value?.numero ?? nextDrawNumber.value),
    ballNumber:
      phase === 'drawing'
        ? ballNumber.value
        : phase === 'winner'
          ? latestDraw.value.matricula
          : '?',
    ...(phase === 'winner' ? { draw: projectionDraw } : {}),
    ...(phase === 'preparing' ? { lastDraw: projectionDraw } : {}),
  })
}

function openProjection() {
  if (projectionWindow && !projectionWindow.closed) {
    projectionWindow.focus()
    return
  }

  projectionWindow = window.open(projectionUrl, `dia-do-servidor-telao-${projectionSessionId}`)
  projectionLinkVisible.value = !projectionWindow
}

if (projectionChannel) {
  projectionChannel.onmessage = ({ data }) => {
    if (data?.type === 'snapshot-request' && data.sessionId === projectionSessionId) {
      sendProjectionState(true)
    }
  }
}

const eligibleCount = computed(() => indicatorData.value.elegiveis)
const presentCount = computed(() => indicatorData.value.presencasConfirmadas)
const winnerCount = computed(() => indicatorData.value.servidoresContemplados)
const availablePrizes = computed(() => prizes.value.filter((prize) => !prize.utilizado))
const nextDrawNumber = computed(() => indicatorData.value.proximoNumero)
const latestDraw = computed(() => draws.value.at(-1))
const canStartDraw = computed(
  () =>
    !loading.value &&
    !loadError.value &&
    (pendingOperation.value ||
      (eligibleCount.value > 0 && (!latestDraw.value || projectionPhase.value === 'preparing'))),
)
const confettiPieces = Array.from({ length: 300 }, (_, index) => ({
  id: index,
  x: `${(index * 47) % 100}%`,
  delay: `${(index % 7) * 0.07}s`,
  duration: `${2 + (index % 6) * 0.18}s`,
  color: ['#f4c84c', '#6ed4a2', '#bca0f5', '#f38e9b'][index % 4],
  rotation: `${index * 19}deg`,
  drift: `${((index % 9) - 4) * 12}px`,
}))

function institutionName(origin) {
  return origin === 'camara' ? 'Câmara Municipal de Contagem' : 'Prefeitura Municipal de Contagem'
}

async function celebrate(selectedDraws) {
  celebrationDraws.value = selectedDraws
  celebrationRound.value += 1
  showCelebrationConfetti.value = !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  window.clearTimeout(celebrationTimeout)
  if (showCelebrationConfetti.value) {
    celebrationTimeout = window.setTimeout(() => {
      showCelebrationConfetti.value = false
    }, 5200)
  }

  await nextTick()
  if (!celebrationDialog.value?.open) celebrationDialog.value?.showModal()
}

async function celebrateAll() {
  if (confirming.value || drawing.value) return
  confirming.value = true
  try {
    const results = []
    let page = 1
    let pages = 1
    do {
      const history = await requestDrawApi(`/api/sorteios?limit=100&page=${page}`)
      results.push(...history.dados)
      pages = history.paginacao.paginas
      page += 1
    } while (page <= pages)
    if (viewActive) await celebrate(results)
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: 'Não foi possível carregar os contemplados',
      text: error.message,
    })
  } finally {
    confirming.value = false
  }
}

function clearCelebration() {
  window.clearTimeout(celebrationTimeout)
  showCelebrationConfetti.value = false
  celebrationDraws.value = []
}

function prepareNextDraw() {
  if (drawing.value || confirming.value || !latestDraw.value || !eligibleCount.value) {
    return
  }

  projectionPhase.value = 'preparing'
  sendProjectionState()
}

async function refreshData(recover = false) {
  loading.value = true
  loadError.value = ''
  try {
    const [history, prizeData] = await Promise.all([
      requestDrawApi('/api/sorteios?limit=100'),
      requestDrawApi('/api/premios'),
    ])
    indicatorData.value = history.indicadores
    prizes.value = prizeData.dados
    if (recover) {
      draws.value = [...history.dados].reverse()
      pendingOperation.value = readPendingDraw()
      if (pendingOperation.value) {
        const operation = pendingOperation.value
        const found = await requestDrawApi(
          `/api/sorteios?chave=${encodeURIComponent(operation.chave)}`,
        )
        if (found.dados.length) {
          const recovered = found.dados[0]
          if (!latestDraw.value || recovered.numero > latestDraw.value.numero) {
            draws.value.push(recovered)
          }
          indicatorData.value = found.indicadores
          clearPendingDraw(operation.chave)
          pendingOperation.value = null
        }
      }
      projectionPhase.value = latestDraw.value ? 'winner' : 'ready'
      ballNumber.value = latestDraw.value?.matricula ?? '?'
      sendProjectionState(true)
    }
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

async function confirmDraw() {
  if (drawing.value || confirming.value || !canStartDraw.value) return
  confirming.value = true
  try {
    pendingOperation.value = readPendingDraw()
    drawConfirmationSubmitted = false
    const result = await Swal.fire({
      didOpen: () => {
        drawConfirmationOpen = true
      },
      willClose: () => {
        drawConfirmationOpen = false
      },
      icon: 'question',
      title: pendingOperation.value ? 'Recuperar operação pendente?' : 'Confirmar sorteio?',
      text: pendingOperation.value
        ? 'A mesma solicitação será consultada ou reenviada, sem criar outro resultado para esta operação.'
        : `Sorteio #${nextDrawNumber.value} · ${eligibleCount.value} participantes elegíveis · ${availablePrizes.value.find((prize) => prize.id === selectedPrizeId.value)?.nome ?? 'Sem prêmio associado'}. O resultado será definitivo.`,
      showCancelButton: true,
      confirmButtonText: 'Confirmar e continuar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0868af',
      cancelButtonColor: '#65758a',
      reverseButtons: true,
    })
    drawConfirmationOpen = false
    if (!result.isConfirmed || !viewActive) return
    const operation = pendingOperation.value ?? {
      chave: crypto.randomUUID(),
      numeroEsperado: nextDrawNumber.value,
      premioId: selectedPrizeId.value || null,
    }
    // Persiste antes do POST para sobreviver a recargas e respostas perdidas.
    localStorage.setItem(pendingDrawKey, JSON.stringify(operation))
    pendingOperation.value = operation
    let draw
    try {
      draw = await requestDrawApi('/api/sorteios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(operation),
      })
    } catch (error) {
      if ([400, 404, 409].includes(error.status)) {
        clearPendingDraw(operation.chave)
        pendingOperation.value = null
      }
      throw error
    }
    // Uma falha ao limpar o armazenamento nunca deve provocar outro POST.
    clearPendingDraw(operation.chave)
    pendingOperation.value = null
    if (!viewActive) return
    await animateDraw(draw)
    await refreshData()
  } catch (error) {
    if (!viewActive) return
    drawing.value = false
    await Swal.fire({
      icon: 'error',
      title: 'Não foi possível concluir a apresentação',
      text: error.message,
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#0868af',
    })
    await refreshData(true)
  } finally {
    drawConfirmationOpen = false
    confirming.value = false
  }
}

async function animateDraw(draw) {
  activeDrawNumber = draw.numero
  drawing.value = true
  projectionPhase.value = 'drawing'
  ballNumber.value = '•••'

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const duration = reducedMotion ? 250 : 2800

  sendProjectionState()

  if (!reducedMotion) {
    const animationStart = performance.now()
    let lastStep = -1
    await new Promise((resolve) => {
      finishAnimation = () => {
        window.clearTimeout(animationDeadline)
        if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
        animationFrame = null
        finishAnimation = null
        resolve()
      }
      // A revelação continua mesmo quando o navegador pausa os quadros desta janela.
      animationDeadline = window.setTimeout(() => finishAnimation?.(), duration)
      const animateDigits = (now) => {
        if (!viewActive || now - animationStart >= duration) {
          finishAnimation?.()
          return
        }
        // Atualiza só os dígitos a 20 Hz; o movimento contínuo permanece em CSS.
        const step = Math.floor((now - animationStart) / 50)
        if (step !== lastStep) {
          lastStep = step
          ballNumber.value = [1, 3, 7, 9, 3, 7]
            .map((factor, position) => (step * factor + position * 2) % 10)
            .join('')
          sendProjectionState()
        }
        animationFrame = window.requestAnimationFrame(animateDigits)
      }
      animationFrame = window.requestAnimationFrame(animateDigits)
    })
  } else {
    await new Promise((resolve) => window.setTimeout(resolve, duration))
  }

  if (!viewActive) return
  draws.value = [...draws.value.filter((item) => item.id !== draw.id), draw]
  selectedPrizeId.value = ''
  ballNumber.value = draw.matricula
  drawing.value = false
  projectionPhase.value = 'winner'
  activeDrawNumber = null

  sendProjectionState()

  window.clearTimeout(confettiTimeout)
  confettiRound.value += 1
  showConfetti.value = !reducedMotion
  if (!reducedMotion) {
    confettiTimeout = window.setTimeout(() => {
      showConfetti.value = false
    }, 3400)
  }
}

onBeforeUnmount(() => {
  viewActive = false
  window.removeEventListener('keydown', handleDrawShortcut, true)
  window.removeEventListener('keyup', releaseDrawShortcut, true)
  window.removeEventListener('pagehide', announceProjectionDisconnect)
  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
  finishAnimation?.()
  finishAnimation = null
  announceProjectionDisconnect()
  window.clearInterval(projectionHeartbeatInterval)
  projectionChannelActive = false
  projectionChannel?.close()
  window.clearTimeout(confettiTimeout)
  window.clearTimeout(celebrationTimeout)
})

onMounted(async () => {
  window.addEventListener('keydown', handleDrawShortcut, true)
  window.addEventListener('keyup', releaseDrawShortcut, true)
  window.addEventListener('pagehide', announceProjectionDisconnect)
  await refreshData(true)
  if (!viewActive) return
  sendProjectionState(true)
  sendProjectionHeartbeat()
  projectionHeartbeatInterval = window.setInterval(sendProjectionHeartbeat, 2000)
})
</script>

<template>
  <svg class="draw-icon-library" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <symbol id="draw-sparkles" viewBox="0 0 24 24">
      <path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3z" />
      <path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </symbol>
    <symbol id="draw-gift" viewBox="0 0 24 24">
      <path
        d="M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9H7.5a2.5 2.5 0 1 1 2.2-3.7L12 9zm0 0h4.5a2.5 2.5 0 1 0-2.2-3.7L12 9z"
      />
    </symbol>
    <symbol id="draw-shield" viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" />
      <path d="m9 12 2 2 4-4" />
    </symbol>
    <symbol id="draw-users" viewBox="0 0 24 24">
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm10 10v-2a4 4 0 0 0-3-3.87m-1-11.13a4 4 0 0 1 0 7.75"
      />
    </symbol>
    <symbol id="draw-trophy" viewBox="0 0 24 24">
      <path
        d="M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0V3zM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4"
      />
    </symbol>
    <symbol id="draw-clock" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </symbol>
    <symbol id="draw-arrow" viewBox="0 0 24 24">
      <path d="M4 12h16m-7-7 7 7-7 7" />
    </symbol>
    <symbol id="draw-close" viewBox="0 0 24 24">
      <path d="m18 6-12 12M6 6l12 12" />
    </symbol>
  </svg>

  <div class="draw-view">
    <header class="draw-topline">
      <div>
        <p class="draw-eyebrow">O GRANDE MOMENTO</p>
        <h1 class="draw-page-title">Hora do sorteio!</h1>
        <p class="draw-page-description">
          Uma experiência especial, justa e emocionante para os participantes.
        </p>
      </div>
      <span class="draw-demo-tag">RESULTADOS PERSISTIDOS · DADOS REAIS</span>
    </header>

    <div class="draw-layout">
      <section class="draw-stage-column" aria-label="Apresentação do sorteio">
        <div
          class="draw-stage"
          :class="{ 'is-drawing': drawing, 'has-winner': latestDraw && !drawing }"
        >
          <header class="draw-stage-top">
            <span class="draw-stage-pill">
              SORTEIO Nº
              {{
                String(
                  drawing ? activeDrawNumber : !latestDraw ? nextDrawNumber : latestDraw.numero,
                ).padStart(3, '0')
              }}
            </span>
            <span class="draw-stage-count">
              <strong>{{ eligibleCount }}</strong> participantes aptos
            </span>
          </header>

          <p class="draw-stage-intro">
            {{
              drawing
                ? 'A SORTE ESTÁ GIRANDO!'
                : latestDraw
                  ? 'TEMOS UM VENCEDOR!'
                  : eligibleCount
                    ? 'A SORTE VAI GIRAR!'
                    : 'SORTEIO AGUARDANDO'
            }}
          </p>

          <div class="draw-bingo-center" aria-hidden="true">
            <div class="draw-bingo-ring"></div>
            <div class="draw-bingo-ball">
              <span class="draw-ball-label">MATRÍCULA</span>
              <strong
                class="draw-ball-number"
                :style="{ '--number-length': Math.max(ballNumber.length, 1) }"
                >{{ ballNumber }}</strong
              >
              <span class="draw-ball-caption">{{
                latestDraw && !drawing ? 'SORTEADO' : 'Nº DA SORTE'
              }}</span>
            </div>
          </div>

          <h2 class="draw-stage-caption">
            {{
              drawing
                ? 'Boa sorte a todos os participantes!'
                : latestDraw
                  ? latestDraw.nome
                  : eligibleCount
                    ? 'Quem será o próximo vencedor?'
                    : 'Não há participantes elegíveis no momento.'
            }}
          </h2>
          <p class="draw-sr-only" aria-live="polite" aria-atomic="true">
            {{
              drawing || !latestDraw
                ? ''
                : `Resultado do sorteio ${String(latestDraw.numero).padStart(3, '0')}: ${latestDraw.nome}, matrícula ${latestDraw.matricula}, ${institutionName(latestDraw.origem)}${latestDraw.premioNome ? `, prêmio: ${latestDraw.premioNome}` : ', sem prêmio associado'}.`
            }}
          </p>
          <p class="draw-stage-subtitle">
            {{
              drawing
                ? 'O resultado será revelado em instantes.'
                : latestDraw
                  ? `Matrícula ${latestDraw.matricula} · ${institutionName(latestDraw.origem)}`
                  : 'Somente quem está presente e ainda não foi contemplado pode participar.'
            }}
          </p>

          <div v-if="latestDraw && !drawing && latestDraw.premioNome" class="draw-stage-prize">
            <svg class="draw-icon" aria-hidden="true"><use href="#draw-gift" /></svg>
            <span>{{ latestDraw.premioNome }}</span>
          </div>
          <p v-if="latestDraw?.localTrabalhoDescricao && !drawing" class="draw-stage-subtitle">
            Local de trabalho: {{ latestDraw.localTrabalhoDescricao }}
          </p>
        </div>

        <section v-if="latestDraw" class="draw-winner-result" aria-labelledby="draw-winner-title">
          <header class="draw-winner-top">
            <span class="draw-winner-trophy">
              <svg class="draw-icon" aria-hidden="true"><use href="#draw-trophy" /></svg>
            </span>
            <strong id="draw-winner-title">PARABÉNS, TEMOS UM CONTEMPLADO!</strong>
          </header>
          <h2 class="draw-winner-name">{{ latestDraw.nome }}</h2>
          <p class="draw-winner-meta">
            Matrícula {{ latestDraw.matricula }} · {{ institutionName(latestDraw.origem) }}
          </p>
          <p v-if="latestDraw.premioNome" class="draw-winner-prize">
            <svg class="draw-icon" aria-hidden="true"><use href="#draw-gift" /></svg>
            {{ latestDraw.premioNome }}
          </p>
          <p v-else class="draw-winner-prize is-no-prize">Sorteio realizado sem prêmio associado</p>
          <p v-if="latestDraw.localTrabalhoDescricao" class="draw-winner-meta">
            Local de trabalho: {{ latestDraw.localTrabalhoDescricao }}
          </p>
          <div class="draw-winner-actions">
            <button class="draw-celebrate-button" type="button" @click="celebrate([latestDraw])">
              <svg class="draw-icon" aria-hidden="true"><use href="#draw-sparkles" /></svg>
              Celebrar ganhador
            </button>
            <button
              class="draw-celebrate-all-button"
              type="button"
              :disabled="confirming || drawing"
              @click="celebrateAll"
            >
              <svg class="draw-icon" aria-hidden="true"><use href="#draw-users" /></svg>
              Celebrar todos ({{ winnerCount }})
            </button>
            <RouterLink class="draw-history-link" to="/vencedores">
              Ver no histórico
              <svg class="draw-icon" aria-hidden="true"><use href="#draw-arrow" /></svg>
            </RouterLink>
          </div>
        </section>

        <section v-else class="draw-winner-empty" aria-label="Resultado do sorteio">
          <span class="draw-empty-trophy">
            <svg class="draw-icon" aria-hidden="true"><use href="#draw-trophy" /></svg>
          </span>
          <strong>Nenhum contemplado ainda</strong>
          <p>Após o primeiro sorteio, o resultado aparecerá aqui.</p>
        </section>
      </section>

      <aside class="draw-control" aria-labelledby="draw-control-title">
        <h2 id="draw-control-title" class="draw-panel-title">
          <svg class="draw-icon" aria-hidden="true"><use href="#draw-sparkles" /></svg>
          Controle do sorteio
        </h2>
        <p class="draw-panel-subtitle">Confira os números e inicie quando estiver pronto.</p>
        <p v-if="loading" class="draw-field-note" role="status">Consultando dados reais…</p>
        <p v-if="loadError" class="draw-no-eligible" role="alert">{{ loadError }}</p>
        <button
          v-if="!drawing && !confirming"
          class="draw-prepare-button"
          type="button"
          :disabled="loading"
          @click="refreshData(true)"
        >
          Atualizar dados
        </button>

        <div class="draw-stats" aria-label="Resumo dos participantes">
          <article class="draw-stat">
            <span>Presenças confirmadas</span>
            <strong>{{ presentCount }}</strong>
          </article>
          <article class="draw-stat">
            <span>Já contemplados</span>
            <strong>{{ winnerCount }}</strong>
          </article>
          <article class="draw-stat draw-stat-eligible">
            <span>Elegíveis agora</span>
            <strong>{{ eligibleCount }}</strong>
          </article>
        </div>

        <div class="draw-control-section">
          <label for="draw-prize-select"> Prêmio deste sorteio <span>(opcional)</span> </label>
          <select
            id="draw-prize-select"
            v-model="selectedPrizeId"
            :disabled="
              loading || drawing || confirming || !!pendingOperation || !availablePrizes.length
            "
          >
            <option value="">Nenhum prêmio selecionado</option>
            <option v-for="prize in availablePrizes" :key="prize.id" :value="prize.id">
              {{ prize.nome }}
            </option>
          </select>
          <p class="draw-field-note">
            A escolha fica associada ao vencedor e não poderá ser utilizada novamente.
          </p>

          <button
            class="draw-start-button"
            :aria-keyshortcuts="canUseDrawShortcut ? 'Space' : undefined"
            type="button"
            :disabled="drawing || confirming || !canStartDraw"
            @click="confirmDraw"
          >
            <svg class="draw-icon" aria-hidden="true"><use href="#draw-sparkles" /></svg>
            {{
              drawing
                ? 'Sorteando...'
                : confirming
                  ? 'Aguardando confirmação...'
                  : pendingOperation
                    ? 'Recuperar operação pendente'
                    : 'Iniciar sorteio'
            }}
          </button>
          <p v-if="canUseDrawShortcut" class="draw-field-note">
            Pressione <kbd>Espaço</kbd> para iniciar o sorteio.
          </p>
          <button
            v-if="latestDraw && projectionPhase === 'winner'"
            class="draw-prepare-button"
            type="button"
            :disabled="drawing || confirming || !eligibleCount"
            @click="prepareNextDraw"
          >
            Preparar próximo sorteio
          </button>
          <p
            v-if="latestDraw && projectionPhase === 'winner' && eligibleCount"
            class="draw-prepare-note"
          >
            O resultado atual permanece visível no Telão até preparar a próxima rodada.
          </p>

          <div class="draw-notice" role="note">
            <svg class="draw-icon" aria-hidden="true"><use href="#draw-shield" /></svg>
            <p>Só participam servidores <strong>presentes e ainda não contemplados</strong>.</p>
          </div>
          <p v-if="!eligibleCount" class="draw-no-eligible" role="status">
            Não há participantes aptos para um novo sorteio.
          </p>
        </div>

        <div class="draw-projector-tools" aria-label="Exibição opcional em telão">
          <div class="draw-projector-copy">
            <span>EXIBIÇÃO OPCIONAL</span>
            <strong>Vai usar TV ou projetor?</strong>
            <p>Abra uma janela para apresentar o sorteio ao público.</p>
          </div>
          <button
            class="draw-projector-button"
            type="button"
            :disabled="!projectionSupported"
            @click="openProjection"
          >
            <svg class="draw-icon" aria-hidden="true">
              <rect x="3" y="4" width="18" height="13" rx="2" />
              <path d="M8 21h8m-4-4v4" />
            </svg>
            Abrir Telão
            <span aria-hidden="true">↗</span>
          </button>
          <p v-if="projectionLinkVisible" class="draw-projector-fallback" role="status">
            A janela foi bloqueada.
            <a :href="projectionUrl" target="_blank" rel="noopener noreferrer">
              Abrir Telão em uma nova aba
            </a>
          </p>
          <p v-else-if="!projectionSupported" class="draw-projector-fallback" role="status">
            Este navegador não oferece suporte à sincronização do Telão.
          </p>
        </div>
        <p class="draw-demo-note">Resultados definitivos registrados no SQLite.</p>
      </aside>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showConfetti" :key="confettiRound" class="draw-confetti" aria-hidden="true">
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
  </Teleport>

  <dialog
    ref="celebrationDialog"
    class="draw-celebration-dialog"
    aria-labelledby="draw-celebration-title"
    aria-describedby="draw-celebration-description"
    @close="clearCelebration"
  >
    <div
      v-if="showCelebrationConfetti"
      :key="celebrationRound"
      class="draw-celebration-confetti"
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
        }"
      ></span>
    </div>
    <div class="draw-celebration-shell">
      <header class="draw-celebration-top">
        <span class="draw-celebration-kicker">
          <svg class="draw-icon" aria-hidden="true"><use href="#draw-sparkles" /></svg>
          {{
            celebrationDraws.length > 1 ? 'Dia do Servidor · Contagem' : 'Celebração do ganhador'
          }}
        </span>
        <button
          class="draw-celebration-close"
          type="button"
          aria-label="Fechar comemoração"
          autofocus
          @click="celebrationDialog?.close()"
        >
          <svg class="draw-icon" aria-hidden="true"><use href="#draw-close" /></svg>
        </button>
      </header>

      <template v-if="celebrationDraws.length === 1">
        <div class="draw-celebration-orb" aria-hidden="true">
          <svg class="draw-icon" aria-hidden="true"><use href="#draw-trophy" /></svg>
        </div>
        <h2 id="draw-celebration-title" class="draw-celebration-name">
          {{ celebrationDraws[0].nome }}
        </h2>
        <p id="draw-celebration-description" class="draw-celebration-meta">
          Matrícula {{ celebrationDraws[0].matricula }} ·
          {{ institutionName(celebrationDraws[0].origem) }}
        </p>
        <div
          class="draw-celebration-prize"
          :class="{ 'is-no-prize': !celebrationDraws[0].premioNome }"
        >
          <svg class="draw-icon" aria-hidden="true"><use href="#draw-gift" /></svg>
          {{
            celebrationDraws[0].premioNome
              ? `Prêmio do sorteio: ${celebrationDraws[0].premioNome}`
              : 'Sorteio realizado sem prêmio associado'
          }}
        </div>
        <p class="draw-celebration-copy">
          Um momento especial para celebrar quem faz nossa cidade acontecer todos os dias.
        </p>
      </template>

      <template v-else>
        <div class="draw-collective-heading">
          <span class="draw-collective-medal" aria-hidden="true">
            <svg class="draw-icon" aria-hidden="true"><use href="#draw-users" /></svg>
          </span>
          <h2 id="draw-celebration-title">Uma salva de palmas para todos!</h2>
          <p id="draw-celebration-description">
            Celebrando os {{ celebrationDraws.length }} contemplados desta festa.
          </p>
        </div>
        <div class="draw-collective-grid" role="list" aria-label="Todos os contemplados">
          <article
            v-for="draw in celebrationDraws"
            :key="draw.numero"
            class="draw-collective-card"
            role="listitem"
          >
            <small>SORTEIO #{{ String(draw.numero).padStart(3, '0') }}</small>
            <strong>{{ draw.nome }}</strong>
            <span>
              {{ draw.premioNome ? `Prêmio: ${draw.premioNome}` : 'Sorteio sem prêmio associado' }}
            </span>
          </article>
        </div>
        <p class="draw-collective-note">
          Cada nome representa um momento especial. Todos merecem reconhecimento!
        </p>
      </template>

      <div class="draw-celebration-actions">
        <button class="draw-celebration-dismiss" type="button" @click="celebrationDialog?.close()">
          Voltar ao sorteio
        </button>
      </div>
    </div>
  </dialog>
</template>
