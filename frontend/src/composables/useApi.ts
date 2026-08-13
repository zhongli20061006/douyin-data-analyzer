import { ref } from 'vue'

/**
 * 统一的请求状态组合式函数：加载中/错误/数据。
 * 各页面通过它调用接口，避免重复处理 loading 与 error。
 */
export function useApi<T>(fetcher: () => Promise<T>) {
  const data = ref<T | null>(null)
  const loading = ref(false)
  const error = ref('')

  async function run() {
    loading.value = true
    error.value = ''
    try {
      data.value = await fetcher()
    } catch (e: any) {
      error.value = e?.response?.data?.detail || e?.message || '请求失败'
    } finally {
      loading.value = false
    }
  }

  run()
  return { data, loading, error, run }
}
