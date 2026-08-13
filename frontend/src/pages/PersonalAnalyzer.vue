<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

import api from '../api'
import StatCard from '../components/StatCard.vue'

use([BarChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer])

interface AuthorOption {
  author_id: string
  author_name: string
  count: number
}

interface PersonalData {
  author_id: string
  author_name: string
  summary: {
    total_videos: number
    total_likes: number
    total_comments: number
    total_shares: number
    total_plays: number
    total_collects: number
    latest_sync: string | null
    engagement: {
      like_rate: number | null
      comment_rate: number | null
      share_rate: number | null
      collect_rate: number | null
    }
    completeness: Record<string, { missing: number; total: number; missing_rate: number }>
  }
  trend: { month: string; count: number }[]
  play_trend: { month: string; plays: number }[]
  top_videos: Array<{
    video_id: string
    video_title?: string | null
    like_count?: number
    comment_count?: number
    share_count?: number
    collect_count?: number
    play_count?: number
    publish_time?: string | null
    crawl_time?: string | null
  }>
}

const authors = ref<AuthorOption[]>([])
const authorId = ref('')
const loading = ref(false)
const data = ref<PersonalData | null>(null)
const error = ref('')
const sortBy = ref('likes')
const dateRange = ref<[string, string] | null>(null)

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

const interactionData = computed(() => {
  const s = data.value?.summary
  if (!s) return []
  return [
    { name: '点赞', value: s.total_likes },
    { name: '评论', value: s.total_comments },
    { name: '分享', value: s.total_shares },
    { name: '收藏', value: s.total_collects },
  ]
})

const trendOption = computed(() => ({
  title: {
    text: '月度发布趋势',
    left: 'center',
    textStyle: { color: '#e5e7eb', fontSize: 14 },
  },
  tooltip: { trigger: 'axis' },
  grid: { left: 48, right: 16, top: 44, bottom: 28 },
  xAxis: {
    type: 'category',
    data: (data.value?.trend ?? []).map((t) => t.month),
    axisLabel: { color: '#9ca3af' },
  },
  yAxis: {
    type: 'value',
    minInterval: 1,
    axisLabel: { color: '#9ca3af' },
  },
  series: [
    {
      name: '视频数',
      type: 'bar',
      barMaxWidth: 28,
      itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
      data: (data.value?.trend ?? []).map((t) => t.count),
    },
  ],
}))

const interactionOption = computed(() => ({
  title: {
    text: '互动总量',
    left: 'center',
    textStyle: { color: '#e5e7eb', fontSize: 14 },
  },
  tooltip: { trigger: 'axis' },
  grid: { left: 64, right: 16, top: 44, bottom: 28 },
  xAxis: {
    type: 'category',
    data: interactionData.value.map((d) => d.name),
    axisLabel: { color: '#9ca3af' },
  },
  yAxis: {
    type: 'value',
    minInterval: 1,
    axisLabel: { color: '#9ca3af' },
  },
  series: [
    {
      name: '总数',
      type: 'bar',
      barMaxWidth: 48,
      itemStyle: { color: '#67c23a', borderRadius: [4, 4, 0, 0] },
      data: interactionData.value.map((d) => d.value),
    },
  ],
}))

const playTrendOption = computed(() => ({
  title: {
    text: '每月播放量',
    left: 'center',
    textStyle: { color: '#e5e7eb', fontSize: 14 },
  },
  tooltip: { trigger: 'axis' },
  grid: { left: 64, right: 16, top: 44, bottom: 28 },
  xAxis: {
    type: 'category',
    data: (data.value?.play_trend ?? []).map((t) => t.month),
    axisLabel: { color: '#9ca3af' },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: '#9ca3af' },
  },
  series: [
    {
      name: '播放量',
      type: 'bar',
      barMaxWidth: 28,
      itemStyle: { color: '#e6a23c', borderRadius: [4, 4, 0, 0] },
      data: (data.value?.play_trend ?? []).map((t) => t.plays),
    },
  ],
}))

const completenessFields = [
  { key: 'play', label: '播放量' },
  { key: 'like', label: '点赞' },
  { key: 'comment', label: '评论' },
  { key: 'share', label: '分享' },
  { key: 'collect', label: '收藏' },
  { key: 'publish_time', label: '发布时间' },
]

const completenessNotice = computed(() => {
  const play = data.value?.summary?.completeness?.play
  if (!play) return ''
  if (play.missing_rate >= 0.99) {
    return '该作者数据非主页采集来源（详情/爬虫），播放量无值属预期，完整度仅供参考'
  }
  return '播放量缺失表示该视频尚未被主页采集覆盖，可重新采集补齐'
})

const rateNotice = computed(() => {
  const play = data.value?.summary?.completeness?.play
  if (!play || play.missing_rate < 0.99) return ''
  return '该作者数据非主页采集来源，播放量缺失；分享率、收藏率以点赞数为分母计算'
})

async function loadAuthors() {
  try {
    const res = await api.get<{ authors: AuthorOption[] }>('/analyze/authors')
    authors.value = res.data.authors ?? []
    if (authors.value.length) {
      authorId.value = authors.value[0].author_id
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || e?.message || '加载作者列表失败')
  }
}

async function loadPersonal() {
  if (!authorId.value) return
  loading.value = true
  error.value = ''
  try {
    const res = await api.get<PersonalData>('/analyze/personal', {
      params: {
        author_id: authorId.value,
        sort_by: sortBy.value,
        start_date: dateRange.value ? dateRange.value[0] : undefined,
        end_date: dateRange.value ? dateRange.value[1] : undefined,
      },
    })
    data.value = res.data
  } catch (e: any) {
    error.value = e?.response?.data?.detail || e?.message || '加载分析数据失败'
  } finally {
    loading.value = false
  }
}

watch([authorId, sortBy, dateRange], loadPersonal)
onMounted(loadAuthors)

function fmtNum(n?: number) {
  if (!n) return '0'
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}

function fmtTime(t?: string | null) {
  return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '--'
}

function fmtRate(v?: number | null) {
  if (v === null || v === undefined) return '--'
  return (v * 100).toFixed(2) + '%'
}
</script>

<template>
  <div class="personal">
    <el-alert v-if="error" type="error" :title="error" :closable="false" style="margin-bottom: 12px" />
    <el-card shadow="never" class="p-card toolbar">
      <span class="label">作者：</span>
      <el-select v-model="authorId" filterable style="width: 280px" :disabled="loading">
        <el-option
          v-for="a in authors"
          :key="a.author_id"
          :label="`${a.author_name || a.author_id}（${a.count} 条）`"
          :value="a.author_id"
        />
      </el-select>
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
      />
      <el-button :loading="loading" @click="loadPersonal">刷新</el-button>
    </el-card>

    <el-empty
      v-if="!loading && !data && !error"
      description="还没有数据，请先用浏览器插件在自己主页采集"
      style="margin-top: 40px"
    />

    <template v-if="data">
      <el-row :gutter="16">
        <el-col :span="6">
          <StatCard title="视频数" :value="data.summary.total_videos" status="info" />
        </el-col>
        <el-col :span="6">
          <StatCard title="总播放" :value="fmtNum(data.summary.total_plays)" status="info" />
        </el-col>
        <el-col :span="6">
          <StatCard title="总点赞" :value="fmtNum(data.summary.total_likes)" status="success" />
        </el-col>
        <el-col :span="6">
          <StatCard title="总评论" :value="fmtNum(data.summary.total_comments)" status="warning" />
        </el-col>
      </el-row>

      <el-row :gutter="16" style="margin-top: 12px">
        <el-col :span="8">
          <StatCard title="总分享" :value="fmtNum(data.summary.total_shares)" status="info" />
        </el-col>
        <el-col :span="8">
          <StatCard title="总收藏" :value="fmtNum(data.summary.total_collects)" status="warning" />
        </el-col>
        <el-col :span="8">
          <StatCard title="最近同步" :value="fmtTime(data.summary.latest_sync)" status="info" />
        </el-col>
      </el-row>

      <el-row :gutter="16" style="margin-top: 12px">
        <el-col :span="6">
          <StatCard title="点赞率" :value="fmtRate(data.summary.engagement.like_rate)" status="success" />
        </el-col>
        <el-col :span="6">
          <StatCard title="评论率" :value="fmtRate(data.summary.engagement.comment_rate)" status="warning" />
        </el-col>
        <el-col :span="6">
          <StatCard title="分享率" :value="fmtRate(data.summary.engagement.share_rate)" status="info" />
        </el-col>
        <el-col :span="6">
          <StatCard title="收藏率" :value="fmtRate(data.summary.engagement.collect_rate)" status="info" />
        </el-col>
      </el-row>
      <el-alert
        v-if="rateNotice"
        type="info"
        :closable="false"
        :title="rateNotice"
        style="margin-top: 12px"
      />

      <el-row :gutter="16">
        <el-col :span="12">
          <el-card shadow="never" class="p-card">
            <v-chart :option="trendOption" autoresize style="height: 300px" />
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="never" class="p-card">
            <v-chart :option="playTrendOption" autoresize style="height: 300px" />
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-card shadow="never" class="p-card">
            <v-chart :option="interactionOption" autoresize style="height: 300px" />
          </el-card>
        </el-col>
        <el-col :span="12">
          <el-card shadow="never" class="p-card">
            <template #header>数据完整度</template>
            <div v-for="f in completenessFields" :key="f.key" class="c-row">
              <span class="c-label">{{ f.label }}</span>
              <el-progress
                :percentage="Math.round((1 - (data.summary.completeness[f.key]?.missing_rate ?? 0)) * 100)"
                :stroke-width="10"
                style="flex: 1"
              />
              <span class="c-missing">{{ data.summary.completeness[f.key]?.missing ?? 0 }} 条缺失</span>
            </div>
            <el-alert
              v-if="completenessNotice"
              type="info"
              :closable="false"
              :title="completenessNotice"
              style="margin-top: 12px"
            />
          </el-card>
        </el-col>
      </el-row>

      <el-card shadow="never" class="p-card">
        <template #header>
          <div class="top-header">
            <span>Top 10 视频</span>
            <el-select v-model="sortBy" size="small" style="width: 140px">
              <el-option label="按点赞" value="likes" />
              <el-option label="按播放" value="plays" />
              <el-option label="按评论" value="comments" />
              <el-option label="按分享" value="shares" />
              <el-option label="按收藏" value="collects" />
              <el-option label="按互动率" value="engagement" />
            </el-select>
          </div>
        </template>
        <el-table :data="data.top_videos" size="small" max-height="460">
          <el-table-column prop="video_id" label="视频ID" width="190" />
          <el-table-column prop="video_title" label="标题" show-overflow-tooltip />
          <el-table-column label="播放" width="100">
            <template #default="{ row }">{{ fmtNum(row.play_count) }}</template>
          </el-table-column>
          <el-table-column label="点赞" width="100">
            <template #default="{ row }">{{ fmtNum(row.like_count) }}</template>
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
          <el-table-column label="发布时间" width="150">
            <template #default="{ row }">{{ fmtTime(row.publish_time) }}</template>
          </el-table-column>
          <el-table-column label="同步时间" width="150">
            <template #default="{ row }">{{ fmtTime(row.crawl_time) }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.p-card {
  background: var(--spider-surface);
  border: 1px solid var(--spider-border);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-section);
}
.toolbar :deep(.el-card__body) {
  display: flex;
  gap: 12px;
  align-items: center;
}
.label {
  color: var(--spider-text-secondary);
  font-size: 14px;
}
.top-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.c-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}
.c-label {
  width: 64px;
  color: var(--spider-text-secondary);
  font-size: 13px;
}
.c-missing {
  width: 76px;
  text-align: right;
  color: var(--spider-text-secondary);
  font-size: 12px;
}
</style>
