<script setup>
import { computed, ref } from 'vue'
import Swal from 'sweetalert2'
import './SorteioView.css'

// Esta lista é independente do credenciamento até a futura integração com o back-end.
const participants = ref([
  {
    id: 1,
    nome: 'Ana Beatriz Nunes',
    matricula: '000123',
    origem: 'prefeitura',
    presente: true,
    contemplado: false,
  },
  {
    id: 2,
    nome: 'Bruno Lopes',
    matricula: '000123',
    origem: 'camara',
    presente: true,
    contemplado: false,
  },
  {
    id: 3,
    nome: 'Carolina Duarte',
    matricula: '000124',
    origem: 'prefeitura',
    presente: true,
    contemplado: false,
  },
  {
    id: 4,
    nome: 'Diego Martins',
    matricula: '000125',
    origem: 'camara',
    presente: true,
    contemplado: false,
  },
  {
    id: 5,
    nome: 'Elisa Costa',
    matricula: '000126',
    origem: 'prefeitura',
    presente: false,
    contemplado: false,
  },
  {
    id: 6,
    nome: 'Felipe Souza',
    matricula: '000127',
    origem: 'camara',
    presente: true,
    contemplado: false,
  },
])

const prizes = [
  { id: 'gift-card', nome: 'Vale-presente de R$ 200' },
  { id: 'coffee-maker', nome: 'Cafeteira elétrica' },
  { id: 'headphones', nome: 'Fone de ouvido' },
]
const draws = ref([])
const selectedPrizeId = ref('')
const drawing = ref(false)
const confirming = ref(false)
const ballNumber = ref('?')
const showConfetti = ref(false)
const confettiRound = ref(0)
let confettiTimeout

const eligibleParticipants = computed(() =>
  participants.value.filter((person) => person.presente && !person.contemplado),
)
const presentCount = computed(() => participants.value.filter((person) => person.presente).length)
const winnerCount = computed(() => participants.value.filter((person) => person.contemplado).length)
const availablePrizes = computed(() =>
  prizes.filter((prize) => !draws.value.some((draw) => draw.premioId === prize.id)),
)
const nextDrawNumber = computed(() => draws.value.length + 1)
const latestDraw = computed(() => draws.value.at(-1))
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

async function confirmDraw() {
  if (drawing.value || confirming.value || !eligibleParticipants.value.length) return

  confirming.value = true
  const selectedPrize = availablePrizes.value.find((prize) => prize.id === selectedPrizeId.value)
  const result = await Swal.fire({
    icon: 'question',
    title: 'Confirmar sorteio?',
    html: `
      <div class="draw-confirm-summary">
        <p><strong>Número do sorteio:</strong> #${String(nextDrawNumber.value).padStart(3, '0')}</p>
        <p><strong>Participantes elegíveis:</strong> ${eligibleParticipants.value.length}</p>
        <p><strong>Prêmio:</strong> ${selectedPrize?.nome ?? 'Sem prêmio definido'}</p>
        <p>O resultado será definitivo nesta demonstração.</p>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Confirmar e sortear',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#0868af',
    cancelButtonColor: '#65758a',
    reverseButtons: true,
  })
  confirming.value = false

  if (!result.isConfirmed) return

  const pool = eligibleParticipants.value
  if (!pool.length) return

  // O vencedor é escolhido uma vez; os números animados são apenas visuais.
  const selectedWinner = pool[Math.floor(Math.random() * pool.length)]
  const winner = { ...selectedWinner }
  const drawNumber = nextDrawNumber.value
  const prize = selectedPrize
    ? availablePrizes.value.find((item) => item.id === selectedPrize.id)
    : null

  drawing.value = true
  ballNumber.value = '•••'

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const duration = reducedMotion ? 250 : 2800

  if (!reducedMotion) {
    const digitSteps = [1, 3, 7, 9, 3, 7]
    const animationStart = performance.now()
    let tick = 0

    await new Promise((resolve) => {
      const animateDigits = () => {
        const elapsed = performance.now() - animationStart
        ballNumber.value = digitSteps
          .map((step, position) => (tick * step + position * 2) % 10)
          .join('')
        tick += 1

        if (elapsed >= duration) {
          resolve()
          return
        }

        window.setTimeout(animateDigits, 45 + (elapsed / duration) * 110)
      }

      animateDigits()
    })
  } else {
    await new Promise((resolve) => window.setTimeout(resolve, duration))
  }

  const draw = {
    numero: drawNumber,
    participanteId: winner.id,
    nome: winner.nome,
    matricula: winner.matricula,
    origem: winner.origem,
    premioId: prize?.id ?? null,
    premioNome: prize?.nome ?? '',
  }

  const participant = participants.value.find((person) => person.id === winner.id)
  participant.contemplado = true
  draws.value.push(draw)
  selectedPrizeId.value = ''
  ballNumber.value = winner.matricula
  drawing.value = false

  window.clearTimeout(confettiTimeout)
  confettiRound.value += 1
  showConfetti.value = !reducedMotion
  if (!reducedMotion) {
    confettiTimeout = window.setTimeout(() => {
      showConfetti.value = false
    }, 3400)
  }
}
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
  </svg>

  <div class="draw-view">
    <header class="draw-topline">
      <div>
        <p class="draw-eyebrow">O GRANDE MOMENTO</p>
        <h1 class="draw-page-title">Hora do sorteio!</h1>
        <p class="draw-page-description">
Uma experiência especial, justa e emocionante para os participantes.        </p>
      </div>
      <span class="draw-demo-tag">DEMONSTRAÇÃO · DADOS FICTÍCIOS SEM SINCRONIZAÇÃO</span>
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
                String(drawing || !latestDraw ? nextDrawNumber : latestDraw.numero).padStart(3, '0')
              }}
            </span>
            <span class="draw-stage-count">
              <strong>{{ eligibleParticipants.length }}</strong> participantes aptos
            </span>
          </header>

          <p class="draw-stage-intro">
            {{
              drawing
                ? 'A SORTE ESTÁ GIRANDO!'
                : latestDraw
                  ? 'TEMOS UM VENCEDOR!'
                  : eligibleParticipants.length
                    ? 'A SORTE VAI GIRAR!'
                    : 'SORTEIO AGUARDANDO'
            }}
          </p>

          <div class="draw-bingo-center" aria-hidden="true">
            <div class="draw-bingo-ring"></div>
            <div class="draw-bingo-ball">
              <span class="draw-ball-label">MATRÍCULA</span>
              <strong class="draw-ball-number" aria-live="polite">{{ ballNumber }}</strong>
              <span class="draw-ball-caption">{{
                latestDraw && !drawing ? 'SORTEADO' : 'Nº DA SORTE'
              }}</span>
            </div>
          </div>

          <h2 class="draw-stage-caption" aria-live="polite" aria-atomic="true">
            {{
              drawing
                ? 'Boa sorte a todos os participantes!'
                : latestDraw
                  ? latestDraw.nome
                  : eligibleParticipants.length
                    ? 'Quem será o próximo vencedor?'
                    : 'Não há participantes elegíveis no momento.'
            }}
          </h2>
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
        </div>

        <section v-if="draws.length" class="draw-history" aria-labelledby="draw-history-title">
          <header class="draw-history-heading">
            <div>
              <h2 id="draw-history-title">Resultados desta demonstração</h2>
              <p>Os resultados ficam registrados enquanto esta página estiver ativa.</p>
            </div>
            <span>{{ draws.length }} {{ draws.length === 1 ? 'sorteio' : 'sorteios' }}</span>
          </header>
          <ol class="draw-history-list">
            <li v-for="draw in draws" :key="draw.numero" class="draw-history-item">
              <span class="draw-history-number">#{{ String(draw.numero).padStart(3, '0') }}</span>
              <div>
                <strong>{{ draw.nome }}</strong>
                <span>{{ draw.matricula }} · {{ institutionName(draw.origem) }}</span>
              </div>
              <span v-if="draw.premioNome" class="draw-history-prize">
                <svg class="draw-icon" aria-hidden="true"><use href="#draw-gift" /></svg>
                {{ draw.premioNome }}
              </span>
              <span v-else class="draw-history-no-prize">Sem prêmio</span>
            </li>
          </ol>
        </section>
      </section>

      <aside class="draw-control" aria-labelledby="draw-control-title">
        <h2 id="draw-control-title" class="draw-panel-title">
          <svg class="draw-icon" aria-hidden="true"><use href="#draw-sparkles" /></svg>
          Controle do sorteio
        </h2>
        <p class="draw-panel-subtitle">Confira os números e inicie quando estiver pronto.</p>

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
            <strong>{{ eligibleParticipants.length }}</strong>
          </article>
        </div>

        <div class="draw-control-section">
          <label for="draw-prize-select"> Prêmio deste sorteio <span>(opcional)</span> </label>
          <select
            id="draw-prize-select"
            v-model="selectedPrizeId"
            :disabled="drawing || confirming || !availablePrizes.length"
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
            type="button"
            :disabled="drawing || confirming || !eligibleParticipants.length"
            @click="confirmDraw"
          >
            <svg class="draw-icon" aria-hidden="true"><use href="#draw-sparkles" /></svg>
            {{
              drawing
                ? 'Sorteando...'
                : confirming
                  ? 'Aguardando confirmação...'
                  : 'Iniciar sorteio'
            }}
          </button>

          <div class="draw-notice" role="note">
            <svg class="draw-icon" aria-hidden="true"><use href="#draw-shield" /></svg>
            <p>Só participam servidores <strong>presentes e ainda não contemplados</strong>.</p>
          </div>
          <p v-if="!eligibleParticipants.length" class="draw-no-eligible" role="status">
            Não há participantes aptos para um novo sorteio.
          </p>
        </div>

        <div class="draw-projector-note" role="note">
          <span>EXIBIÇÃO OPCIONAL</span>
          <strong>Modo Telão em desenvolvimento</strong>
          <p>A apresentação do sorteio permanece nesta página nesta etapa.</p>
        </div>
        <p class="draw-demo-note">Demonstração local · Não sincronizada com o Credenciamento</p>
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
</template>
