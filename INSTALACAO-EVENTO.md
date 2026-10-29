# Instalação e operação no Windows

> Este manual descreve a implementação removida em `backend/`; os comandos, bancos e modos oficial/teste abaixo não se aplicam ao backend atual em `server/`. Use o início rápido do [README](README.md) e confirme com o responsável técnico o banco correto antes de operar.

Sistema Dia do Servidor — Prefeitura Municipal de Contagem/MG. A instalação de dependências requer internet; a operação usa serviços e arquivos locais em um notebook conectado ao projetor.

## Preparar um notebook novo

Instale Git para Windows e **Node.js 26.7.0**, com npm. Abra um novo PowerShell:

```powershell
git --version
node --version
npm.cmd --version
```

Confira `v26.7.0` em todos os terminais. Se usar um gerenciador de versões, selecione essa versão antes de instalar e executar. Erros de `NODE_MODULE_VERSION` indicam incompatibilidade com o módulo SQLite nativo; volte à versão validada. Não troque versões durante o evento.

Substitua `URL_DO_REPOSITORIO` pelo endereço fornecido pelo responsável. Clone e instale:

```powershell
git clone "URL_DO_REPOSITORIO" dia-do-servidor-contagem
cd dia-do-servidor-contagem
cd backend
npm.cmd ci
cd ../frontend
npm.cmd ci
cd ..
```

Não copie node_modules de outro computador. Se a instalação do better-sqlite3 falhar, resolva com o responsável técnico antes de continuar.

## Transferir os bancos por pendrive autorizado

Os bancos não estão no Git. No computador de origem, encerre a API e prepare cópias consistentes e validadas pelo procedimento de backup abaixo. Transporte:

- `dia-do-servidor.sqlite`: oficial.
- `dia-do-servidor-teste.sqlite`: simulações.
- `dia-do-servidor-teste-base.sqlite`: restauração limpa de testes.

Na raiz do projeto novo:

```powershell
New-Item -ItemType Directory -Force backend/data
```

Copie os três arquivos validados para `backend/data/`, mantendo esses nomes. Não sobrescreva uma instalação já utilizada sem autorização e backup. Não transporte só o arquivo principal de banco ativo em WAL: dados confirmados podem estar no `-wal`.

Restaure a proteção da base limpa se ela não tiver sido preservada na transferência:

```powershell
Set-ItemProperty -LiteralPath backend/data/dia-do-servidor-teste-base.sqlite -Name IsReadOnly -Value $true
Get-Item backend/data/*.sqlite | Select-Object Name,Length,IsReadOnly
```

Valide os arquivos recebidos conforme a seção de backup. Esperado: 13.305 servidores, 13.138 da Prefeitura com local e 167 da Câmara sem local. Oficial e base limpa devem ter zero credenciamentos, prêmios e sorteios antes do evento.

## Iniciar o oficial e o front-end

Em um PowerShell na raiz do projeto, com Node 26.7.0:

```powershell
cd backend
$env:DB_PATH = './data/dia-do-servidor.sqlite'
$env:PORT = '3000'
Test-Path $env:DB_PATH
npm.cmd start
```

`Test-Path` deve retornar `True`. Confira **Banco OFICIAL**, o caminho completo esperado e a mensagem da API em `http://127.0.0.1:3000`. Se aparecer TESTES ou CONFIGURADO, não opere. Arquivo ausente, estrutura incompleta ou base sem servidores bloqueiam a inicialização: confira o caminho e transfira a base validada; não crie banco vazio.

`DB_PATH` do terminal prevalece sobre `.env`, que é opcional. Não use `NODE_ENV=test` para operar: esse valor é reservado à criação de fixtures automatizadas descartáveis.

Em outro terminal na raiz, também com Node 26.7.0:

```powershell
cd frontend
npm.cmd run dev
```

Abra a URL exibida pelo Vite, normalmente `http://localhost:5173`. Se a porta estiver ocupada, use a URL efetivamente informada. Operador e Telão devem usar a mesma origem: não misture localhost com 127.0.0.1.

O roteiro usa o Vite com o proxy `/api` já configurado. `npm run build` gera e valida os arquivos, mas não inicia o sistema completo; não abra `dist/index.html` diretamente.

## Conferir API e ambiente

Em outro terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

Espere `status = ok`, `database = connected`, `ambiente = oficial` e **BASE OFICIAL** no Credenciamento. Para testes, espere `ambiente = testes` e **AMBIENTE DE TESTES**. Diante de **AMBIENTE NÃO CONFIRMADO**, confira a API e atualize a página. Caminhos locais só aparecem no terminal.

## Simular exclusivamente em testes

Encerre a API oficial com Ctrl+C. Em `backend`:

```powershell
npm.cmd run dev:teste
```

O script força o caminho de testes mesmo com outro DB_PATH no terminal. Confira **Banco TESTES**, health e o aviso no Credenciamento. Uma única API deve ocupar a porta 3000. Atualize as páginas ao trocar de ambiente.

Confirme presenças, cadastre um prêmio opcional, abra Sorteio e Telão e teste rodadas, teclado, recarga e recuperação. As ações ficam registradas no banco de testes. Use um perfil de navegador para simulações e outro para o oficial; dentro de cada perfil, operador e Telão usam o mesmo navegador/origem. Não leve uma operação pendente de testes para o evento.

O comando existente `npm.cmd run reset:teste` apaga operações de testes e restaura a base limpa. Execute somente quando solicitado, depois de backup e com a API de testes encerrada. Não use reset para instalar ou resolver falhas de sorteio. Para voltar ao oficial, encerre testes e siga novamente a inicialização oficial.

## Projetor e Espaço

1. Conecte o projetor. Windows+P → **Estender**. Ajuste para 1280 × 720 quando adequado ao equipamento.
2. Na tela Sorteio, clique em **Abrir Telão** e permita a janela se necessário.
3. Mova o Telão ao projetor e clique em **Tela cheia**.
4. Mantenha ambas as janelas abertas e volte o foco ao operador para usar o teclado.
5. Confira os aptos e escolha um prêmio opcional. Clique em **Iniciar sorteio** ou pressione **Espaço**, fora de campos, botões e controles.
6. Confira o resumo e confirme no modal em **Confirmar e continuar**. Espaço não dispensa a confirmação.
7. Aguarde a revelação e confira o histórico antes de preparar outra rodada.
8. Use **Preparar próximo sorteio** para liberar outra rodada.

Somente credenciados ainda não contemplados participam. Sem elegíveis não há rodada. Espaço repetido ou mantido pressionado não gera múltiplos sorteios. Os números em movimento são apenas visuais; o resultado real é registrado pela API antes da revelação. O Telão apenas apresenta, sem controlar novas rodadas.

## Backup consistente e validação

Faça backup antes/depois do evento e antes de manutenção autorizada. Em `backend`, com Node 26.7.0, cole no PowerShell:

```powershell
@'
import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
const source = './data/dia-do-servidor.sqlite'
const destination = './data/dia-do-servidor-backup-' + Date.now() + '.sqlite'
if (existsSync(destination)) throw new Error('Destino já existe')
const db = new Database(source, { readonly: true, fileMustExist: true })
try { await db.backup(destination) } finally { db.close() }
const backup = new Database(destination, { readonly: true, fileMustExist: true })
try {
  if (backup.pragma('integrity_check', { simple: true }) !== 'ok' ||
      backup.pragma('foreign_key_check').length) throw new Error('Backup inválido')
  for (const table of ['servidores', 'credenciamentos', 'premios', 'sorteios'])
    console.log(table, backup.prepare('SELECT COUNT(*) total FROM ' + table).get().total)
  console.log('Backup validado:', destination)
} finally { backup.close() }
'@ | node --input-type=module -
```

Esse método usa a API de backup SQLite, incluindo dados confirmados em WAL, sem alterar os dados da origem. Para testes/base limpa, ajuste somente `source` e o prefixo de `destination`. Nunca use um dos três bancos operacionais como destino. Copie o backup validado ao pendrive autorizado e mantenha a cópia local. No notebook novo, transfira-o com o nome operacional correspondente.

Para validar os três arquivos recebidos, execute em `backend`. O trecho apenas lê os bancos:

```powershell
@'
import Database from 'better-sqlite3'
for (const name of ['dia-do-servidor', 'dia-do-servidor-teste', 'dia-do-servidor-teste-base']) {
  const db = new Database('./data/' + name + '.sqlite', { readonly: true, fileMustExist: true })
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok' ||
        db.pragma('foreign_key_check').length) throw new Error('Integridade inválida: ' + name)
    const total = db.prepare('SELECT COUNT(*) n FROM servidores').get().n
    const prefeitura = db.prepare("SELECT COUNT(*) n FROM servidores WHERE origem='prefeitura' AND length(trim(local_trabalho_codigo))>0 AND length(trim(local_trabalho_descricao))>0").get().n
    const camara = db.prepare("SELECT COUNT(*) n FROM servidores WHERE origem='camara' AND local_trabalho_codigo IS NULL AND local_trabalho_descricao IS NULL").get().n
    if (total !== 13305 || prefeitura !== 13138 || camara !== 167)
      throw new Error('Base de servidores divergente: ' + name)
    console.log(name, 'íntegro; servidores e locais conferidos')
    for (const table of ['credenciamentos', 'premios', 'sorteios'])
      console.log(table, db.prepare('SELECT COUNT(*) n FROM ' + table).get().n)
  } finally { db.close() }
}
'@ | node --input-type=module -
```

Compare as contagens com o estado esperado da instalação. Qualquer erro impede a liberação até avaliação técnica. Não restaure backup sobre a operação em andamento.

## Falhas e encerramento

- **Sem conexão:** suspenda novas rodadas, confira terminais e health. Se necessário, reinicie a API com o mesmo banco e atualize os dados na tela.
- **Resposta de sorteio perdida:** confira Vencedores e use **Recuperar operação pendente**. A mesma chave recupera a solicitação. Não apague localStorage, não faça reset e não crie rodada para substituir resultado que pode já existir.
- **Telão desconectado:** mantenha o operador aberto. Recarregar o Telão recupera o estado. Se reabrir o operador, abra o Telão pelo botão da nova sessão.
- **Porta 3000 ocupada:** identifique e encerre a API anterior; não inicie APIs paralelas nem altere portas sem revisar o proxy.
- **Erro de banco ou Node:** pare e procure o responsável técnico. Não reinstale, migre ou substitua bancos por tentativa durante o evento.

Para encerrar: aguarde concluir ou recuperar operações pendentes, confira o último resultado, Ctrl+C na API e depois no Vite. Faça e valide o backup final antes de desligar.

Antes da liberação, ensaie no notebook/projetor reais: leitura à distância, matrícula longa, foco do teclado, Espaço com confirmação, confetes, recarga e recuperação. Mantenha alimentação elétrica e evite suspensão automática. Desenvolvimento concluído não substitui homologação presencial.
