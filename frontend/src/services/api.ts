import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
})

api.interceptors.response.use(
  (response) => {
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
