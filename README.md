# 抖音创作者数据分析器

个人自采集 + 自分析工具：浏览器插件只采集登录账号自己的抖音主页/详情数据，本地后端接收并分析（播放量/点赞/评论/分享/收藏、互动率、收藏率、完整度、时间检索、导出）。

## 快速开始

```bash
pip install -r requirements.txt
cp local_config.example.py local_config.py
# 编辑 local_config.py：填 MySQL 密码、你的抖音作者 uid（ALLOWED_AUTHOR_IDS）、随机令牌 EXTENSION_API_TOKEN
python -m uvicorn api:app --host 127.0.0.1 --port 8001
```

1. Chrome 打开 `chrome://extensions`，开启开发者模式，点「加载已解压的扩展程序」，选择 `extension/`；
2. 点插件图标，填后端地址 `http://127.0.0.1:8001`、令牌（与 local_config.py 一致），采集模式保持「仅自己」；
3. 登录抖音，进入自己的主页点「开始采集」，浏览自己视频详情页自动补全互动与收藏。

## 合规声明

本项目仅供学习与研究，默认仅采集登录账号自己的数据。请遵守抖音用户协议与相关法律法规，勿用于采集他人数据或商业用途。
