<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const menus = [
  { index: '/', label: '视频数据' },
  { index: '/personal', label: '个人分析' },
]
</script>

<template>
  <el-container class="layout">
    <el-aside width="200px" class="layout-aside">
      <div class="brand">抖音创作者数据分析器</div>
      <el-menu :default-active="route.path" router class="layout-menu">
        <el-menu-item v-for="m in menus" :key="m.index" :index="m.index">{{ m.label }}</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="layout-header">
        <span class="page-title">{{ route.meta.title || '看板' }}</span>
      </el-header>
      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  min-height: 100vh;
}
.layout-aside {
  background: var(--spider-surface);
  border-right: 1px solid var(--spider-border);
}
.brand {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 var(--space-card);
  font-weight: 600;
  font-size: 16px;
}
.layout-menu {
  border-right: none;
  background: transparent;
}
.layout-header {
  background: var(--spider-surface);
  border-bottom: 1px solid var(--spider-border);
  display: flex;
  align-items: center;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
}
.layout-main {
  padding: var(--space-page);
}
</style>
