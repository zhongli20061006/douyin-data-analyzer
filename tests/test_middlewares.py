"""修复 2：Playwright 初始化失败时应直接报错，不再静默降级。"""
import pytest

import douyin_spider.middlewares as mw


class _FailingPlaywright:
    def start(self):
        raise RuntimeError('browser executable missing')


def test_spider_opened_raises_when_browser_launch_fails(monkeypatch):
    monkeypatch.setattr(mw, 'sync_playwright', _FailingPlaywright)
    middleware = mw.PlaywrightMiddleware()

    with pytest.raises(RuntimeError, match='playwright install chromium'):
        middleware.spider_opened(spider=None)
