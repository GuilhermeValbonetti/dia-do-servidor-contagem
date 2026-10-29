import api from '@services/api'

export interface Prize {
  id: number
  name: string
  description: string | null
  quantityTotal: number
  quantityAvailable: number
}

interface PrizeListResponse {
  premios: Prize[]
}

interface PrizeResponse {
  premio: Prize
}

export async function listPrizes() {
  const { data } = await api.get<PrizeListResponse>('/prizes')
  return data.premios
}

export async function createPrize(input: {
  name: string
  description?: string
  quantityTotal: number
}) {
  const { data } = await api.post<PrizeResponse>('/prizes', input)
  return data.premio
}

export async function addPrizeQuantity(id: number, quantityToAdd: number) {
  const { data } = await api.patch<PrizeResponse>(`/prizes/${id}/quantity/add`, {
    quantityToAdd,
  })
  return data.premio
}

export async function removePrizeQuantity(id: number, quantityToRemove: number) {
  const { data } = await api.patch<PrizeResponse>(`/prizes/${id}/quantity/remove`, {
    quantityToRemove,
  })
  return data.premio
}

export async function deletePrize(id: number) {
  const { data } = await api.delete<PrizeResponse>(`/prizes/${id}`)
  return data.premio
}

export async function deleteAllPrizes() {
  const { data } = await api.delete<{ deletedPrizes: number }>('/prizes/all')
  return data.deletedPrizes
}
