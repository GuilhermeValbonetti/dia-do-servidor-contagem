<script setup>
import { computed, ref } from 'vue'
import Swal from 'sweetalert2'
import './PremiosView.css'

const prizes = ref([
  { id: 1, nome: 'Vale-presente de R$ 200', utilizado: false },
  { id: 2, nome: 'Cafeteira elétrica', utilizado: false },
  { id: 3, nome: 'Vale-presente de R$ 200', utilizado: false },
  { id: 4, nome: 'Fone de ouvido', utilizado: true },
])
const prizeName = ref('')
const formMessage = ref('')
const nextPrizeId = ref(5)

const availableCount = computed(() => prizes.value.filter((prize) => !prize.utilizado).length)

function addPrize(name = prizeName.value) {
  const cleanedName = name.trim()

  if (!cleanedName) {
    formMessage.value = 'Informe o nome do prêmio.'
    return
  }

  if (cleanedName.length > 90) {
    formMessage.value = 'O nome do prêmio deve ter no máximo 90 caracteres.'
    return
  }

  prizes.value.push({
    id: nextPrizeId.value,
    nome: cleanedName,
    utilizado: false,
  })
  nextPrizeId.value += 1
  prizeName.value = ''
  formMessage.value = ''
}

function addDemoPrize() {
  addPrize('Vale-presente de R$ 200')
}

function addDemoPack() {
  const demoPrizes = ['Bicicleta', 'Caixa de som', 'Kit churrasco']
  demoPrizes.forEach((name) => addPrize(name))
}

async function removePrize(prize) {
  if (prize.utilizado) {
    await Swal.fire({
      icon: 'warning',
      title: 'Prêmio indisponível',
      text: 'Prêmios associados a um sorteio não podem ser excluídos.',
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#0868af',
    })
    return
  }

  const result = await Swal.fire({
    icon: 'warning',
    title: 'Excluir prêmio?',
    text: `O prêmio "${prize.nome}" será removido da lista.`,
    showCancelButton: true,
    confirmButtonText: 'Excluir prêmio',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#b8404f',
    cancelButtonColor: '#65758a',
    reverseButtons: true,
  })

  if (!result.isConfirmed) return

  prizes.value = prizes.value.filter((item) => item.id !== prize.id)
  await Swal.fire({
    icon: 'success',
    title: 'Prêmio excluído',
    text: `${prize.nome} foi removido da demonstração.`,
    confirmButtonText: 'Concluir',
    confirmButtonColor: '#0868af',
  })
}
</script>

<template>
  <svg class="prizes-icon-library" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <symbol id="prizes-gift" viewBox="0 0 24 24">
      <path
        d="M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9H7.5a2.5 2.5 0 1 1 2.2-3.7L12 9zm0 0h4.5a2.5 2.5 0 1 0-2.2-3.7L12 9z"
      />
    </symbol>
    <symbol id="prizes-trash" viewBox="0 0 24 24">
      <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" />
    </symbol>
    <symbol id="prizes-check" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </symbol>
    <symbol id="prizes-clock" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </symbol>
  </svg>

  <div class="prizes-view">
    <header class="prizes-page-heading">
      <div>
        <p class="prizes-eyebrow">ORGANIZAÇÃO DO EVENTO</p>
        <h1>Prêmios</h1>
        <p>Cadastre e acompanhe os prêmios disponíveis para os sorteios.</p>
      </div>
      <span class="prizes-demo-tag">DADOS DEMONSTRATIVOS</span>
    </header>

    <div class="prizes-panels">
      <section class="prizes-panel prizes-register" aria-labelledby="prize-form-title">
        <h2 id="prize-form-title" class="prizes-panel-title">
          <svg class="prizes-icon" aria-hidden="true"><use href="#prizes-gift" /></svg>
          Cadastrar prêmio
        </h2>
        <p class="prizes-panel-subtitle">
          Opcional. Sorteios funcionam normalmente sem nenhum prêmio cadastrado.
        </p>

        <form class="prize-form" @submit.prevent="addPrize()">
          <div class="prize-field">
            <label for="prize-name">Nome do prêmio</label>
            <input
              id="prize-name"
              v-model="prizeName"
              type="text"
              maxlength="90"
              placeholder="Ex.: Vale-presente, bicicleta, cafeteira..."
              :aria-invalid="Boolean(formMessage)"
              :aria-describedby="formMessage ? 'prize-name-message' : undefined"
              @input="formMessage = ''"
            />
            <p v-if="formMessage" id="prize-name-message" class="prize-error" role="alert">
              {{ formMessage }}
            </p>
          </div>
          <button class="prize-add-button" type="submit">
            <svg class="prizes-icon" aria-hidden="true"><use href="#prizes-gift" /></svg>
            Adicionar
          </button>
        </form>

        <div class="prizes-demo-actions" aria-label="Ações demonstrativas">
          <span>Recursos de demonstração:</span>
          <button class="prize-demo-button" type="button" @click="addDemoPrize">
            Adicionar prêmio de exemplo
          </button>
          <button class="prize-demo-button" type="button" @click="addDemoPack">
            Adicionar 3 prêmios
          </button>
        </div>

        <p class="prizes-field-note">
          Cada prêmio cadastrado representa uma unidade. A associação é opcional e acontece somente
          no momento do sorteio.
        </p>
      </section>

      <section class="prizes-panel prizes-guide" aria-labelledby="prize-guide-title">
        <h2 id="prize-guide-title" class="prizes-panel-title">Controle flexível</h2>
        <div class="prizes-step">
          <span class="prizes-step-number">01</span>
          <div>
            <strong>Cadastre, se quiser</strong>
            <p>Você pode adicionar os prêmios a qualquer momento, inclusive durante o evento.</p>
          </div>
        </div>
        <div class="prizes-step">
          <span class="prizes-step-number is-gold">02</span>
          <div>
            <strong>Associe ao contemplado</strong>
            <p>
              Selecione o prêmio na tela do sorteio, antes de iniciar. Depois, o registro fica
              definitivo.
            </p>
          </div>
        </div>
      </section>
    </div>

    <section class="prizes-list-section" aria-labelledby="prize-list-title">
      <header class="prizes-list-heading">
        <h2 id="prize-list-title">Prêmios cadastrados</h2>
        <span>{{ prizes.length }} {{ prizes.length === 1 ? 'item' : 'itens' }}</span>
      </header>

      <div v-if="prizes.length" class="prizes-list">
        <article v-for="prize in prizes" :key="prize.id" class="prize-row">
          <span class="prize-glyph">
            <svg class="prizes-icon" aria-hidden="true"><use href="#prizes-gift" /></svg>
          </span>
          <div class="prize-text">
            <strong>{{ prize.nome }}</strong>
            <small>{{
              prize.utilizado ? 'Utilizado em sorteio' : 'Disponível para sorteio'
            }}</small>
          </div>
          <span class="prize-state" :class="{ 'is-used': prize.utilizado }">
            <svg class="prizes-icon" aria-hidden="true">
              <use :href="prize.utilizado ? '#prizes-check' : '#prizes-clock'" />
            </svg>
            {{ prize.utilizado ? 'Utilizado' : 'Disponível' }}
          </span>
          <button
            v-if="!prize.utilizado"
            class="prize-delete-button"
            type="button"
            :aria-label="`Excluir prêmio ${prize.nome}`"
            @click="removePrize(prize)"
          >
            <svg class="prizes-icon" aria-hidden="true"><use href="#prizes-trash" /></svg>
          </button>
          <span v-else class="prize-locked-note">Não pode excluir</span>
        </article>
      </div>

      <div v-else class="prizes-empty">
        <span class="prizes-empty-icon">
          <svg class="prizes-icon" aria-hidden="true"><use href="#prizes-gift" /></svg>
        </span>
        <strong>Você ainda não cadastrou prêmios</strong>
        <p>Isso não impede a realização dos sorteios.</p>
      </div>

      <p class="prizes-available-count">
        {{ availableCount }}
        {{ availableCount === 1 ? 'prêmio disponível' : 'prêmios disponíveis' }}
      </p>
    </section>
  </div>
</template>
