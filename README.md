# Dia do Servidor — Prefeitura Municipal de Contagem/MG

Sistema local de credenciamento, prêmios, sorteios e apresentação de vencedores em projetor. Vue 3 + Vite, Node.js + Express e SQLite com better-sqlite3.

Desenvolvimento concluído, sujeito à homologação presencial no notebook e projetor do evento.

## Instalação e operação

Siga [INSTALACAO-EVENTO.md](INSTALACAO-EVENTO.md) para preparar um Windows novo, transferir os bancos, simular, fazer backups e recuperar operações.

Versão utilizada na validação: **Node.js 26.7.0**, com npm. Instale e execute com a mesma versão; o módulo SQLite é nativo. Não copie node_modules de outro computador.

Após clonar, instale as dependências:

```powershell
cd backend
npm.cmd ci
cd ../frontend
npm.cmd ci
```

Os bancos não vêm no Git. Transfira os três SQLite validados para `backend/data/`, conforme o manual. A inicialização normal exige arquivo existente, tabelas essenciais e servidores cadastrados; não cria ou repara bancos.

Em um terminal na pasta `backend`:

```powershell
$env:DB_PATH = './data/dia-do-servidor.sqlite'
$env:PORT = '3000'
npm.cmd start
```

Em outro terminal na pasta `frontend`:

```powershell
npm.cmd run dev
```

Abra a URL mostrada pelo Vite, normalmente `http://localhost:5173`. Confira **Banco OFICIAL** e o caminho no terminal da API. `GET /api/health` retorna `status`, `database` e `ambiente`, sem caminhos locais. O Credenciamento distingue a base oficial do ambiente de testes.

## Funcionalidades implementadas

- Início e Sidebar: indicadores reais e últimos vencedores.
- Credenciamento: matrícula exata, instituição, local de trabalho, busca por nome, filtros globais e paginação. CPF não está disponível. Presença duplicada é bloqueada; presença de vencedor não pode ser desfeita.
- Prêmios: cadastro, listagem e exclusão somente de unidades disponíveis.
- Sorteio: seleção exclusivamente pelo back-end entre presentes ainda não contemplados, prêmio opcional, transação e idempotência persistente. Resultados definitivos.
- Espaço: inicia o fluxo do botão, com confirmação no modal; não atua em campos, controles, modais ou rodada em andamento.
- Telão: sessão sincronizada, animação visual, resultado confirmado pela API, confetes e recuperação sem novo sorteio.
- Vencedores: histórico paginado e celebrações que apenas reapresentam resultados.
- Guia: instruções de uso no próprio sistema.

## Ambiente de testes

Encerre a API anterior e execute em `backend`:

```powershell
npm.cmd run dev:teste
```

Esse script força o banco de testes, verifica isolamento e usa bloqueio contra reset concorrente. Confira **Banco TESTES** no terminal e **AMBIENTE DE TESTES** no Credenciamento antes de simular. Mantenha apenas uma API na porta 3000.

`npm.cmd run reset:teste` restaura exclusivamente testes a partir da base limpa protegida. Apaga operações de testes: só use quando solicitado, após backup e com a API de testes encerrada. Não faz parte da instalação ou operação do evento.

## Qualidade

```powershell
# backend
npm.cmd test

# frontend
npm.cmd run build
node node_modules/eslint/bin/eslint.js .
node node_modules/oxlint/bin/oxlint .
node node_modules/prettier/bin/prettier.cjs --check src/
```

Testes com escrita usam bancos descartáveis. `npm run lint` e `npm run format` fazem correções automáticas; os comandos acima apenas verificam o código.

Consulte [contratos e recuperação](backend/SORTEIOS.md) e o [histórico dos locais de trabalho](backend/PLANO-LOCAL-DE-TRABALHO.md). Importação, migração e reset não fazem parte da operação do evento. Preserve bancos, backups e documentos pessoais fora do Git.
