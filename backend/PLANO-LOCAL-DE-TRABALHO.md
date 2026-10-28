# Local de trabalho — investigação e plano para aprovação

Parte A concluída em 28/10/2026. Este documento não executa migrações. Nenhuma alteração de schema ou complementação foi aplicada aos bancos oficial, de testes manuais ou base limpa.

## Fontes verificadas

Em `arquivos funcionarios/Servidores_Ativos_Corrigido.xlsx`, a primeira linha contém:

| Coluna | Cabeçalho | Uso proposto |
| --- | --- | --- |
| A | FOLHA | Não interpretar como secretaria ou local |
| B | NOME | Conferência adicional, nunca chave de associação |
| C | MATRICULA | Associação exata como texto, combinada com origem `prefeitura` |
| D | COD LOCAL DE TRABALHO | Código do local, preservado como texto |
| E | DESCR LOCAL DE TRABALHO | Descrição do local, exibida com o rótulo “Local de trabalho” |

Há 13.138 registros e 13.138 matrículas distintas, sem matrícula vazia. Todos possuem código e descrição de local. Foram encontrados 913 códigos distintos e 898 descrições distintas. Não deduplicar por descrição nem supor correspondência única entre descrição e código. Não existe uma coluna específica de secretaria, órgão ou lotação: não extrair uma secretaria presumida dos textos.

O PDF `arquivos funcionarios/Relatorio Servidores da Câmara (1).pdf` tem quatro páginas com as colunas `SERVIDOR` e `MATRICULA`. A leitura existente identifica 167 registros válidos, sem inválidos. O documento não fornece uma coluna de secretaria ou local por servidor. Esses registros devem permanecer sem informação adicional; não atribuir um local genérico inventado.

## SQLite e importação existentes

Nos três bancos, `servidores` contém apenas `id`, `nome`, `matricula`, `origem` e `cpf`. Os locais ficaram fora da importação: `readPrefeituraExcel` extrai nome, matrícula, origem e referência de linha; `applyImport` insere somente nome, matrícula e origem. O leitor da Câmara também extrai somente identidade.

As 13.138 matrículas da Prefeitura correspondem exatamente aos registros da Prefeitura em cada um dos três bancos: nenhum registro ausente na fonte ou no banco, nenhuma duplicidade na fonte e nenhuma divergência de nome na conferência. A associação é feita pela matrícula e origem, não pelo nome. Os 167 registros da Câmara continuam separados, inclusive diante de matrículas iguais entre instituições.

Consultas somente leitura encontraram:

| Banco | Servidores | Credenciamentos | Prêmios | Sorteios | Erros de chave estrangeira |
| --- | ---: | ---: | ---: | ---: | ---: |
| Oficial | 13.305 | 0 | 0 | 0 | 0 |
| Testes manuais | 13.305 | 5 | 2 | 5 | 0 |
| Base limpa | 13.305 | 0 | 0 | 0 | 0 |

## Alteração mínima proposta — ainda não aplicada

Adicionar duas colunas opcionais à própria tabela `servidores`, sem recriação:

```sql
ALTER TABLE servidores ADD COLUMN local_trabalho_codigo TEXT;
ALTER TABLE servidores ADD COLUMN local_trabalho_descricao TEXT;
```

Não criar coluna de secretaria sem uma fonte que realmente a forneça. Os nomes acima são uma proposta de contrato; os cabeçalhos originais permanecem registrados neste plano.

Na complementação, atualizar somente esses dois campos dos registros existentes com `origem = 'prefeitura' AND matricula = ?`, com parâmetros. Código e matrícula permanecem texto, preservando zeros existentes na fonte. Não inserir servidores, alterar IDs, nomes, matrículas ou origens, nem escrever em credenciamentos, prêmios, sorteios ou nas chaves de recuperação de solicitações.

## Procedimento seguro proposto

1. Após aprovação da Parte B, preparar um comando manual com prévia somente leitura e aplicação explicitamente separadas. Não executar a migração automaticamente ao iniciar a API.
2. Revalidar arquivo, cabeçalhos, total de 13.138 registros, unicidade e correspondência exata das matrículas por origem. Bloquear a aplicação diante de divergências; nomes servem apenas para conferir possíveis inconsistências.
3. Validar primeiro em cópia descartável do estado atual, incluindo os cinco sorteios existentes. Usar backup consistente do SQLite; não copiar apenas o arquivo principal quando houver alterações no WAL.
4. Na aplicação autorizada, fazer backup consistente do banco escolhido e executar as duas adições e a complementação em uma transação. Se as colunas já existirem, verificar tipo e conteúdo antes de decidir qualquer atualização. Não sobrescrever valores conflitantes silenciosamente.
5. Comparar antes/depois todos os IDs e identidades dos servidores e o conteúdo integral das demais tabelas, além de executar `integrity_check` e `foreign_key_check`. Esperado: 13.138 registros com local, 167 sem informação da fonte, 13.305 IDs preservados e nenhum resultado ou credenciamento alterado.
6. Cada banco persistente exige autorização explícita para aquele destino. Não aplicar em lote aos três bancos. A base limpa deve continuar sem credenciamentos, prêmios e sorteios; seu schema deve acompanhar o banco de testes quando a atualização da base também for autorizada, preservando a proteção contra gravação e a compatibilidade da restauração.
7. Não usar reset, reimportação, exclusão de auxiliares SQLite ou substituição da base para realizar esta complementação. Uma falha deve resultar em rollback; qualquer restauração também precisa ser planejada e autorizada.

## Integração prevista para a Parte B

Após aprovar e validar a alteração de dados, acrescentar os dois campos aos SELECTs existentes de `/api/servidores`, `/api/credenciamentos/recentes`, `/api/sorteios` e `/api/sorteios/:id`, por meio do relacionamento com `servidores`. Sem endpoints novos ou mudanças nos indicadores, na elegibilidade ou na seleção aleatória.

Propagar os campos pelos mapeamentos e pelo estado enviado pelo operador ao Telão. O Telão continuará conferindo o resultado na API. Exibir “Local de trabalho” como texto secundário no Credenciamento, resultado do Sorteio, Telão e Vencedores, além dos destaques do Início quando couber. Ocultar a linha se não houver descrição; não exibir `null`, `undefined` ou rótulo vazio. O código pode permanecer disponível no contrato sem virar outro badge nas telas.

Testar descrições longas, quebras de linha, leitura à distância e registros da Câmara sem local. Confirmar que o enriquecimento não altera números, associações, idempotência, histórico ou premiação.

**Aguardando autorização:** implementação e teste da migração, escolha dos bancos persistentes a atualizar e integração dos novos campos nas telas. Nenhuma dessas ações foi executada na Parte A.
