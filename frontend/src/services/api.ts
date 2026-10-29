import axios from 'axios'
import { uppercaseNames } from './uppercase-names'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
})

api.interceptors.request.use((config) => {
  if (config.data && typeof config.data === 'object') {
    config.data = uppercaseNames(config.data)
  }
  return config
})

api.interceptors.response.use(
  (response) => {
    response.data = uppercaseNames(response.data)
    if (response.config.method?.toLowerCase() !== 'get' && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('evento-atualizado'))
    }

    return response
  },
  (error) => {
    const message =
      error.response?.data?.message ??
      error.response?.data?.mensagem ??
      error.message ??
      'Não foi possível concluir a operação.'

    return Promise.reject(Object.assign(new Error(message), { status: error.response?.status }))
  },
)

export default api
