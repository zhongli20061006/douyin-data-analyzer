"""个人视频数据分析：概览聚合、发布趋势、Top 视频。"""
from collections import Counter
from datetime import datetime
from typing import Any, Optional

TOP_VIDEOS_LIMIT = 10


def _as_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _rate(numerator: int, denominator: int):
    """比率，分母为 0 返回 None。"""
    if not denominator:
        return None
    return round(numerator / denominator, 4)


def summarize_rows(rows: list[dict]) -> dict:
    """按作者过滤后的概览：总数、总和、最近同步、互动率、数据完整度。"""
    def total(field: str) -> int:
        return sum(int(r.get(field) or 0) for r in rows)

    sync_times = [
        _as_datetime(r.get('update_time') or r.get('crawl_time'))
        for r in rows
        if r.get('update_time') or r.get('crawl_time')
    ]

    completeness: dict = {}
    for field in ('play_count', 'like_count', 'comment_count', 'share_count', 'collect_count', 'publish_time'):
        if field == 'publish_time':
            missing = sum(1 for r in rows if not r.get(field))
        else:
            missing = sum(1 for r in rows if r.get(field) in (None, 0))
        key = field.replace('_count', '')
        completeness[key] = {
            'missing': missing,
            'total': len(rows),
            'missing_rate': round(missing / len(rows), 4) if rows else 0,
        }

    return {
        'total_videos': len(rows),
        'total_likes': total('like_count'),
        'total_comments': total('comment_count'),
        'total_shares': total('share_count'),
        'total_plays': total('play_count'),
        'total_collects': total('collect_count'),
        'latest_sync': max(sync_times) if sync_times else None,
        'engagement': {
            'like_rate': _rate(total('like_count'), total('play_count')),
            # 无播放量时评论/分享率退化为以点赞为分母（用户规则）
            'comment_rate': _rate(
                total('comment_count'),
                total('play_count') or total('like_count'),
            ),
            'share_rate': _rate(
                total('share_count'),
                total('play_count') or total('like_count'),
            ),
            'collect_rate': _rate(
                total('collect_count'),
                total('play_count') or total('like_count'),
            ),
        },
        'completeness': completeness,
    }


def build_trend(rows: list[dict]) -> list[dict]:
    """按 publish_time 的「年-月」分组计数，升序；publish_time 为空的不计入。"""
    counter: Counter = Counter()
    for r in rows:
        pt = _as_datetime(r.get('publish_time'))
        if pt is None:
            continue
        counter[f'{pt.year:04d}-{pt.month:02d}'] += 1
    return [{'month': m, 'count': c} for m, c in sorted(counter.items())]


def build_play_trend(rows: list[dict]) -> list[dict]:
    """按 publish_time 的「年-月」汇总播放量，升序；无发布时间或无播放量不计入。"""
    totals: dict[str, int] = {}
    for r in rows:
        pt = _as_datetime(r.get('publish_time'))
        play = r.get('play_count')
        if pt is None or not play:
            continue
        month = f'{pt.year:04d}-{pt.month:02d}'
        totals[month] = totals.get(month, 0) + int(play)
    return [{'month': m, 'plays': totals[m]} for m in sorted(totals)]


SORT_KEYS = {
    'likes': 'like_count',
    'plays': 'play_count',
    'comments': 'comment_count',
    'shares': 'share_count',
    'collects': 'collect_count',
}


def _sort_value(r: dict, sort_by: str):
    if sort_by == 'engagement':
        play = int(r.get('play_count') or 0)
        if not play:
            return -1
        return int(r.get('like_count') or 0) / play
    return int(r.get(SORT_KEYS.get(sort_by, 'like_count')) or 0)


def top_videos(rows: list[dict], limit: int = TOP_VIDEOS_LIMIT, sort_by: str = 'likes') -> list[dict]:
    """按指定维度降序取前 limit 条；互动率分母为 0 排后。"""
    ordered = sorted(rows, key=lambda r: _sort_value(r, sort_by), reverse=True)
    return ordered[:limit]
