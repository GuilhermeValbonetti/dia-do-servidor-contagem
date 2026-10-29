// Padroniza nomes também em respostas aninhadas, como participante e prêmio do sorteio.
export function uppercaseNames(value) {
  if (Array.isArray(value)) return value.map(uppercaseNames)
  if (value === null || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === 'name' && typeof entry === 'string'
        ? entry.toLocaleUpperCase('pt-BR')
        : uppercaseNames(entry),
    ]),
  )
}
