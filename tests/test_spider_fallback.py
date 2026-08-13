"""修复：兜底（页面异常）数据必须标记为不完整，避免覆盖已有完整记录。"""
import scrapy
from scrapy.http import TextResponse

from douyin_spider.spiders.douyin_video import DouyinVideoSpider


def make_spider():
    spider = DouyinVideoSpider()
    spider.redis_client = None  # 队列为空，_chain_next 不会产生请求
    return spider


def test_parse_video_page_fallback_marks_item_incomplete():
    spider = make_spider()
    response = TextResponse(
        url='https://www.douyin.com/video/999',
        body=b'<html><head><title>Test Title</title></head><body></body></html>',
        encoding='utf-8',
        request=scrapy.Request(url='https://www.douyin.com/video/999'),
    )

    results = list(spider.parse_video_page(response))

    assert len(results) == 1
    assert results[0]['video_id'] == '999'
    assert results[0].get('incomplete') is True


def test_parse_video_data_extracts_collect_count():
    spider = make_spider()
    aweme = {
        'aweme_id': '123456789012345678',
        'desc': '标题',
        'statistics': {
            'digg_count': 100,
            'comment_count': 5,
            'share_count': 2,
            'play_count': 1000,
            'collect_count': 66,
        },
        'author': {'nickname': '作者', 'uid': 'u1'},
        'video': {
            'play_addr': {'url_list': ['https://x/v.mp4']},
            'cover': {'url_list': ['https://x/c.jpeg']},
        },
    }
    item = spider.parse_video_data(aweme)
    assert item['collect_count'] == 66


def test_parse_video_data_defaults_collect_count_zero_when_missing():
    spider = make_spider()
    aweme = {
        'aweme_id': '123456789012345678',
        'desc': '标题',
        'statistics': {},
        'author': {'nickname': '作者', 'uid': 'u1'},
        'video': {},
    }
    item = spider.parse_video_data(aweme)
    assert item['collect_count'] == 0
