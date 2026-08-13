<script setup lang="ts">
defineProps<{
  title: string
  value: string | number
  trend?: string
  status?: 'success' | 'warning' | 'danger' | 'info'
}>()
</script>

<template>
  <el-card class="stat-card" shadow="never">
    <div class="stat-label">{{ title }}</div>
    <div
      class="stat-value"
      :style="status ? { color: `var(--spider-${status})` } : undefined"
    >
      {{ value }}
    </div>
    <div v-if="trend" class="stat-trend">{{ trend }}</div>
  </el-card>
</template>

<style scoped>
.stat-card {
  background: var(--spider-surface);
  border: 1px solid var(--spider-border);
  border-radius: var(--radius-md);
}
.stat-label {
  font-size: 12px;
  color: var(--spider-text-secondary);
}
.stat-value {
  font-size: 24px;
  font-weight: 600;
  margin-top: 6px;
}
.stat-trend {
  font-size: 12px;
  color: var(--spider-text-secondary);
  margin-top: 4px;
}
</style>
