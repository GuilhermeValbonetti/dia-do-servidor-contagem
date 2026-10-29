<script setup>
import { computed, onMounted, ref } from 'vue'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import {
  addPrizeQuantity,
  createPrize,
  deleteAllPrizes,
  deletePrize,
  listPrizes,
  removePrizeQuantity,
} from '../../services/prize-service'
import './PremiosView.css'

const prizes = ref([])
const prizeName = ref('')
const prizeQuantity = ref(1)
const quantityByPrize = ref({})
const formMessage = ref('')
const loading = ref(true)
const loadError = ref('')
const isSaving = ref(false)

const availableCount = computed(() => prizes.value.filter((prize) => !prize.utilizado).length)

async function loadPrizes() {
  loading.value = true
  loadError.value = ''
  try {
    prizes.value = (await listPrizes()).map(mapPrize)
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

function mapPrize(prize) {
  return {
    ...prize,
    nome: prize.name,
    utilizado: prize.quantityAvailable < prize.quantityTotal,
  }
}

async function addPrize() {
  if (isSaving.value) return
  const cleanedName = prizeName.value.trim().replace(/\s+/g, ' ')

  if (!cleanedName) {
    formMessage.value = 'Informe o nome do prêmio.'
    return
  }

  if (!Number.isSafeInteger(prizeQuantity.value) || prizeQuantity.value < 1) {
    formMessage.value = 'Informe uma quantidade inteira maior que zero.'
    return
  }

  if (cleanedName.length > 90) {
    formMessage.value = 'O nome do prêmio deve ter no máximo 90 caracteres.'
    return
  }

  isSaving.value = true
  formMessage.value = ''
  try {
    await createPrize({
      name: cleanedName,
      quantityTotal: prizeQuantity.value,
    })
    prizeName.value = ''
    prizeQuantity.value = 1
    await loadPrizes()
    await Swal.fire({
      icon: 'success',
      title: 'Prêmio cadastrado',
      text: `${cleanedName} foi cadastrado.`,
      confirmButtonText: 'Concluir',
      confirmButtonColor: '#0868af',
    })
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: 'Não foi possível cadastrar',
      text: error.message,
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#0868af',
    })
  } finally {
    isSaving.value = false
  }
}

function quantityFor(prize) {
  return quantityByPrize.value[prize.id] ?? 1
}

function setQuantity(prizeId, value) {
  quantityByPrize.value[prizeId] = value === '' ? '' : Number(value)
}

async function changeQuantity(prize, direction) {
  if (isSaving.value) return

  const quantity = quantityFor(prize)
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    await Swal.fire({
      icon: 'warning',
      title: 'Quantidade inválida',
      text: 'Informe uma quantidade inteira maior que zero.',
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#0868af',
    })
    return
  }

  if (direction === 'remove' && quantity > prize.quantityAvailable) {
    await Swal.fire({
      icon: 'warning',
      title: 'Quantidade indisponível',
      text: `Há apenas ${prize.quantityAvailable} unidade(s) disponível(is) para retirar.`,
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#0868af',
    })
    return
  }

  isSaving.value = true
  try {
    const updatedPrize =
      direction === 'add'
        ? await addPrizeQuantity(prize.id, quantity)
        : await removePrizeQuantity(prize.id, quantity)
    Object.assign(prize, mapPrize(updatedPrize))
    quantityByPrize.value[prize.id] = 1
    await Swal.fire({
      icon: 'success',
      title: 'Estoque atualizado',
      text: `${prize.nome}: ${prize.quantityAvailable} unidade(s) disponível(is) de ${prize.quantityTotal}.`,
      confirmButtonText: 'Concluir',
      confirmButtonColor: '#0868af',
    })
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: direction === 'add' ? 'Não foi possível adicionar' : 'Não foi possível retirar',
      text: error.message,
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#0868af',
    })
    await loadPrizes()
  } finally {
    isSaving.value = false
  }
}

async function removePrize(prize) {
  if (isSaving.value) return
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

  isSaving.value = true
  try {
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

    await deletePrize(prize.id)
    await loadPrizes()
    await Swal.fire({
      icon: 'success',
      title: 'Prêmio excluído',
      text: `${prize.nome} foi removido.`,
      confirmButtonText: 'Concluir',
      confirmButtonColor: '#0868af',
    })
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: 'Não foi possível excluir',
      text: error.message,
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#0868af',
    })
    await loadPrizes()
  } finally {
    isSaving.value = false
  }
}

async function removeAllPrizes() {
  if (isSaving.value || prizes.value.length === 0) return

  isSaving.value = true
  try {
    const result = await Swal.fire({
      icon: 'warning',
      title: 'Excluir todos os prêmios?',
      text: `Os ${prizes.value.length} prêmio(s) serão excluídos. O histórico de vencedores será mantido, mas perderá a associação aos prêmios. Esta ação não pode ser desfeita.`,
      showCancelButton: true,
      confirmButtonText: 'Excluir todos',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b8404f',
      cancelButtonColor: '#65758a',
      reverseButtons: true,
    })

    if (!result.isConfirmed) return

    const deletedPrizes = await deleteAllPrizes()
    await loadPrizes()
    await Swal.fire({
      icon: 'success',
      title: 'Prêmios excluídos',
      text: `${deletedPrizes} prêmio(s) removido(s).`,
      confirmButtonText: 'Concluir',
      confirmButtonColor: '#0868af',
    })
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: 'Não foi possível excluir os prêmios',
      text: error.message,
      confirmButtonText: 'Entendi',
      confirmButtonColor: '#0868af',
    })
    await loadPrizes()
  } finally {
    isSaving.value = false
  }
}

onMounted(loadPrizes)
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
      <span class="prizes-demo-tag">DADOS REAIS</span>
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

        <form class="prize-form" :aria-busy="isSaving" @submit.prevent="addPrize()">
          <div class="prize-field">
            <label for="prize-name">Nome do prêmio</label>
            <input
              id="prize-name"
              v-model="prizeName"
              type="text"
              maxlength="90"
              :disabled="isSaving"
              placeholder="Ex.: Vale-presente, bicicleta, cafeteira..."
              :aria-invalid="Boolean(formMessage)"
              :aria-describedby="formMessage ? 'prize-name-message' : undefined"
              @input="formMessage = ''"
            />
            <p v-if="formMessage" id="prize-name-message" class="prize-error" role="alert">
              {{ formMessage }}
            </p>
          </div>
          <div class="prize-field">
            <label for="prize-quantity">Quantidade</label>
            <input
              id="prize-quantity"
              v-model.number="prizeQuantity"
              type="number"
              min="1"
              step="1"
              :disabled="isSaving"
            />
          </div>
          <button class="prize-add-button" type="submit" :disabled="isSaving">
            <svg class="prizes-icon" aria-hidden="true"><use href="#prizes-gift" /></svg>
            {{ isSaving ? 'Aguarde…' : 'Adicionar' }}
          </button>
        </form>

        <p class="prizes-field-note">
          Informe quantas unidades deseja cadastrar. A associação é opcional e acontece somente no
          momento do sorteio.
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
        <div v-if="!loading && !loadError" class="prizes-list-actions">
          <span>{{ prizes.length }} {{ prizes.length === 1 ? 'item' : 'itens' }}</span>
          <button
            v-if="prizes.length"
            class="prize-delete-all-button"
            type="button"
            :disabled="isSaving"
            @click="removeAllPrizes"
          >
            <svg class="prizes-icon" aria-hidden="true"><use href="#prizes-trash" /></svg>
            {{ isSaving ? 'Aguarde…' : 'Excluir todos' }}
          </button>
        </div>
      </header>

      <div v-if="loading" class="prizes-empty" role="status" aria-live="polite">
        <strong>Carregando prêmios…</strong>
      </div>
      <div v-else-if="loadError" class="prizes-empty" role="alert">
        <strong>Não foi possível carregar os prêmios</strong>
        <p>{{ loadError }}</p>
        <button class="prize-demo-button" type="button" :disabled="isSaving" @click="loadPrizes">
          Tentar novamente
        </button>
      </div>
      <div v-else-if="prizes.length" class="prizes-list">
        <article v-for="prize in prizes" :key="prize.id" class="prize-row">
          <span class="prize-glyph">
            <svg class="prizes-icon" aria-hidden="true"><use href="#prizes-gift" /></svg>
          </span>
          <div class="prize-text">
            <strong>{{ prize.nome }}</strong>
            <small>
              {{ prize.quantityAvailable }} disponível(is) de {{ prize.quantityTotal }}
              <template v-if="prize.utilizado"> · parte do estoque já foi utilizada</template>
            </small>
          </div>
          <span class="prize-state" :class="{ 'is-used': prize.utilizado }">
            <svg class="prizes-icon" aria-hidden="true">
              <use :href="prize.utilizado ? '#prizes-check' : '#prizes-clock'" />
            </svg>
            {{ prize.utilizado ? 'Utilizado' : 'Disponível' }}
          </span>
          <div class="prize-quantity-controls" :aria-label="`Atualizar estoque de ${prize.nome}`">
            <input
              type="number"
              min="1"
              step="1"
              :value="quantityFor(prize)"
              :disabled="isSaving"
              :aria-label="`Quantidade para alterar de ${prize.nome}`"
              @input="setQuantity(prize.id, $event.target.value)"
            />
            <button
              class="prize-quantity-button"
              type="button"
              :disabled="isSaving"
              :aria-label="`Adicionar quantidade ao prêmio ${prize.nome}`"
              @click="changeQuantity(prize, 'add')"
            >
              + Adicionar
            </button>
            <button
              class="prize-quantity-button is-remove"
              type="button"
              :disabled="isSaving || prize.quantityAvailable < 1"
              :aria-label="`Retirar quantidade do prêmio ${prize.nome}`"
              @click="changeQuantity(prize, 'remove')"
            >
              − Retirar
            </button>
          </div>
          <button
            v-if="!prize.utilizado"
            class="prize-delete-button"
            type="button"
            :aria-label="`Excluir prêmio ${prize.nome}`"
            :disabled="isSaving"
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

      <p
        v-if="!loading && !loadError"
        class="prizes-available-count"
        role="status"
        aria-live="polite"
      >
        {{ availableCount }}
        {{ availableCount === 1 ? 'prêmio disponível' : 'prêmios disponíveis' }}
      </p>
    </section>
  </div>
</template>
