"""修复 1：兜底（页面异常）数据缺字段时也能安全构造入库参数。"""
from datetime import datetime

from douyin_spider.items import DouyinVideoItem
from douyin_spider.pipelines import (
    build_insert_params,
    is_placeholder_title,
    normalize_title,
    should_insert_ignore,
    should_skip_item,
)


def test_build_insert_params_fills_defaults_for_incomplete_item():
    """页面异常兜底产生的 item（只有 video_id/title/desc/url）不应触发 KeyError。"""
    item = DouyinVideoItem(
        video_id='123',
        video_title='标题',
        video_desc='描述',
        video_url='https://www.douyin.com/video/123',
    )

    params = build_insert_params(item)

    assert params['video_id'] == '123'
    assert params['video_title'] == '标题'
    assert params['video_desc'] == '描述'
    assert params['author_name'] == ''
    assert params['author_id'] == ''
    assert params['publish_time'] is None
    assert params['like_count'] == 0
    assert params['comment_count'] == 0
    assert params['share_count'] == 0
    assert params['play_count'] == 0
    assert params['video_url'] == 'https://www.douyin.com/video/123'
    assert params['cover_url'] == ''
    assert isinstance(params['crawl_time'], datetime)


def test_build_insert_params_keeps_provided_values():
    """完整 item 的值原样保留。"""
    item = DouyinVideoItem(
        video_id='1',
        video_title='t',
        video_desc='d',
        author_name='a',
        author_id='2',
        like_count=3,
        comment_count=4,
        share_count=5,
        play_count=6,
        video_url='u',
        cover_url='c',
        publish_time=datetime(2026, 1, 1),
    )

    params = build_insert_params(item)

    assert params['author_name'] == 'a'
    assert params['author_id'] == '2'
    assert params['like_count'] == 3
    assert params['comment_count'] == 4
    assert params['share_count'] == 5
    assert params['play_count'] == 6
    assert params['video_url'] == 'u'
    assert params['cover_url'] == 'c'
    assert params['publish_time'] == datetime(2026, 1, 1)


def test_incomplete_item_should_use_insert_ignore():
    """兜底产生的『不完整』数据只能 INSERT IGNORE，不能覆盖已有记录。"""
    item = DouyinVideoItem(video_id='x', incomplete=True)
    assert should_insert_ignore(item) is True


def test_complete_item_should_use_upsert():
    """完整数据继续走 ON DUPLICATE KEY UPDATE 更新。"""
    item = DouyinVideoItem(video_id='x', author_name='a', like_count=1)
    assert should_insert_ignore(item) is False


def test_normalize_title_strips_whitespace_and_newlines():
    assert normalize_title('  标题  \n 第二行  ') == '标题 第二行'
    assert normalize_title(None) == ''


def test_is_placeholder_title_detects_placeholder_marker():
    assert is_placeholder_title('在抖音记录美好生活20260810 - 抖音') is True
    assert is_placeholder_title('正常视频标题') is False


def test_should_skip_empty_record():
    item = DouyinVideoItem(video_id='x', video_title='', video_desc='')
    assert should_skip_item(item) is True


def test_should_skip_placeholder_title():
    item = DouyinVideoItem(video_id='x', video_title='在抖音记录美好生活 - 抖音', author_name='作者')
    assert should_skip_item(item) is True


def test_should_not_skip_normal_record():
    item = DouyinVideoItem(video_id='x', video_title='标题', author_name='作者')
    assert should_skip_item(item) is False


def test_build_insert_params_normalizes_title():
    item = DouyinVideoItem(video_id='1', video_title='  标题 \n第二行 ', video_desc='描述')
    params = build_insert_params(item)
    assert params['video_title'] == '标题 第二行'
    assert params['video_desc'] == '描述'


def test_build_insert_params_includes_collect_count_default_zero():
    """兜底 item 未携带收藏时默认 0。"""
    item = DouyinVideoItem(video_id='123', video_title='标题')
    params = build_insert_params(item)
    assert params['collect_count'] == 0


def test_build_insert_params_keeps_collect_count():
    """完整 item 的收藏值原样保留。"""
    item = DouyinVideoItem(video_id='1', like_count=3, collect_count=88)
    params = build_insert_params(item)
    assert params['collect_count'] == 88
