"""发布时间范围过滤：日期解析与 SQL 条件构建。"""
from datetime import date, datetime

import pytest

from time_filter import build_publish_filter, parse_date_param


def test_parse_date_param_ok():
    assert parse_date_param('2026-08-01') == date(2026, 8, 1)


def test_parse_date_param_empty_returns_none():
    assert parse_date_param('') is None
    assert parse_date_param(None) is None


def test_parse_date_param_invalid_raises():
    with pytest.raises(ValueError):
        parse_date_param('2026-13-01')
    with pytest.raises(ValueError):
        parse_date_param('abc')


def test_build_publish_filter_no_dates():
    clause, params = build_publish_filter(None, None)
    assert clause == ''
    assert params == []


def test_build_publish_filter_start_only():
    clause, params = build_publish_filter('2026-08-01', None)
    assert clause == 'publish_time >= %s'
    assert params == [datetime(2026, 8, 1, 0, 0, 0)]


def test_build_publish_filter_end_only():
    clause, params = build_publish_filter(None, '2026-08-31')
    assert clause == 'publish_time <= %s'
    assert params == [datetime(2026, 8, 31, 23, 59, 59)]


def test_build_publish_filter_both():
    clause, params = build_publish_filter('2026-08-01', '2026-08-31')
    assert 'publish_time >= %s' in clause
    assert 'publish_time <= %s' in clause
    assert params == [datetime(2026, 8, 1, 0, 0, 0), datetime(2026, 8, 31, 23, 59, 59)]


def test_build_publish_filter_inverted_raises():
    with pytest.raises(ValueError):
        build_publish_filter('2026-08-31', '2026-08-01')


def test_build_publish_filter_invalid_raises():
    with pytest.raises(ValueError):
        build_publish_filter('bad', None)
