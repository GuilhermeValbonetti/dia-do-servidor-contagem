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
        Da chegada dos servidores à celebração dos vencedores, veja como conduzir cada etapa do Dia
        do Servidor.
      </p>
      <span class="guide-hero-decoration" aria-hidden="true">✦ ✦ ✦</span>
    </header>

    <section class="guide-grid" aria-label="Etapas do evento">
      <article class="guide-card" aria-labelledby="guide-step-1">
        <span class="guide-index">01</span>
        <span class="guide-icon guide-blue">
          <svg class="guide-icon-svg" aria-hidden="true"><use href="#guide-check" /></svg>
        </span>
        <h2 id="guide-step-1">Início</h2>
        <p>Acompanhe a situação do evento antes de seguir para a próxima atividade.</p>
        <ul>
          <li><strong>Presentes:</strong> servidores com presença confirmada.</li>
          <li><strong>Aptos:</strong> presentes que ainda não ganharam.</li>
          <li><strong>Contemplados:</strong> servidores que já foram sorteados.</li>
          <li><strong>Prêmios livres:</strong> unidades cadastradas e ainda não utilizadas.</li>
          <li>
            Veja os três últimos contemplados em destaque e até seis resultados recentes abaixo.
          </li>
          <li>
            Os dados são consultados ao voltar à tela. Um traço ou aviso de falha não significa zero
            registros.
          </li>
        </ul>
        <RouterLink class="guide-link" to="/">
          Ir para Início
          <svg class="guide-small-icon" aria-hidden="true"><use href="#guide-arrow" /></svg>
        </RouterLink>
      </article>
      <article class="guide-card" aria-labelledby="guide-step-2">
        <span class="guide-index">02</span>
        <span class="guide-icon guide-blue">
          <svg class="guide-icon-svg" aria-hidden="true"><use href="#guide-id" /></svg>
        </span>
        <h2 id="guide-step-2">Credenciamento</h2>
        <p>Identifique cada servidor presente antes de confirmar a participação.</p>
        <ul>
          <li>Participam servidores da Prefeitura e da Câmara Municipal de Contagem.</li>
          <li>
            Digite a matrícula completa, incluindo zeros à esquerda, e clique em
            <strong>Consultar</strong>. A busca por CPF não está disponível.
          </li>
          <li>Se a matrícula coincidir, confira o nome e a instituição antes de selecionar.</li>
          <li>
            Clique em <strong>Selecionar servidor</strong> e depois em
            <strong>Confirmar presença</strong>. Confirme no aviso somente se a pessoa estiver no
            evento.
          </li>
          <li>A listagem geral é para consulta; nela, não se confirma presença.</li>
          <li>
            Use <strong>Confirmados</strong>, <strong>Pendentes</strong> e a busca por nome na
            listagem. Os filtros consultam toda a base; use a paginação para ver os resultados.
          </li>
          <li>
            Confira as <strong>Presenças recentes</strong>. Para corrigir uma confirmação, clique em
            <strong>Desfazer</strong> ou <strong>Desfazer presença</strong> e confirme.
          </li>
          <li>
            Quem já foi contemplado mantém a presença: ela faz parte do registro definitivo do
            sorteio. Não é possível confirmar a mesma presença duas vezes.
          </li>
        </ul>
        <RouterLink class="guide-link" to="/credenciamento">
          Ir para Credenciamento
          <svg class="guide-small-icon" aria-hidden="true"><use href="#guide-arrow" /></svg>
        </RouterLink>
      </article>

      <article class="guide-card" aria-labelledby="guide-step-3">
        <span class="guide-index">03</span>
        <span class="guide-icon guide-gold">
          <svg class="guide-icon-svg" aria-hidden="true"><use href="#guide-gift" /></svg>
        </span>
        <h2 id="guide-step-3">Prêmios</h2>
        <p>O cadastro é opcional. Sorteios também podem acontecer sem prêmio associado.</p>
        <ul>
          <li>
            Preencha <strong>Nome do prêmio</strong> e clique em <strong>Adicionar</strong>. O nome
            deve ter até 90 caracteres.
          </li>
          <li>Cada registro representa uma unidade individual.</li>
          <li>Selecione um prêmio antes de iniciar o sorteio, se desejar associá-lo.</li>
          <li>
            A lista informa se cada unidade está <strong>Disponível</strong> ou
            <strong>Utilizado</strong>.
          </li>
          <li>
            Para excluir uma unidade disponível, clique no ícone de lixeira e confirme em
            <strong>Excluir prêmio</strong>.
          </li>
          <li>Prêmios utilizados não podem ser reutilizados nem excluídos.</li>
          <li>A associação ao contemplado é definitiva.</li>
        </ul>
        <RouterLink class="guide-link" to="/premios">
          Ir para Prêmios
          <svg class="guide-small-icon" aria-hidden="true"><use href="#guide-arrow" /></svg>
        </RouterLink>
      </article>

      <article class="guide-card" aria-labelledby="guide-step-4">
        <span class="guide-index">04</span>
        <span class="guide-icon guide-purple">
          <svg class="guide-icon-svg" aria-hidden="true"><use href="#guide-sparkles" /></svg>
        </span>
        <h2 id="guide-step-4">Realizar sorteio</h2>
        <p>Antes de começar, confira quantas pessoas estão elegíveis.</p>
        <ol class="guide-draw-steps">
          <li>Confira a quantidade de participantes aptos.</li>
          <li>Escolha um prêmio, se desejar.</li>
          <li>Clique em <strong>Iniciar sorteio</strong> ou pressione <strong>Espaço</strong>.</li>
          <li>Confira o resumo e clique em <strong>Confirmar e continuar</strong>.</li>
          <li>Acompanhe a animação e a revelação do resultado.</li>
        </ol>
        <p>
          O atalho Espaço abre a confirmação; o operador ainda precisa confirmar no modal. Ele só
          funciona com uma rodada preparada e participantes aptos, fora de campos de digitação,
          botões e outros controles interativos.
        </p>
        <p class="guide-rule">
          Participam apenas servidores presentes que ainda não ganharam. Sem pessoas aptas, não é
          possível iniciar outra rodada. O resultado é registrado automaticamente antes da revelação
          e não pode ser editado ou excluído. Use <strong>Preparar próximo sorteio</strong> para
          outra rodada.
        </p>
        <p>
          Se aparecer <strong>Recuperar operação pendente</strong>, use esse botão para consultar ou
          retomar a mesma solicitação. Não apague os dados do navegador para tentar resolver uma
          falha.
        </p>
        <RouterLink class="guide-link" to="/sorteio">
          Ir para Sorteio
          <svg class="guide-small-icon" aria-hidden="true"><use href="#guide-arrow" /></svg>
        </RouterLink>
      </article>

      <article class="guide-card" aria-labelledby="guide-step-5">
        <span class="guide-index">05</span>
        <span class="guide-icon guide-purple">
          <svg class="guide-icon-svg" aria-hidden="true"><use href="#guide-trophy" /></svg>
        </span>
        <h2 id="guide-step-5">Vencedores</h2>
        <p>Consulte os resultados registrados durante o evento.</p>
        <ul>
          <li>
            Confira nome, matrícula, instituição, número da rodada, data e hora e prêmio. Quando não
            houver prêmio, o registro informa isso.
          </li>
          <li>
            Os três últimos contemplados aparecem em destaque. Os demais ficam abaixo; use
            <strong>Anterior</strong> e <strong>Próxima</strong> para percorrer o histórico.
          </li>
          <li>
            Use <strong>Celebrar ganhador</strong> para uma pessoa ou
            <strong>Celebrar todos</strong> para a celebração coletiva. Quando houver várias
            páginas, navegue dentro da celebração.
          </li>
          <li>
            Celebrar apenas reapresenta os vencedores: não realiza outro sorteio nem altera
            resultados.
          </li>
          <li>Os resultados não podem ser editados ou excluídos pela interface.</li>
        </ul>
        <RouterLink class="guide-link" to="/vencedores">
          Ver vencedores
          <svg class="guide-small-icon" aria-hidden="true"><use href="#guide-arrow" /></svg>
        </RouterLink>
      </article>

      <article class="guide-card guide-telão-card" aria-labelledby="guide-step-6">
        <span class="guide-index">06</span>
        <span class="guide-icon guide-blue">
          <svg class="guide-icon-svg" aria-hidden="true"><use href="#guide-monitor" /></svg>
        </span>
        <h2 id="guide-step-6">Modo Telão</h2>
        <p>Apresente ao público o mesmo resultado confirmado na tela do operador.</p>
        <ol class="guide-draw-steps">
          <li>
            Na tela Sorteio, clique em <strong>Abrir Telão</strong>. Se a janela for bloqueada, use
            o link para abrir em uma nova aba.
          </li>
          <li>
            Mantenha as duas telas abertas no mesmo navegador. Leve a janela do Telão para o
            projetor ou TV e clique em <strong>Tela cheia</strong>.
          </li>
          <li>
            Conduza o sorteio pela tela do operador. O Telão acompanha a animação e mostra o
            resultado registrado.
          </li>
          <li>
            Os confetes aparecem automaticamente ao revelar um novo vencedor. As ações de celebração
            ficam nas telas Sorteio e Vencedores.
          </li>
        </ol>
        <p class="guide-rule">
          Se houver desconexão, mantenha a tela do operador aberta e aguarde a reconexão. Ao
          recarregar o Telão, ele recupera a apresentação sem sortear novamente. Se reabrir a tela
          do operador, abra o Telão pelo botão dessa nova tela.
        </p>
        <RouterLink class="guide-link" to="/sorteio">
          Abrir Sorteio para usar o Telão
          <svg class="guide-small-icon" aria-hidden="true"><use href="#guide-arrow" /></svg>
        </RouterLink>
      </article>
    </section>

    <aside class="guide-note" aria-label="Informações importantes">
      <svg class="guide-note-icon" aria-hidden="true"><use href="#guide-info" /></svg>
      <div>
        <strong>Antes de começar e em caso de falha</strong>
        <p>
          A base de servidores já está cadastrada. Confira a conexão com o sistema antes de iniciar
          o atendimento. Se uma consulta falhar, use <strong>Tentar novamente</strong> ou volte à
          tela após restabelecer a conexão. Antes de iniciar outra rodada após uma falha, confira
          Vencedores e recupere a operação pendente, quando houver. Os resultados concluídos
          permanecem registrados.
        </p>
      </div>
    </aside>
  </div>
</template>
