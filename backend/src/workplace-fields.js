export function workplaceFields(db, alias = 's') {
  const columns = new Set(
    db.pragma('table_info(servidores)').map(({ name }) => name),
  )
  return [
    ['local_trabalho_codigo', 'localTrabalhoCodigo'],
    ['local_trabalho_descricao', 'localTrabalhoDescricao'],
  ]
    .map(
      ([column, field]) =>
        `${columns.has(column) ? `${alias}.${column}` : 'NULL'} AS ${field}`,
    )
    .join(', ')
}
