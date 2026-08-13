"""队列工具：Redis 队列条目解析。"""
import json

import pytest

from queue_service import parse_queue_item, remove_items


def test_parse_queue_item_valid_json():
    item = parse_queue_item('{"url": "https://www.douyin.com/video/1", "type": "video"}')
    assert item == {'url': 'https://www.douyin.com/video/1', 'type': 'video'}


def test_parse_queue_item_plain_url_fallback():
    item = parse_queue_item('https://www.douyin.com/video/2')
    assert item == {'url': 'https://www.douyin.com/video/2', 'type': 'video'}


def test_parse_queue_item_empty_or_invalid():
    assert parse_queue_item('') is None
    assert parse_queue_item(None) is None


def test_parse_queue_item_non_dict_json_uses_defaults():
    item = parse_queue_item('{"url": "https://www.douyin.com/video/3"}')
    assert item['type'] == 'video'


def test_remove_items_removes_matching_video_ids():
    raws = [
        json.dumps({'url': 'https://www.douyin.com/video/111', 'type': 'video'}),
        json.dumps({'url': 'https://www.douyin.com/video/222', 'type': 'video'}),
        json.dumps({'url': 'https://www.douyin.com/video/333', 'type': 'video'}),
    ]
    kept = remove_items(raws, ['222'])
    assert len(kept) == 2
    assert all('222' not in x for x in kept)


def test_remove_items_empty_targets_keeps_all():
    raws = ['a', 'b']
    assert remove_items(raws, []) == ['a', 'b']


def test_remove_items_preserves_order():
    raws = [
        json.dumps({'url': 'https://www.douyin.com/video/111', 'type': 'video'}),
        json.dumps({'url': 'https://www.douyin.com/video/222', 'type': 'video'}),
        json.dumps({'url': 'https://www.douyin.com/video/333', 'type': 'video'}),
    ]
    kept = remove_items(raws, ['222'])
    assert [parse_queue_item(x)['url'] for x in kept] == [
        'https://www.douyin.com/video/111',
        'https://www.douyin.com/video/333',
    ]
