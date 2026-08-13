import { defineStore } from 'pinia'

import api from '../api'

interface SpiderStatus {
  running: boolean
  queue_length: number
  latest_crawl?: string | null
}

/** 爬虫与队列共享状态：多页面（看板/队列/收集）共同消费 */
export const useSpiderStore = defineStore('spider', {
  state: (): SpiderStatus => ({
    running: false,
    queue_length: 0,
    latest_crawl: null,
  }),
  actions: {
    async refresh() {
      const res = await api.get<SpiderStatus>('/stats')
      this.running = res.data.running
      this.queue_length = res.data.queue_length
      this.latest_crawl = res.data.latest_crawl
    },
  },
})
