import axios from 'axios'

/** 统一的 API 客户端：开发时由 Vite 代理 /api 到后端 8001，生产由同源提供 */
const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

export default api
