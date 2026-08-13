"""一键收集视频 ID：作者主页 URL → 浏览器拦截接口 → 视频预览列表。"""
import pytest

from collector import (
    CollectorError,
    build_cookie_header,
    collect_author_videos,
    dedupe_videos,
    extract_sec_user_id,
    parse_aweme_list,
)


def test_extract_sec_user_id_valid():
    assert extract_sec_user_id('https://www.douyin.com/user/MS4wLjABAAAA123') == 'MS4wLjABAAAA123'


def test_extract_sec_user_id_invalid():
    assert extract_sec_user_id('https://www.douyin.com/video/123') is None
    assert extract_sec_user_id('') is None


def test_build_cookie_header():
    assert build_cookie_header({'a': '1', 'b': '2'}) == 'a=1; b=2'
    assert build_cookie_header({}) == ''


def test_parse_aweme_list_extracts_preview_fields():
    data = {
        'status_code': 0,
        'aweme_list': [
            {'aweme_id': '1', 'desc': '标题1', 'statistics': {'digg_count': 10}, 'author': {'nickname': '作者'}},
            {'aweme_id': '2', 'desc': '标题2', 'statistics': {'digg_count': 20}, 'author': {'nickname': '作者'}},
        ],
    }

    videos = parse_aweme_list(data)

    assert len(videos) == 2
    assert videos[0] == {'video_id': '1', 'video_title': '标题1', 'like_count': 10, 'author_name': '作者'}


def test_parse_aweme_list_handles_empty_and_missing_fields():
    assert parse_aweme_list({}) == []
    assert parse_aweme_list({'aweme_list': None}) == []

    videos = parse_aweme_list({'aweme_list': [{'aweme_id': '9'}]})
    assert videos[0] == {'video_id': '9', 'video_title': '', 'like_count': 0, 'author_name': ''}


def test_dedupe_videos_by_video_id():
    videos = [
        {'video_id': '1', 'video_title': 'a'},
        {'video_id': '2', 'video_title': 'b'},
        {'video_id': '1', 'video_title': 'a'},
    ]
    deduped = dedupe_videos(videos)
    assert len(deduped) == 2
    assert [v['video_id'] for v in deduped] == ['1', '2']


def test_collect_author_videos_invalid_url():
    with pytest.raises(CollectorError, match='主页'):
        collect_author_videos('https://www.douyin.com/video/123')


def test_collect_author_videos_respects_max_count():
    from unittest.mock import patch

    videos = [{'video_id': str(i), 'video_title': 't', 'author_name': '作者', 'like_count': 0} for i in range(30)]
    with patch('collector.fetch_author_videos_browser', return_value=videos) as mock:
        result = collect_author_videos('https://www.douyin.com/user/SEC', max_count=10)
    assert result['total'] == 10
    assert len(result['videos']) == 10
    mock.assert_called_once()


def test_collect_author_videos_returns_preview():
    from unittest.mock import patch

    videos = [{'video_id': '1', 'video_title': '标题1', 'like_count': 10, 'author_name': '作者'}]
    with patch('collector.fetch_author_videos_browser', return_value=videos):
        result = collect_author_videos('https://www.douyin.com/user/SEC')
    assert result['total'] == 1
    assert result['author_name'] == '作者'
    assert result['videos'][0]['video_id'] == '1'
