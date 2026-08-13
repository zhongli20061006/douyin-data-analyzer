"""定时清理服务：开关/间隔判断、待删选择、备份生成（纯逻辑）。"""
from datetime import datetime, timedelta

from cleanup_service import (
    CLEANUP_BATCH_SIZE,
    CLEANUP_INTERVAL_DAYS,
    build_backup_csv,
    read_cleanup_config,
    select_stale_ids_per_author,
    should_run_cleanup,
    write_cleanup_config,
)


def test_constants():
    assert CLEANUP_INTERVAL_DAYS == 30
    assert CLEANUP_BATCH_SIZE == 200


def test_should_run_cleanup_disabled():
    assert should_run_cleanup(False, None, datetime(2026, 8, 12)) is False


def test_should_run_cleanup_first_time_enabled():
    assert should_run_cleanup(True, None, datetime(2026, 8, 12)) is True


def test_should_run_cleanup_not_due():
    now = datetime(2026, 8, 12)
    assert should_run_cleanup(True, now - timedelta(days=29), now) is False


def test_should_run_cleanup_due():
    now = datetime(2026, 8, 12)
    assert should_run_cleanup(True, now - timedelta(days=30), now) is True


def test_build_backup_csv_header_and_rows():
    rows = [
        {'video_id': '1', 'video_title': '标题', 'like_count': 3, 'collect_count': 5,
         'update_time': datetime(2026, 8, 12)},
    ]
    text = build_backup_csv(rows)
    assert 'video_id' in text
    assert 'collect_count' in text
    assert '1' in text


def test_cleanup_config_read_missing_returns_default(tmp_path):
    cfg = read_cleanup_config(str(tmp_path / 'missing.json'))
    assert cfg['enabled'] is False
    assert cfg['batch_size'] == 200
    assert cfg['authors'] == []


def test_cleanup_config_write_and_read_roundtrip(tmp_path):
    path = str(tmp_path / 'cleanup_config.json')
    write_cleanup_config(path, {'enabled': True, 'last_clean_time': '2026-08-13', 'batch_size': 300, 'authors': ['A']})
    cfg = read_cleanup_config(path)
    assert cfg == {'enabled': True, 'last_clean_time': '2026-08-13', 'batch_size': 300, 'authors': ['A']}


def test_cleanup_config_atomic_write_no_tmp_leftover(tmp_path):
    path = str(tmp_path / 'cleanup_config.json')
    write_cleanup_config(path, {'enabled': True})
    assert [p for p in tmp_path.iterdir() if p.name.endswith('.tmp')] == []


def test_select_stale_ids_per_author_all_authors():
    rows = [
        {'video_id': 'a1', 'author_id': 'A', 'update_time': datetime(2026, 1, 1)},
        {'video_id': 'a2', 'author_id': 'A', 'update_time': datetime(2026, 2, 1)},
        {'video_id': 'a3', 'author_id': 'A', 'update_time': datetime(2026, 3, 1)},
        {'video_id': 'b1', 'author_id': 'B', 'update_time': datetime(2026, 1, 1)},
    ]
    assert select_stale_ids_per_author(rows, batch_size=2) == ['a1', 'a2']


def test_select_stale_ids_per_author_filtered():
    rows = [
        {'video_id': 'a1', 'author_id': 'A', 'update_time': datetime(2026, 1, 1)},
        {'video_id': 'a2', 'author_id': 'A', 'update_time': datetime(2026, 2, 1)},
        {'video_id': 'a3', 'author_id': 'A', 'update_time': datetime(2026, 3, 1)},
        {'video_id': 'b1', 'author_id': 'B', 'update_time': datetime(2026, 1, 1)},
        {'video_id': 'b2', 'author_id': 'B', 'update_time': datetime(2026, 2, 1)},
        {'video_id': 'b3', 'author_id': 'B', 'update_time': datetime(2026, 3, 1)},
    ]
    assert select_stale_ids_per_author(rows, batch_size=2, author_ids=['B']) == ['b1', 'b2']


def test_select_stale_ids_per_author_under_limit_skipped():
    rows = [
        {'video_id': 'a1', 'author_id': 'A', 'update_time': datetime(2026, 1, 1)},
        {'video_id': 'a2', 'author_id': 'A', 'update_time': datetime(2026, 2, 1)},
    ]
    assert select_stale_ids_per_author(rows, batch_size=2) == []


def test_select_stale_ids_per_author_empty_rows():
    assert select_stale_ids_per_author([]) == []


def test_select_stale_ids_per_author_empty_author_group():
    rows = [
        {'video_id': 'x1', 'author_id': '', 'update_time': datetime(2026, 1, 1)},
        {'video_id': 'x2', 'author_id': '', 'update_time': datetime(2026, 2, 1)},
        {'video_id': 'x3', 'author_id': '', 'update_time': datetime(2026, 3, 1)},
    ]
    assert select_stale_ids_per_author(rows, batch_size=2) == ['x1', 'x2']
