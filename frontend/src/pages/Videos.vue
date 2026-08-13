<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import api from '../api'

interface VideoItem {
  video_id: string
  video_title?: string | null
  video_desc?: string | null
  author_name?: string | null
  author_id?: string | null
  publish_time?: string | null
  like_count?: number
  comment_count?: number
  share_count?: number
  collect_count?: number
  play_count?: number
  video_url?: string | null
  cover_url?: string | null
  crawl_time?: string | null
  update_time?: string | null
}

interface PageData {
  total: number
  page: number
  page_size: number
  total_pages: number
  data: VideoItem[]
}

const rows = ref<VideoItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const search = ref('')
const sortBy = ref('crawl_time')
const order = ref('desc')
const dateRange = ref<[string, string] | null>(null)
const loading = ref(false)
const drawer = ref(false)
const detail = ref<VideoItem | null>(null)
const cleanupEnabled = ref(false)
const cleanupLoading = ref(false)
const cleanupAuthors = ref<string[]>([])
const cleanupBatchSize = ref(200)
const authorOptions = ref<Array<{ author_id: string; author_name: string }>>([])
let cleanupSettingsTimer: ReturnType<typeof setTimeout> | null = null

const dateShortcuts = [
  {
    text: '本月',
    value: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return [start, now]
    },
  },
]

const sortOptions = [
  { value: 'crawl_time', label: '爬取时间' },
  { value: 'publish_time', label: '发布时间' },
  { value: 'like_count', label: '点赞数' },
  { value: 'comment_count', label: '评论数' },
  { value: 'share_count', label: '分享数' },
  { value: 'collect_count', label: '收藏数' },
  { value: 'play_count', label: '播放数' },
]

async function load() {
  loading.value = true
  try {
    const res = await api.get<PageData>('/videos', {
      params: {
        page: page.value,
        page_size: pageSize.value,
        search: search.value,
        sort_by: sortBy.value,
        order: order.value,
        start_date: dateRange.value ? dateRange.value[0] : undefined,
        end_date: dateRange.value ? dateRange.value[1] : undefined,
      },
    })
    rows.value = res.data.data
    total.value = res.data.total
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function doSearch() {
  page.value = 1
  load()
}

function clearSearch() {
  search.value = ''
  doSearch()
}

function buildExportUrl(format: string) {
  const params = new URLSearchParams()
  if (search.value) params.set('search', search.value)
  if (sortBy.value) params.set('sort_by', sortBy.value)
  if (order.value) params.set('order', order.value)
  if (dateRange.value) {
    params.set('start_date', dateRange.value[0])
    params.set('end_date', dateRange.value[1])
  }
  params.set('format', format)
  return `/api/export?${params.toString()}`
}

function exportCsv() {
  window.location.href = buildExportUrl('csv')
}

function exportXlsx() {
  window.location.href = buildExportUrl('xlsx')
}

function fmtNum(n?: number) {
  if (!n) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}

function fmtTime(t?: string | null) {
  return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '--'
}

async function showDetail(row: VideoItem) {
  try {
    const res = await api.get<VideoItem>(`/videos/${row.video_id}`)
    detail.value = res.data
    drawer.value = true
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载详情失败')
  }
}

async function removeRow(row: VideoItem) {
  try {
    await ElMessageBox.confirm(`确定删除视频 ${row.video_id} 吗？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await api.delete(`/videos/${row.video_id}`)
    ElMessage.success('已删除')
    load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

async function loadCleanupStatus() {
  try {
    const res = await api.get<{ enabled: boolean; batch_size: number; authors: string[] }>('/cleanup/status')
    cleanupEnabled.value = res.data.enabled
    cleanupBatchSize.value = res.data.batch_size
    cleanupAuthors.value = res.data.authors
  } catch { /* 开关状态加载失败不阻塞页面 */ }
  try {
    const authorsRes = await api.get<{ authors: Array<{ author_id: string; author_name: string }> }>('/analyze/authors')
    authorOptions.value = authorsRes.data.authors ?? []
  } catch { /* 作者列表加载失败不阻塞页面 */ }
}

async function toggleCleanup(val: boolean) {
  cleanupLoading.value = true
  try {
    await api.post('/cleanup/toggle', { enabled: val })
    ElMessage.success(val ? '定时清理已开启' : '定时清理已关闭')
  } catch (e: any) {
    cleanupEnabled.value = !val
    ElMessage.error(e?.response?.data?.detail || e?.message || '切换失败')
  } finally {
    cleanupLoading.value = false
  }
}

function saveCleanupSettings() {
  if (cleanupSettingsTimer) clearTimeout(cleanupSettingsTimer)
  cleanupSettingsTimer = setTimeout(async () => {
    try {
      await api.post('/cleanup/settings', {
        batch_size: cleanupBatchSize.value,
        authors: cleanupAuthors.value,
      })
      ElMessage.success('清理设置已保存')
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.detail || e?.message || '保存设置失败')
    }
  }, 500)
}

onMounted(() => {
  load()
  loadCleanupStatus()
})
</script>

<template>
  <div class="videos">
    <el-card shadow="never" class="v-card toolbar">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        :shortcuts="dateShortcuts"
        style="max-width: 300px"
        clearable
        @change="doSearch"
      />
      <el-input
        v-model="search"
        placeholder="搜索视频ID / 标题 / 作者"
        clearable
        style="max-width: 360px"
        @keyup.enter="doSearch"
      />
      <el-button type="primary" @click="doSearch">搜索</el-button>
      <el-button @click="clearSearch">清空</el-button>
      <el-select v-model="sortBy" style="width: 130px" @change="doSearch">
        <el-option v-for="s in sortOptions" :key="s.value" :label="s.label" :value="s.value" />
      </el-select>
      <el-select v-model="order" style="width: 100px" @change="doSearch">
        <el-option label="降序" value="desc" />
        <el-option label="升序" value="asc" />
      </el-select>
      <el-button :loading="loading" @click="load">刷新</el-button>
      <el-button @click="exportCsv">导出 CSV</el-button>
      <el-button @click="exportXlsx">导出 Excel</el-button>
    </el-card>

    <el-card shadow="never" class="v-card">
      <template #header>
        <span>定时清理</span>
      </template>
      <div class="cleanup-panel">
        <div class="cleanup-row">
          <span>开关</span>
          <el-switch v-model="cleanupEnabled" :loading="cleanupLoading" @change="toggleCleanup" />
        </div>
        <div class="cleanup-row">
          <span>每次删除条数</span>
          <el-input-number v-model="cleanupBatchSize" :min="1" :max="1000" :step="50" @change="saveCleanupSettings" />
        </div>
        <div class="cleanup-row">
          <span>作者范围（不选=全部作者）</span>
          <el-select
            v-model="cleanupAuthors"
            multiple
            filterable
            clearable
            collapse-tags
            placeholder="全部作者"
            style="width: 320px"
            @change="saveCleanupSettings"
          >
            <el-option
              v-for="a in authorOptions"
              :key="a.author_id"
              :label="`${a.author_name || a.author_id}`"
              :value="a.author_id"
            />
          </el-select>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="v-card">
      <el-table :data="rows" size="small" max-height="520" v-loading="loading">
        <el-table-column prop="video_id" label="视频ID" width="200" />
        <el-table-column prop="video_title" label="标题" show-overflow-tooltip />
        <el-table-column prop="author_name" label="作者" width="140" show-overflow-tooltip />
        <el-table-column label="点赞" width="90">
          <template #default="{ row }">{{ fmtNum(row.like_count) }}</template>
        </el-table-column>
        <el-table-column label="播放" width="100">
          <template #default="{ row }">{{ fmtNum(row.play_count) }}</template>
        </el-table-column>
        <el-table-column label="评论" width="90">
          <template #default="{ row }">{{ fmtNum(row.comment_count) }}</template>
        </el-table-column>
        <el-table-column label="分享" width="90">
          <template #default="{ row }">{{ fmtNum(row.share_count) }}</template>
        </el-table-column>
        <el-table-column label="收藏" width="90">
          <template #default="{ row }">{{ fmtNum(row.collect_count) }}</template>
        </el-table-column>
        <el-table-column label="爬取时间" width="150">
          <template #default="{ row }">{{ fmtTime(row.crawl_time) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="showDetail(row)">详情</el-button>
            <el-button link type="danger" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 12px; justify-content: flex-end"
        @current-change="load"
        @size-change="doSearch"
      />
    </el-card>

    <el-drawer v-model="drawer" title="视频详情" size="480px">
      <template v-if="detail">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="视频ID">{{ detail.video_id }}</el-descriptions-item>
          <el-descriptions-item label="标题">{{ detail.video_title || '--' }}</el-descriptions-item>
          <el-descriptions-item label="描述">{{ detail.video_desc || '--' }}</el-descriptions-item>
          <el-descriptions-item label="作者">{{ detail.author_name || '--' }} ({{ detail.author_id || '--' }})</el-descriptions-item>
          <el-descriptions-item label="发布时间">{{ fmtTime(detail.publish_time) }}</el-descriptions-item>
          <el-descriptions-item label="点赞/评论/分享/收藏/播放">
            {{ fmtNum(detail.like_count) }} / {{ fmtNum(detail.comment_count) }} / {{ fmtNum(detail.share_count) }} / {{ fmtNum(detail.collect_count) }} / {{ fmtNum(detail.play_count) }}
          </el-descriptions-item>
          <el-descriptions-item label="爬取/更新时间">{{ fmtTime(detail.crawl_time) }} / {{ fmtTime(detail.update_time) }}</el-descriptions-item>
          <el-descriptions-item label="视频链接">
            <el-link v-if="detail.video_url" :href="detail.video_url" target="_blank" type="primary">打开</el-link>
            <span v-else>--</span>
          </el-descriptions-item>
          <el-descriptions-item label="封面">
            <el-image
              v-if="detail.cover_url"
              :src="detail.cover_url"
              style="width: 120px; height: 80px"
              fit="cover"
              :preview-src-list="[detail.cover_url]"
              preview-teleported
            />
            <span v-else>--</span>
          </el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.v-card {
  background: var(--spider-surface);
  border: 1px solid var(--spider-border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-section);
}
.cleanup-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cleanup-row {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--spider-text-secondary);
  font-size: 13px;
}
.toolbar :deep(.el-card__body) {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
