"""发布时间范围过滤：日期参数解析与 SQL 条件构建（纯逻辑）。"""
from datetime import date, datetime
from typing import Optional


def parse_date_param(value: Optional[str]) -> Optional[date]:
    """解析 'YYYY-MM-DD'；None/空串返回 None；格式非法抛 ValueError（中文消息）。"""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise ValueError(f'日期格式无效：{text}（应为 YYYY-MM-DD）') from None


def build_publish_filter(start_date: Optional[str], end_date: Optional[str]) -> tuple[str, list]:
    """构建 publish_time 闭区间过滤条件。

    返回 (clause, params)：无过滤时 clause=''、params=[]；
    非法日期或 start_date > end_date 抛 ValueError（中文消息）。
    """
    s = parse_date_param(start_date) if start_date else None
    e = parse_date_param(end_date) if end_date else None
    if s and e and s > e:
        raise ValueError('start_date 不能晚于 end_date')
    clauses = []
    params = []
    if s:
        clauses.append('publish_time >= %s')
        params.append(datetime.combine(s, datetime.min.time()))
    if e:
        clauses.append('publish_time <= %s')
        params.append(datetime(e.year, e.month, e.day, 23, 59, 59))
    return ' AND '.join(clauses), params
