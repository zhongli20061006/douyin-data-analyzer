"""浏览器插件接收器：字段校验/归一化/去重/部分更新 SQL。"""
from datetime import datetime

from extension_receiver import (
    MAX_BATCH,
    append_ids_file,
    attach_author_names,
    backfill_authors,
    build_author_filter,
    build_upsert,
    dedupe_records,
    evaluate_write_guard,
    filter_by_author_whitelist,
    filter_pending_ids,
    is_allowed_origin,
    is_valid_token,
    mark_ids_done,
    normalize_record,
    parse_count,
    parse_datetime,
    parse_id_line,
    read_ids_file,
    read_ids_with_status,
    set_ids_status,
    validate_batch,
    validate_source_url,
    validate_video_id,
    write_ids_file,
)


def test_validate_video_id():
    assert validate_video_id('7638884656238410714') is True
    assert validate_video_id(' 7638884656238410714 ') is True
    assert validate_video_id('123') is False
    assert validate_video_id('abc12345678901234') is False
    assert validate_video_id('') is False
    assert validate_video_id(None) is False
    assert validate_video_id(7638884656238410714) is False


def test_validate_source_url():
    assert validate_source_url('https://www.douyin.com/user/MS4wLjABAAAA123') is True
    assert validate_source_url('https://www.douyin.com/user/self') is True
    assert validate_source_url('https://www.douyin.com/video/123') is False
    assert validate_source_url('https://evil.com/user/MS4wLjABAAAA123') is False
    assert validate_source_url('') is False


def test_parse_datetime_accepts_iso_and_space_formats():
    assert isinstance(parse_datetime('2026-05-12T14:13:52'), datetime)
    assert isinstance(parse_datetime('2026-05-12 14:13:52'), datetime)
    assert isinstance(parse_datetime('2026-05-12'), datetime)
    assert parse_datetime('垃圾数据') is None
    assert parse_datetime(None) is None
    assert parse_datetime('') is None


def test_parse_count_accepts_int_and_digit_string():
    assert parse_count(236) == 236
    assert parse_count('236') == 236
    assert parse_count(0) == 0
    assert parse_count('4.0') == 4


def test_parse_count_rejects_negative_and_non_numeric():
    assert parse_count(-1) is None
    assert parse_count('4.0万') is None
    assert parse_count('abc') is None
    assert parse_count(2.5) is None
    assert parse_count(None) is None


def test_max_batch_constant():
    assert MAX_BATCH == 100


def test_normalize_record_defaults():
    record, reason = normalize_record({'video_id': '7638884656238410714'})
    assert reason is None
    assert record['video_id'] == '7638884656238410714'
    assert record['video_title'] == ''
    assert record['author_name'] == ''
    assert record['publish_time'] is None
    assert record['like_count'] is None
    assert record['play_count'] is None


def test_normalize_record_strips_and_limits_text():
    record, _ = normalize_record({
        'video_id': '7638884656238410714',
        'video_title': '  标题  ',
        'author_name': 'a' * 200,
    })
    assert record is None
    record, _ = normalize_record({
        'video_id': '7638884656238410714',
        'video_title': '  标题  ',
    })
    assert record['video_title'] == '标题'


def test_normalize_record_rejects_bad_counts():
    record, reason = normalize_record({
        'video_id': '7638884656238410714',
        'like_count': -5,
    })
    assert record is None and reason


def test_validate_batch_requires_valid_source_url():
    payload = {'source_url': 'https://www.douyin.com/video/123', 'videos': []}
    valid, rejected = validate_batch(payload)
    assert valid == []
    assert rejected and rejected[0]['reason']


def test_validate_batch_enforces_batch_limit():
    payload = {
        'source_url': 'https://www.douyin.com/user/MS4wLjABAAAA123',
        'videos': [{'video_id': '7638884656238410714'} for _ in range(101)],
    }
    valid, rejected = validate_batch(payload)
    assert valid == []
    assert rejected[0]['reason']


def test_validate_batch_rejects_mixed_authors():
    payload = {
        'source_url': 'https://www.douyin.com/user/MS4wLjABAAAA123',
        'videos': [
            {'video_id': '7638884656238410714', 'author_id': 'A'},
            {'video_id': '7638884656238410715', 'author_id': 'B'},
        ],
    }
    valid, rejected = validate_batch(payload)
    assert valid == []
    assert any('author_id' in r['reason'] for r in rejected)


def test_validate_batch_passes_clean_batch():
    payload = {
        'source_url': 'https://www.douyin.com/user/MS4wLjABAAAA123',
        'videos': [
            {
                'video_id': '7638884656238410714',
                'video_title': '标题A',
                'like_count': 40000,
                'author_id': 'A',
            },
            {
                'video_id': '7638884656238410715',
                'video_title': '标题B',
                'author_id': 'A',
            },
        ],
    }
    valid, rejected = validate_batch(payload)
    assert rejected == []
    assert len(valid) == 2
    assert valid[0]['like_count'] == 40000
    assert valid[1]['like_count'] is None


def test_dedupe_records_keeps_first_by_video_id():
    records = [
        {'video_id': '1', 'play_count': 10},
        {'video_id': '2', 'play_count': 20},
        {'video_id': '1', 'play_count': 99},
    ]
    result = dedupe_records(records)
    assert [r['video_id'] for r in result] == ['1', '2']
    assert result[0]['play_count'] == 10


def test_build_upsert_skips_none_fields():
    record = {
        'video_id': '7638884656238410714',
        'video_title': '标题',
        'video_desc': '',
        'author_name': '我',
        'author_id': 'A',
        'publish_time': None,
        'like_count': None,
        'comment_count': None,
        'share_count': None,
        'play_count': 236,
        'video_url': '',
        'cover_url': '',
    }
    sql, params = build_upsert(record)
    assert 'like_count=VALUES(like_count)' not in sql
    assert 'play_count=VALUES(play_count)' in sql
    assert 'crawl_time=NOW()' in sql
    assert params[0] == '7638884656238410714'
    assert params[9] == 236


def test_build_upsert_includes_present_count_fields():
    record = {
        'video_id': '7638884656238410714',
        'video_title': '标题',
        'video_desc': '',
        'author_name': '我',
        'author_id': 'A',
        'publish_time': None,
        'like_count': 40000,
        'comment_count': 481,
        'share_count': 1150,
        'play_count': None,
        'video_url': '',
        'cover_url': '',
    }
    sql, _ = build_upsert(record)
    assert 'like_count=VALUES(like_count)' in sql
    assert 'play_count=VALUES(play_count)' not in sql


def test_parse_id_line():
    assert parse_id_line('123') == ('123', 'pending', '')
    assert parse_id_line('123|done') == ('123', 'done', '')
    assert parse_id_line('123|pending|authorA') == ('123', 'pending', 'authorA')
    assert parse_id_line('123|bad') == ('123', 'pending', '')
    assert parse_id_line('123|done|a|extra') == ('123', 'done', 'a')
    assert parse_id_line('') is None
    assert parse_id_line('|x') is None


def test_read_ids_with_status_parses_mixed_lines(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a\nb|done\nc|pending|authorC\n', encoding='utf-8')
    assert read_ids_with_status(str(path)) == [
        {'video_id': 'a', 'status': 'pending', 'author_id': ''},
        {'video_id': 'b', 'status': 'done', 'author_id': ''},
        {'video_id': 'c', 'status': 'pending', 'author_id': 'authorC'},
    ]


def test_append_ids_file_with_author(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a|done|oldAuthor\n', encoding='utf-8')
    added, total = append_ids_file(str(path), ['a', 'b'], author_id='newAuthor')
    assert (added, total) == (1, 2)
    assert path.read_text(encoding='utf-8').splitlines() == ['a|pending|newAuthor', 'b|pending|newAuthor']


def test_append_ids_file_without_author_keeps_existing(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a|pending|authorA\n', encoding='utf-8')
    added, total = append_ids_file(str(path), ['a'])
    assert (added, total) == (0, 1)
    assert path.read_text(encoding='utf-8').splitlines() == ['a|pending|authorA']


def test_append_ids_file_merges_and_returns_counts(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a\nb\n', encoding='utf-8')
    added, total = append_ids_file(str(path), ['b', 'c'])
    assert (added, total) == (1, 3)
    assert path.read_text(encoding='utf-8').splitlines() == ['a|pending', 'b|pending', 'c|pending']


def test_append_ids_file_creates_missing_file(tmp_path):
    path = tmp_path / 'video_ids.txt'
    added, total = append_ids_file(str(path), ['x', 'y'])
    assert (added, total) == (2, 2)
    assert path.read_text(encoding='utf-8').splitlines() == ['x|pending', 'y|pending']


def test_append_ids_file_no_tmp_leftover(tmp_path):
    path = tmp_path / 'video_ids.txt'
    append_ids_file(str(path), ['a'])
    leftovers = [p for p in tmp_path.iterdir() if p.name.endswith('.tmp')]
    assert leftovers == []


def test_append_ids_file_resets_existing_to_pending(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a|done\n', encoding='utf-8')
    added, total = append_ids_file(str(path), ['a'])
    assert (added, total) == (0, 1)
    assert path.read_text(encoding='utf-8').splitlines() == ['a|pending']


def test_read_ids_file_reads_lines_and_skips_blanks(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a\n\nb\n', encoding='utf-8')
    assert read_ids_file(str(path)) == ['a', 'b']


def test_read_ids_file_missing_returns_empty(tmp_path):
    assert read_ids_file(str(tmp_path / 'missing.txt')) == []


def test_mark_ids_done_existing_and_new(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a|pending\nb|done\n', encoding='utf-8')
    changed = mark_ids_done(str(path), ['a', 'b', 'c'])
    assert changed == 2
    assert path.read_text(encoding='utf-8').splitlines() == ['a|done', 'b|done', 'c|done']


def test_set_ids_status_changes_and_appends(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a|pending|authorA\nb|done\n', encoding='utf-8')
    changed = set_ids_status(str(path), ['a', 'b', 'c'], 'pending')
    assert changed == 2
    assert path.read_text(encoding='utf-8').splitlines() == ['a|pending|authorA', 'b|pending', 'c|pending']


def test_mark_ids_done_keeps_author(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a|pending|authorA\n', encoding='utf-8')
    mark_ids_done(str(path), ['a'])
    assert path.read_text(encoding='utf-8').splitlines() == ['a|done|authorA']


def test_write_ids_file_preserves_status_and_author(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a|done|authorA\nb|pending\n', encoding='utf-8')
    assert write_ids_file(str(path), ['b', 'c']) == 2
    assert path.read_text(encoding='utf-8').splitlines() == ['b|pending', 'c|pending']


def test_write_ids_file_empty_clears(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a|pending\nb|done\n', encoding='utf-8')
    assert write_ids_file(str(path), []) == 0
    assert path.read_text(encoding='utf-8') == ''


def test_filter_pending_ids():
    records = [
        {'video_id': 'a', 'status': 'pending'},
        {'video_id': 'b', 'status': 'done'},
    ]
    assert filter_pending_ids(records, ['b', 'c', 'a', 'c']) == ['c', 'a']


def test_backfill_authors_fills_unknown_only(tmp_path):
    path = tmp_path / 'video_ids.txt'
    path.write_text('a|pending\nb|done|authorB\n', encoding='utf-8')
    changed = backfill_authors(str(path), {'a': 'authorA', 'b': 'other'})
    assert changed == 1
    assert path.read_text(encoding='utf-8').splitlines() == ['a|pending|authorA', 'b|done|authorB']


def test_attach_author_names():
    items = [
        {'video_id': 'a', 'status': 'pending', 'author_id': 'A'},
        {'video_id': 'b', 'status': 'done', 'author_id': ''},
    ]
    result = attach_author_names(items, {'A': '平原公子'})
    assert result[0]['author_name'] == '平原公子'
    assert result[1]['author_name'] == ''
    assert 'author_name' not in items[0]


def test_is_valid_token():
    assert is_valid_token('abc', 'abc') is True
    assert is_valid_token('abc', 'abd') is False
    assert is_valid_token('', 'abc') is False
    assert is_valid_token('abc', '') is False
    assert is_valid_token(None, 'abc') is False


def test_is_allowed_origin():
    allowed = ['http://127.0.0.1:8001', 'http://localhost:8001', 'http://localhost:5173']
    assert is_allowed_origin('http://127.0.0.1:8001', allowed) is True
    assert is_allowed_origin('http://127.0.0.1:8001/', allowed) is True
    assert is_allowed_origin('HTTP://LOCALHOST:8001', allowed) is True
    assert is_allowed_origin('https://evil.com', allowed) is False
    assert is_allowed_origin(None, allowed) is False


def test_evaluate_write_guard_whitelist_origin():
    allowed = ['http://127.0.0.1:8001']
    ok, status, reason = evaluate_write_guard('http://127.0.0.1:8001', '', '', allowed)
    assert ok is True and status is None and reason is None


def test_evaluate_write_guard_fail_closed_when_token_unconfigured():
    allowed = ['http://127.0.0.1:8001']
    ok, status, reason = evaluate_write_guard('https://www.douyin.com', 'anything', '', allowed)
    assert ok is False and status == 503
    assert 'EXTENSION_API_TOKEN' in reason


def test_evaluate_write_guard_rejects_missing_token():
    allowed = ['http://127.0.0.1:8001']
    ok, status, reason = evaluate_write_guard('https://www.douyin.com', '', 'secret', allowed)
    assert ok is False and status == 403


def test_evaluate_write_guard_rejects_wrong_token():
    allowed = ['http://127.0.0.1:8001']
    ok, status, reason = evaluate_write_guard('https://www.douyin.com', 'bad', 'secret', allowed)
    assert ok is False and status == 401


def test_evaluate_write_guard_allows_valid_token():
    allowed = ['http://127.0.0.1:8001']
    ok, status, reason = evaluate_write_guard('https://www.douyin.com', 'secret', 'secret', allowed)
    assert ok is True and status is None and reason is None


def test_filter_by_author_whitelist_empty_returns_all():
    records = [{'video_id': '1', 'author_id': 'A'}]
    kept, rejected = filter_by_author_whitelist(records, [])
    assert kept == records and rejected == []


def test_filter_by_author_whitelist_rejects_other_and_empty():
    records = [
        {'video_id': '1', 'author_id': 'A'},
        {'video_id': '2', 'author_id': 'B'},
        {'video_id': '3', 'author_id': ''},
    ]
    kept, rejected = filter_by_author_whitelist(records, ['A'])
    assert [r['video_id'] for r in kept] == ['1']
    assert {r['video_id'] for r in rejected} == {'2', '3'}


def test_build_author_filter_empty_returns_empty():
    clause, params = build_author_filter([])
    assert clause == '' and params == []


def test_build_author_filter_builds_in_clause():
    clause, params = build_author_filter(['A', 'B'])
    assert clause == 'author_id IN (%s, %s)'
    assert params == ['A', 'B']


def test_normalize_record_accepts_collect_count():
    record, reason = normalize_record({
        'video_id': '7638884656238410714',
        'collect_count': 888,
    })
    assert reason is None
    assert record['collect_count'] == 888


def test_normalize_record_collect_count_none_when_missing():
    record, _ = normalize_record({'video_id': '7638884656238410714'})
    assert record['collect_count'] is None


def test_normalize_record_rejects_bad_collect_count():
    record, reason = normalize_record({
        'video_id': '7638884656238410714',
        'collect_count': -1,
    })
    assert record is None and reason


def test_build_upsert_includes_collect_count():
    record = {
        'video_id': '7638884656238410714',
        'video_title': '标题',
        'video_desc': '',
        'author_name': '我',
        'author_id': 'A',
        'publish_time': None,
        'like_count': None,
        'comment_count': None,
        'share_count': None,
        'play_count': None,
        'collect_count': 888,
        'video_url': '',
        'cover_url': '',
    }
    sql, _ = build_upsert(record)
    assert 'collect_count=VALUES(collect_count)' in sql


def test_build_upsert_skips_none_collect_count():
    record = {
        'video_id': '7638884656238410714',
        'video_title': '标题',
        'video_desc': '',
        'author_name': '我',
        'author_id': 'A',
        'publish_time': None,
        'like_count': None,
        'comment_count': None,
        'share_count': None,
        'play_count': None,
        'collect_count': None,
        'video_url': '',
        'cover_url': '',
    }
    sql, _ = build_upsert(record)
    assert 'collect_count=VALUES(collect_count)' not in sql
