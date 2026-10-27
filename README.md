# 🎉 Dia do Servidor — Prefeitura de Contagem

Sistema web de credenciamento e sorteios desenvolvido para auxiliar na organização de eventos da **Prefeitura Municipal de Contagem (MG)**.

O projeto tem como objetivo oferecer uma solução simples, intuitiva e responsiva para registrar a presença dos servidores, realizar sorteios e apresentar os contemplados em tempo real.

## 🚀 Funcionalidades previstas

- **Credenciamento:** consulta de servidores por matrícula ou CPF e confirmação de presença.
- **Controle de participação:** somente servidores presentes e ainda não contemplados poderão participar dos sorteios.
- **Sorteios:** seleção aleatória de participantes elegíveis, sem repetição de vencedores.
- **Prêmios:** cadastro opcional e associação ao vencedor no momento do sorteio.
- **Histórico:** consulta dos servidores contemplados e seus respectivos prêmios.
- **Modo Telão:** apresentação dos sorteios com animações e celebrações.
- **Responsividade:** interface adaptável a computadores, celulares e projetores.

## 🛠️ Tecnologias previstas

**Front-end**
- Vue.js 3
- Vite
- HTML5, CSS3 e JavaScript

**Back-end**
- Node.js
- Express.js
- JavaScript com ES Modules
- dotenv

**Banco de dados**
- SQLite com better-sqlite3

## 🎨 Interface

O projeto seguirá princípios de UX/UI, acessibilidade e desenvolvimento *mobile first*, utilizando uma identidade visual inspirada nas cores institucionais de Contagem.

A apresentação dos sorteios terá como referência a resolução HD (1280 × 720), com adaptação a diferentes tamanhos de tela.

## 📌 Status do projeto

🚧 **Em desenvolvimento**

O front-end está implementado. A estrutura inicial da API e do banco local está em desenvolvimento; as telas ainda não estão integradas ao back-end.

### Executar o back-end

```powershell
cd backend
npm install
Copy-Item .env.example .env
npm start
```

Por padrão, a API fica disponível em `http://127.0.0.1:3000`, e o banco é criado em `backend/data/dia-do-servidor.sqlite`. A rota `GET /api/health` verifica a API e a conexão com o SQLite.

### Ambiente SQLite de testes

O banco `backend/data/dia-do-servidor-teste.sqlite` é independente do banco oficial. Para iniciar a API de testes, use `npm run dev:teste`; o comando força o caminho do banco de testes mesmo que o terminal tenha outro `DB_PATH` definido e falha se o arquivo não existir.

Para restaurar os dados de teste a partir da cópia-base limpa e protegida contra gravação:

```powershell
npm run reset:teste
```

Encerre a API de testes antes do reset. Um bloqueio local impede a restauração enquanto o processo da API estiver ativo. O terminal informa `Banco TESTES` ou `Banco OFICIAL` e o caminho usado. `npm start` continua respeitando `DB_PATH`.

### API de credenciamento

Todas as rotas da API são locais (`127.0.0.1`):

- `GET /api/servidores?page=1&limit=50`: listagem paginada. Aceita `matricula` para pesquisa exata; resultados com a mesma matrícula em instituições diferentes permanecem separados por origem. O limite máximo é 100.
- `POST /api/credenciamentos`: confirma o servidor selecionado. Envie `{"servidorId": 123, "matricula": "00123"}`; a API exige que a matrícula pesquisada corresponda ao ID selecionado.
- `DELETE /api/credenciamentos/:servidorId`: desfaz a presença somente se o servidor não tiver sido contemplado.
- `GET /api/credenciamentos/indicadores`: retorna total de servidores, presenças confirmadas, pendentes e contemplados.

Exemplo de pesquisa:

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/servidores?matricula=00123"
```

### Prévia da importação de servidores

Configure `PREFEITURA_XLSX` e `CAMARA_PDF` no arquivo `backend/.env` com os caminhos locais dos documentos. A prévia não grava servidores:

```powershell
cd backend
npm run import:preview
```

Os cabeçalhos do Excel devem identificar as colunas de nome e matrícula. Ajuste `EXPECTED_PREFEITURA_RECORDS` e `EXPECTED_CAMARA_RECORDS` para os totais conferidos nos arquivos. A prévia informa referências de linha/página e não imprime nomes nem matrículas.

O comando `npm run import:apply` grava os registros somente quando não há dados inválidos, matrículas duplicadas dentro da mesma instituição ou divergência dos totais esperados. Registros existentes são ignorados sem atualização. A gravação é transacional e nunca é executada automaticamente.

Também é possível fornecer caminhos diretamente ao comando, sem colocá-los no `.env`:

```powershell
npm run import:preview -- --prefeitura "C:\caminho\Servidores.xlsx" --camara "C:\caminho\Relatorio.pdf"
```

## 🔒 Segurança

O sistema deverá impedir a participação de servidores não credenciados, evitar vencedores duplicados e proteger os dados pessoais utilizados no credenciamento.

---

Projeto desenvolvido para apoiar a organização de eventos da Prefeitura Municipal de Contagem.
