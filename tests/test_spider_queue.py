"""修复 3：队列连续消费——逐条取任务并接力，直到队列清空。"""
import json
from types import SimpleNamespace

from douyin_spider.spiders.douyin_video import DouyinVideoSpider


class FakeRedis:
    def __init__(self, tasks):
        self._tasks = list(tasks)

    def lpop(self, key):
        if not self._tasks:
            return None
        return self._tasks.pop(0)


def make_spider(tasks):
    spider = DouyinVideoSpider()
    spider.redis_client = FakeRedis(tasks)
    return spider


def task(video_id):
    return json.dumps({'url': f'https://www.douyin.com/video/{video_id}', 'type': 'video'})


def test_pop_task_returns_request_when_queue_has_task():
    spider = make_spider([task('111')])
    req = spider._pop_task()
    assert req is not None
    assert '111' in req.url


def test_pop_task_returns_none_when_queue_empty():
    spider = make_spider([])
    assert spider._pop_task() is None


def test_start_requests_yields_one_request_for_one_task():
    spider = make_spider([task('222')])
    reqs = list(spider.start_requests())
    assert len(reqs) == 1
    assert '222' in reqs[0].url


def test_start_requests_returns_nothing_when_queue_empty():
    spider = make_spider([])
    assert list(spider.start_requests()) == []


def test_parse_video_page_chains_next_task_until_queue_empty():
    # 模拟 start_requests 已取走第一条任务（111），队列中剩 222、333
    spider = make_spider([task('222'), task('333')])
    aweme_detail = {
        'aweme_id': '111',
        'desc': '标题',
        'author': {'nickname': '作者', 'uid': '9'},
        'create_time': 0,
        'statistics': {'digg_count': 1, 'comment_count': 2, 'share_count': 3, 'play_count': 4},
        'video': {'play_addr': {'url_list': ['u']}, 'cover': {'url_list': ['c']}},
    }
    response = SimpleNamespace(
        meta={'intercepted_data': {'aweme_detail': aweme_detail}},
        url='https://www.douyin.com/video/111',
        text='',
    )

    results = list(spider.parse_video_page(response))

    # 第一条：解析出的 item；随后接力出 222 的请求（222 尚未被解析，只有一条请求）
    assert len(results) == 2
    assert results[0]['video_id'] == '111'
    assert '222' in results[1].url
