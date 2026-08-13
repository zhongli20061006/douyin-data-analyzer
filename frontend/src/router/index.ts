import { createRouter, createWebHistory } from 'vue-router'

import MainLayout from '../layouts/MainLayout.vue'

export default createRouter({
  history: createWebHistory('/app/'),
  routes: [
    {
      path: '/',
      component: MainLayout,
      children: [
        { path: '', name: 'videos', component: () => import('../pages/Videos.vue'), meta: { title: '视频数据' } },
        { path: 'personal', name: 'personal', component: () => import('../pages/PersonalAnalyzer.vue'), meta: { title: '个人分析' } },
      ],
    },
  ],
})
