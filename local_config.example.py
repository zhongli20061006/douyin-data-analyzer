# 本地敏感配置示例
# 使用方法：复制本文件为 local_config.py，填入你的真实值。
# local_config.py 已在 .gitignore 中，不会提交到 Git。

DOUYIN_COOKIES = {
    'sessionid': '你的 sessionid',
    'ttwid': '你的 ttwid',
    # 其他抖音 Cookie 字段按需添加
}

MYSQL_PASSWORD = '你的 MySQL 密码'

# MySQL 连接信息（开源版无 Scrapy，直接从这里读；本地开发版若只填密码，其余走 douyin_spider/settings.py）
MYSQL_HOST = 'localhost'
MYSQL_PORT = 3307
MYSQL_USER = 'root'
MYSQL_DB = 'douyin_spider'

# 扩展写接口鉴权令牌（extension 选项页需填写同一令牌）
# 留空 = fail-closed：扩展上报会被后端拒绝（503）
EXTENSION_API_TOKEN = '请设置一段随机字符串'

# 服务端作者白名单：填写「自己的抖音作者 uid」后，后端只接受该作者的数据，
# 即使插件被改为无限制也无法采集他人数据（合规双保险）。
# 留空 = 不启用服务端白名单（本地开发版默认，便于采集任意作者对照）。
ALLOWED_AUTHOR_IDS = ['你的抖音作者 uid']

# 清理配置存储后端：'redis' = 本地开发版默认；'json' = 开源版（无 Redis 依赖）。
CLEANUP_STORAGE = 'json'
