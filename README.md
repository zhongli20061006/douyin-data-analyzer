# 抖音创作者数据分析器

一个「个人数据自采集 + 自分析」的开源工具：通过 Chrome 插件采集**登录账号自己**的抖音主页与视频详情数据，本地后端接收并分析播放量、点赞、评论、分享、收藏等指标，提供互动率、收藏率、发布趋势、完整度和数据导出。

> 合规优先：插件默认「仅自己」采集，后端还提供作者白名单双重校验，从源头避免采集他人数据。

## 功能特性

- **仅采集自己**：插件只在登录账号自己的主页/详情页启用；服务端可配置 `ALLOWED_AUTHOR_IDS` 白名单，双重保险；
- **视频数据页**：搜索、排序、分页、详情，以及按发布时间自定义范围检索（含"本月"快捷）；
- **个人分析页**：概览统计、点赞/评论/分享/收藏率、每月播放量与发布趋势、Top 10 多维排序、数据完整度；
- **数据导出**：按当前筛选结果导出 CSV / Excel（上限 1 万条，流式处理）；
- **定时清理**：按作者维度、可自定义条数，删除最旧数据前自动备份；
- **轻量部署**：后端仅需 FastAPI + MySQL，无 Scrapy / Playwright / Redis 依赖。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Python 3.13 · FastAPI · MySQL |
| 前端 | Vue 3 · Vite · TypeScript · Element Plus · ECharts |
| 插件 | Chrome Manifest V3（content script + background service worker） |

## 目录结构

```text
.
├── api.py                  # FastAPI 应用与全部接口
├── extension_receiver.py   # 扩展数据校验 / 去重 / 部分更新
├── analyzer.py             # 个人分析聚合（概览/趋势/率/完整度）
├── cleanup_service.py      # 定时清理规则与 JSON 配置读写
├── export_service.py       # CSV / Excel 导出
├── time_filter.py          # 发布时间范围过滤
├── extension/              # Chrome 插件（默认仅自己）
├── frontend/               # Vue 3 前端（已含构建产物 dist）
├── local_config.example.py # 配置示例
└── tests/                  # pytest 单元测试
```

## 快速开始

### 1. 安装依赖

```bash
python -m venv .venv
# Windows
.\.venv\Scripts\pip install -r requirements.txt
# Linux / macOS
source .venv/bin/activate && pip install -r requirements.txt
```

### 2. 配置

```bash
cp local_config.example.py local_config.py
```

编辑 `local_config.py`：

```python
MYSQL_HOST = 'localhost'
MYSQL_PORT = 3307
MYSQL_USER = 'root'
MYSQL_PASSWORD = '你的 MySQL 密码'
MYSQL_DB = 'douyin_spider'

EXTENSION_API_TOKEN = '请设置一段随机字符串'

# 填你自己的抖音作者 uid，之后前端只显示你自己的数据，后端也只接收你自己的数据
ALLOWED_AUTHOR_IDS = ['你的抖音作者 uid']

CLEANUP_STORAGE = 'json'
```

### 3. 启动后端

```bash
# Windows
.\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8002
# Linux / macOS
uvicorn api:app --host 127.0.0.1 --port 8002
```

浏览器打开 <http://127.0.0.1:8002/app/>。

### 4. 加载 Chrome 插件

1. 打开 `chrome://extensions`，开启右上角「开发者模式」；
2. 点「加载已解压的扩展程序」，选择本仓库的 `extension/` 目录；
3. 点插件图标，填写后端地址 `http://127.0.0.1:8002` 和令牌（与 `local_config.py` 一致），采集模式保持「仅自己」；
4. 登录抖音网页版，进入自己的主页点「开始采集」；浏览自己的视频详情页会自动补全互动与收藏。

## 数据说明

- 数据库表 `video_info`：视频标题/描述、作者、发布时间、点赞/评论/分享/收藏/播放量、视频与封面链接、爬取与更新时间；
- 主页采集得到播放量，详情页与网络 hook 补全互动和收藏；
- 个人分析页的互动率：有播放量时以播放量为分母，无播放量时评论/分享/收藏率退化为以点赞为分母（页面会明确标注）。

## 合规声明

本项目仅供**学习与研究**用途，默认仅采集登录账号自己的数据。使用者须自行遵守：

- 抖音（字节跳动）及相关平台的用户协议、robots.txt 与服务条款；
- 《网络安全法》《数据安全法》《个人信息保护法》及适用的法律法规；
- 不得将本项目用于商业牟利、大规模数据采集或采集他人数据。

因使用本项目产生的账号风险、法律风险由使用者自行承担。

## License

[MIT](LICENSE)
