# API de Sorteios — etapa 3

O servidor seleciona um registro uniformemente com `crypto.randomInt`, considerando somente IDs credenciados que ainda não constam em `sorteios`. Nome e matrícula não são usados para deduplicar pessoas.

## Contratos

- `GET /api/sorteios?page=1&limit=20`: histórico em ordem decrescente de número, com `dados`, `paginacao` e `indicadores` (`presencasConfirmadas`, `servidoresContemplados`, `elegiveis`, `proximoNumero`). Limite máximo: 100.
- `GET /api/sorteios?chave=<chave>`: consulta somente leitura do resultado de uma operação. Retorna `dados: []` se ela não foi registrada.
- `GET /api/sorteios/:id`: resultado persistido, usado pelo Telão para confirmar os dados recebidos pelo canal.
- `POST /api/sorteios`: recebe `{ "chave": "UUID da operação", "numeroEsperado": 1, "premioId": null }`. `premioId` pode ser omitido. A chave deve conter entre 16 e 80 letras, números ou hífens.

Cada resultado contém `id`, `numero`, `participanteId`, `nome`, `matricula`, `origem`, `sorteadoEm`, `premioId` e `premioNome`. Os campos de prêmio são `null` quando não houver associação.

O POST retorna 201 para uma nova operação e 200 ao repetir uma operação concluída com o mesmo prêmio e número. Uma chave reutilizada com dados diferentes, uma rodada desatualizada, um prêmio utilizado ou a ausência de elegíveis resultam em 409. Prêmio inexistente retorna 404; entrada inválida, 400. Banco ocupado retorna 503; falhas inesperadas retornam 500 e desfazem a transação.

## Idempotência e mudança aditiva no schema

A primeira operação válida cria, dentro da transação, a tabela auxiliar `sorteio_solicitacoes(chave TEXT PRIMARY KEY NOT NULL, sorteio_id INTEGER NOT NULL UNIQUE REFERENCES sorteios(id) ON DELETE RESTRICT)`.

Não há alteração das tabelas existentes, exclusão ou reimportação de dados. A nova tabela relaciona a solicitação ao resultado oficial em `sorteios`; não é outro histórico de vencedores. GETs e registro das rotas não criam essa tabela. Se o primeiro sorteio falhar, sua criação também sofre rollback.

`BEGIN IMMEDIATE` protege, como uma única operação, a recuperação por chave, a conferência da rodada e do prêmio, a seleção do vencedor e a gravação do resultado e da chave. Os índices únicos e triggers já existentes continuam impedindo vencedor e prêmio repetidos, edição/exclusão de resultados e retirada da presença de contemplados.

## Recuperação e apresentação

O navegador grava a solicitação em `localStorage` **antes** do POST. Uma falha de rede ou resposta 5xx preserva a chave. O botão de recuperação reenvia os mesmos dados; não gera uma nova chave. Não limpe o armazenamento do navegador para resolver uma resposta perdida: use a recuperação e confira o histórico.

Ao abrir ou atualizar a tela, a recuperação usa GET e mostra o último resultado como snapshot, sem realizar outro sorteio. Uma resposta HTTP definitiva de rejeição (400, 404 ou 409) encerra a solicitação pendente. Para realizar outra rodada, o operador prepara o próximo sorteio.

BroadcastChannel continua responsável por sessão, snapshot, animação, heartbeat e desconexão. O Telão confirma o ID na API e usa seus dados canônicos. Snapshots não acionam confetes nem animações de entrada. Sem conexão com o operador, o último sorteio pode ser recuperado pela API como histórico, sem revelar uma nova rodada automaticamente. Se o operador for reaberto com outra sessão, abra o Telão pelo botão dessa nova sessão.

## Homologação manual

Use Node 26.7.0, compatível com o módulo nativo instalado, e `npm run dev:teste` em `backend`; inicie `npm run dev` em `frontend`. Confira no terminal que o banco selecionado é o de testes. Não execute reset nem use o banco oficial.

1. Cadastre presenças e, opcionalmente, prêmios pelas telas próprias. Abra Sorteio e confira os indicadores e as opções disponíveis.
2. Abra o Telão antes da rodada e realize um sorteio. Compare ID/número, nome, matrícula, instituição e prêmio com `GET /api/sorteios?limit=1`.
3. Prepare outra rodada, teste sem prêmio e com prêmio. O prêmio utilizado deve sair das opções; o vencedor não pode participar novamente.
4. Clique repetidamente e tente a mesma rodada em duas janelas. Só uma operação nova deve ser gravada para o número esperado.
5. Abra/recarregue o Telão durante e depois da animação. Confira snapshot, celebração manual, desconexão e reconexão da mesma sessão.
6. Interrompa a API, tente iniciar e depois retome-a. Use a recuperação da operação pendente. Confira que uma resposta perdida não produz um segundo resultado.
7. Reabra o operador e confira o resultado recuperado sem novo POST. Para a nova sessão, abra novamente o Telão pelo botão.
8. Confira projeção em 1280 × 720, responsividade, legibilidade e preferência por movimento reduzido.

As rodadas de homologação ficam definitivamente registradas no banco de testes. Nesta implementação, os testes automatizados escrevem somente em arquivos temporários descartáveis; não executam rodadas no banco manual.
