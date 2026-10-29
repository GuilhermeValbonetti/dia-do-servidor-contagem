# Dia do Servidor — Prefeitura Municipal de Contagem/MG

Sistema local de credenciamento, prêmios, sorteios e apresentação de vencedores em projetor. Vue 3 + Vite no frontend; Express, TypeScript, Prisma e SQLite no backend em `server`.

Desenvolvimento concluído, sujeito à homologação presencial no notebook e projetor do evento.

## Instalação e operação

O guia [DISTRIBUICAO-WINDOWS.md](DISTRIBUICAO-WINDOWS.md) explica como compilar e empacotar o inicializador Windows, incluindo runtime Node.js, frontend e API. O documento [INSTALACAO-EVENTO.md](INSTALACAO-EVENTO.md) descreve uma implementação antiga em `backend` e não deve ser usado para configurar a versão atual.

Para desenvolvimento e build, use Node.js **22.18 ou superior da linha 22, ou 24.12 ou superior**. O módulo SQLite é nativo; instale as dependências no mesmo computador em que fará o build.

Após clonar, instale as dependências:

```powershell
cd server
npm.cmd ci
cd ..\frontend
npm.cmd ci
```

No desenvolvimento, o servidor usa `DATABASE_URL` (padrão `file:./data/sorteio.db`) e `PORT` (padrão `3001`). No pacote Windows, o banco fica em `%LOCALAPPDATA%\DiaDoServidor\data\sorteio.db`, separado dos arquivos atualizáveis do programa. O proxy padrão do Vite já aponta para a porta `3001`; ajuste `VITE_API_PROXY_TARGET` em `frontend/.env.local` somente se alterar essa porta.

Em um terminal na pasta `server`:

```powershell
npm.cmd run dev
```

Em outro terminal, configure o proxy (se necessário) e inicie o frontend:

```powershell
cd frontend
Copy-Item .env.example .env.local
npm.cmd run dev
```

Abra a URL mostrada pelo Vite, normalmente `http://localhost:5173`. A API escuta em `127.0.0.1`; o Vite encaminha as chamadas `/api` ao endereço configurado no proxy.

## Funcionalidades implementadas

- Início e Sidebar: indicadores e últimos vencedores consultados na API.
- Credenciamento: busca, filtros de presença, paginação e registro do horário das confirmações.
- Prêmios: cadastro, controle de estoque, exclusão individual e exclusão em lote.
- Sorteio: seleção exclusivamente pelo back-end entre participantes elegíveis; sessão de sorteio e prêmio opcional. A recuperação da confirmação usa o ID da sessão mantido no navegador.
- Espaço: inicia o fluxo do botão, com confirmação no modal; não atua em campos, controles, modais ou rodada em andamento.
- Telão: sessão sincronizada, animação visual, resultado confirmado pela API, confetes e recuperação sem novo sorteio.
- Vencedores: histórico paginado, celebrações e reinicialização dos sorteios, presenças e estoques para reutilizar o sistema.
- Guia: instruções de uso no próprio sistema.

## Qualidade

```powershell
# backend
cd server
npm.cmd run type-check

# frontend
cd ..\frontend
npm.cmd run build
```

As rotas implementadas estão em `server/src/routes`. A API não identifica se a base é oficial ou de testes; o pacote Windows usa um único banco local persistente por usuário.
