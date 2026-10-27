import { createRouter, createWebHistory } from 'vue-router'
import InicioView from '../views/inicio/InicioView.vue'
import CredenciamentoView from '../views/credenciamento/CredenciamentoView.vue'
import SorteioView from '../views/sorteio/SorteioView.vue'
import VencedoresView from '../views/vencedores/VencedoresView.vue'
import PremiosView from '../views/premios/PremiosView.vue'

const EmptyView = {
  render: () => null,
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),

  routes: [
    { path: '/', component: InicioView },
    { path: '/credenciamento', component: CredenciamentoView },
    { path: '/sorteio', component: SorteioView },
    { path: '/vencedores', component: VencedoresView },
    { path: '/premios', component: PremiosView },
    { path: '/guia', component: EmptyView },
  ],
})

export default router
