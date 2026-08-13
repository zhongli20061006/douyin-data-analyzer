"""写接口守卫依赖：Origin 白名单或 X-API-Token；未配置令牌时 fail-closed。"""
import pytest
from fastapi import HTTPException

import api


@pytest.fixture(autouse=True)
def _configured_token(monkeypatch):
    monkeypatch.setattr(api, 'EXTENSION_API_TOKEN', 'test-token')
    yield


def _call_guard(origin, token):
    api.verify_write_guard(origin=origin, x_api_token=token)


def test_whitelist_origin_passes_without_token():
    _call_guard('http://127.0.0.1:8001', None)


def test_valid_token_passes_from_other_origin():
    _call_guard('https://www.douyin.com', 'test-token')


def test_missing_token_rejected():
    with pytest.raises(HTTPException) as exc:
        _call_guard('https://www.douyin.com', None)
    assert exc.value.status_code == 403


def test_wrong_token_rejected():
    with pytest.raises(HTTPException) as exc:
        _call_guard('https://www.douyin.com', 'bad')
    assert exc.value.status_code == 401


def test_fail_closed_when_token_unconfigured(monkeypatch):
    monkeypatch.setattr(api, 'EXTENSION_API_TOKEN', '')
    with pytest.raises(HTTPException) as exc:
        _call_guard('https://www.douyin.com', 'test-token')
    assert exc.value.status_code == 503
