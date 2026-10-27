<script setup>
import { RouterLink } from 'vue-router'
import './GuiaView.css'
</script>

<template>
  <svg class="guide-icon-library" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <symbol id="guide-id" viewBox="0 0 24 24">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <path d="M4 17c0-2 2-3 4-3s4 1 4 3m3-7h5m-5 4h4" />
    </symbol>
    <symbol id="guide-gift" viewBox="0 0 24 24">
      <path
        d="M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9H7.5a2.5 2.5 0 1 1 2.2-3.7L12 9zm0 0h4.5a2.5 2.5 0 1 0-2.2-3.7L12 9z"
      />
    </symbol>
    <symbol id="guide-sparkles" viewBox="0 0 24 24">
      <path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3z" />
      <path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </symbol>
    <symbol id="guide-trophy" viewBox="0 0 24 24">
      <path
        d="M8 21h8M12 17v4M7 3h10v7a5 5 0 0 1-10 0V3zM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4"
      />
    </symbol>
    <symbol id="guide-monitor" viewBox="0 0 24 24">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </symbol>
    <symbol id="guide-check" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </symbol>
    <symbol id="guide-info" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8h.01" />
    </symbol>
    <symbol id="guide-arrow" viewBox="0 0 24 24">
      <path d="M4 12h16m-7-7 7 7-7 7" />
    </symbol>
  </svg>

  <div class="guide-view">
    <header class="guide-hero">
      <span class="guide-label">GUIA RÁPIDO DO EVENTO</span>
      <h1>Simples de usar. Fácil de acompanhar.</h1>
      <p>
        Da preparação da base à consulta dos resultados, veja como conduzir cada etapa do Dia do
        Servidor.
      </p>
      <span class="guide-hero-decoration" aria-hidden="true">✦ ✦ ✦</span>
    </header>

    <section class="guide-grid" aria-label="Etapas do evento">
      <article class="guide-card" aria-labelledby="guide-step-1">
        <span class="guide-index">01</span>
        <span class="guide-icon guide-blue">
          <svg class="guide-icon-svg" aria-hidden="true"><use href="#guide-id" /></svg>
        </span>
        <h2 id="guide-step-1">Credenciamento</h2>
        <p>Identifique cada servidor presente antes de confirmar a participação.</p>
        <ul>
          <li>Participam servidores da Prefeitura e da Câmara Municipal de Contagem.</li>
          <li>Pesquise pela matrícula ou CPF, conforme os dados disponíveis.</li>
          <li>Se a matrícula coincidir, confira o nome e a instituição antes de selecionar.</li>
          <li>Confirme somente após localizar a pessoa correta.</li>
          <li>A listagem geral é para consulta; nela, não se confirma presença.</li>
          <li>É possível desfazer a presença se a pessoa ainda não foi contemplada.</li>
        </ul>
        <RouterLink class="guide-link" to="/credenciamento">
          Ir para Credenciamento
          <svg class="guide-small-icon" aria-hidden="true"><use href="#guide-arrow" /></svg>
        </RouterLink>
      </article>

      <article class="guide-card" aria-labelledby="guide-step-2">
        <span class="guide-index">02</span>
        <span class="guide-icon guide-gold">
          <svg class="guide-icon-svg" aria-hidden="true"><use href="#guide-gift" /></svg>
        </span>
        <h2 id="guide-step-2">Prêmios</h2>
        <p>O cadastro é opcional. Sorteios também podem acontecer sem prêmio associado.</p>
        <ul>
          <li>Cadastre os prêmios antes de realizar os sorteios.</li>
          <li>Cada registro representa uma unidade individual.</li>
          <li>Selecione um prêmio antes de iniciar o sorteio, se desejar associá-lo.</li>
          <li>Prêmios utilizados não podem ser reutilizados nem excluídos.</li>
          <li>A associação ao contemplado é definitiva.</li>
        </ul>
        <RouterLink class="guide-link" to="/premios">
          Ir para Prêmios
          <svg class="guide-small-icon" aria-hidden="true"><use href="#guide-arrow" /></svg>
        </RouterLink>
      </article>

      <article class="guide-card" aria-labelledby="guide-step-3">
        <span class="guide-index">03</span>
        <span class="guide-icon guide-purple">
          <svg class="guide-icon-svg" aria-hidden="true"><use href="#guide-sparkles" /></svg>
        </span>
        <h2 id="guide-step-3">Realizar sorteio</h2>
        <p>Antes de começar, confira quantas pessoas estão elegíveis.</p>
        <ol class="guide-draw-steps">
          <li>Confira a quantidade de participantes aptos.</li>
          <li>Escolha um prêmio, se desejar.</li>
          <li>Clique em <strong>Iniciar sorteio</strong>.</li>
          <li>Confirme a operação.</li>
          <li>Acompanhe a animação e a revelação do resultado.</li>
        </ol>
        <p class="guide-rule">
          Participam apenas servidores com presença confirmada e ainda não contemplados. A animação
          é visual; o resultado é registrado uma única vez.
        </p>
        <RouterLink class="guide-link" to="/sorteio">
          Ir para Sorteio
          <svg class="guide-small-icon" aria-hidden="true"><use href="#guide-arrow" /></svg>
        </RouterLink>
      </article>

      <article class="guide-card" aria-labelledby="guide-step-4">
        <span class="guide-index">04</span>
        <span class="guide-icon guide-purple">
          <svg class="guide-icon-svg" aria-hidden="true"><use href="#guide-trophy" /></svg>
        </span>
        <h2 id="guide-step-4">Vencedores</h2>
        <p>Consulte os resultados registrados durante o evento.</p>
        <ul>
          <li>Confira os servidores contemplados e os prêmios associados.</li>
          <li>É possível celebrar um ganhador individualmente ou todos juntos.</li>
          <li>Os resultados não podem ser editados ou excluídos pela interface.</li>
        </ul>
        <RouterLink class="guide-link" to="/vencedores">
          Ver vencedores
          <svg class="guide-small-icon" aria-hidden="true"><use href="#guide-arrow" /></svg>
        </RouterLink>
      </article>

      <article class="guide-card guide-telão-card" aria-labelledby="guide-step-5">
        <span class="guide-index">05</span>
        <span class="guide-icon guide-blue">
          <svg class="guide-icon-svg" aria-hidden="true"><use href="#guide-monitor" /></svg>
        </span>
        <span class="guide-status">EM DESENVOLVIMENTO</span>
        <h2 id="guide-step-5">Modo Telão</h2>
        <p>
          O Modo Telão foi pensado para apresentar o sorteio em uma TV ou projetor, com a animação e
          o vencedor em destaque. Ainda não está disponível nesta etapa.
        </p>
      </article>
    </section>

    <aside class="guide-note" aria-label="Informações importantes">
      <svg class="guide-note-icon" aria-hidden="true"><use href="#guide-info" /></svg>
      <div>
        <strong>Antes do credenciamento</strong>
        <p>
          A base de servidores da Prefeitura e da Câmara deverá estar preparada antes do evento. A
          importação ainda não está disponível nesta versão. Os dados demonstrativos das telas são
          locais e independentes.
        </p>
      </div>
    </aside>
  </div>
</template>
