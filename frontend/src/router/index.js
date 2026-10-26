import { createRouter, createWebHistory } from 'vue-router'
import InicioView from '../views/inicio/InicioView.vue'
import CredenciamentoView from '../views/credenciamento/CredenciamentoView.vue'

const EmptyView = {
  render: () => null,
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),

  routes: [
    { path: '/', component: InicioView },
    { path: '/credenciamento', component: CredenciamentoView },
    { path: '/sorteio', component: EmptyView },
    { path: '/vencedores', component: EmptyView },
    { path: '/premios', component: EmptyView },
    { path: '/guia', component: EmptyView },
  ],
})

export default router
