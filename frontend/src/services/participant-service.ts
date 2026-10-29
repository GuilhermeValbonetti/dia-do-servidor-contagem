import api from '@services/api'

export type PublicAgency = 'PREFEITURA' | 'CAMARA'

export interface Participant {
  id: number
  name: string
  registrationNumber: string | null
  cpfMasked?: string | null
  publicAgency: PublicAgency
  department: string | null
  isWinner: boolean
  present: boolean
  confirmedAt: string | null
  participationNumber: number | null
}

export interface ParticipantStats {
  totalParticipants: number
  presentParticipants: number
  absentParticipants: number
}

export interface ParticipantFilters {
  publicAgency?: PublicAgency
  present?: boolean
  search?: string
  page?: number
  pageSize?: number
}

interface ParticipantListResponse {
  participantes: Participant[]
  total: number
  paginacao: {
    page: number
    pageSize: number
    totalPages: number
  }
}

interface ParticipantResponse {
  participante: Participant
}

interface ParticipantStatsResponse {
  estatisticas: ParticipantStats
}

export async function listParticipants(filters: ParticipantFilters = {}) {
  const { data } = await api.get<ParticipantListResponse>('/participants', {
    params: filters,
  })

  return data
}

export async function listEligibleParticipants() {
  const { data } = await api.get<{ participantes: Participant[] }>('/participants/eligible')

  return data.participantes
}

export async function getParticipantStats() {
  const { data } = await api.get<ParticipantStatsResponse>('/participants/stats')

  return data.estatisticas
}

export async function listRecentConfirmations() {
  const { data } = await api.get<{ participantes: Participant[] }>('/participants/recent')

  return data.participantes
}

export async function toggleParticipantPresence(id: number) {
  const { data } = await api.patch<ParticipantResponse>(`/participants/${id}/presence`)

  return data.participante
}
