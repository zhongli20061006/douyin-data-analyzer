"""定时清理服务：开关/间隔判断、待删选择、备份 CSV 生成（纯逻辑）。"""
import csv
import io
import json
import os
import tempfile
from datetime import datetime, timedelta
from typing import Optional

CLEANUP_INTERVAL_DAYS = 30
CLEANUP_BATCH_SIZE = 200
CLEANUP_BACKUP_DIR = os.path.join(tempfile.gettempdir(), 'douyin_cleanup_backup')

BACKUP_FIELDS = (
    'video_id', 'video_title', 'video_desc', 'author_name', 'author_id',
    'publish_time', 'like_count', 'comment_count', 'share_count', 'collect_count',
    'play_count', 'video_url', 'cover_url', 'crawl_time', 'update_time',
)


def should_run_cleanup(enabled, last_clean_time: Optional[datetime], now: datetime,
                       interval_days: int = CLEANUP_INTERVAL_DAYS) -> bool:
    """开关开启且距上次执行满 interval_days 才执行；last_clean_time 为 None（首次）时执行。"""
    if not enabled:
        return False
    if last_clean_time is None:
        return True
    return (now - last_clean_time) >= timedelta(days=interval_days)


def select_stale_ids_per_author(rows: list[dict], batch_size: int = CLEANUP_BATCH_SIZE,
                                author_ids: Optional[list] = None) -> list[str]:
    """按作者分组选择待删 video_id。

    只处理 author_ids 中的作者（None/空列表 = 全部作者）；
    每组行数 > batch_size 时按 update_time 升序取最旧 batch_size 条，其余组跳过。
    """
    if not rows:
        return []
    allowed = None
    if author_ids is not None and len(author_ids) > 0:
        allowed = {str(a) for a in author_ids}
    groups = {}
    order = []
    for r in rows:
        aid = str(r.get('author_id') or '')
        if allowed is not None and aid not in allowed:
            continue
        if aid not in groups:
            groups[aid] = []
            order.append(aid)
        groups[aid].append(r)
    stale = []
    for aid in order:
        group = groups[aid]
        if len(group) <= batch_size:
            continue
        ordered = sorted(group, key=lambda r: r.get('update_time') or datetime.min)
        stale.extend(str(r['video_id']) for r in ordered[:batch_size])
    return stale


def build_backup_csv(rows: list[dict]) -> str:
    """把待删行转 CSV 文本（含全部业务字段，缺失字段留空）。"""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=BACKUP_FIELDS, extrasaction='ignore')
    writer.writeheader()
    for r in rows:
        writer.writerow({k: r.get(k) for k in BACKUP_FIELDS})
    return buf.getvalue()


DEFAULT_CLEANUP_CONFIG = {
    'enabled': False,
    'last_clean_time': None,
    'batch_size': CLEANUP_BATCH_SIZE,
    'authors': [],
}


def read_cleanup_config(path: str) -> dict:
    """读取清理配置；文件不存在或解析失败返回默认配置。"""
    if not os.path.exists(path):
        return dict(DEFAULT_CLEANUP_CONFIG)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (OSError, ValueError):
        return dict(DEFAULT_CLEANUP_CONFIG)
    cfg = dict(DEFAULT_CLEANUP_CONFIG)
    cfg.update({k: data[k] for k in cfg if k in data})
    return cfg


def write_cleanup_config(path: str, config: dict) -> None:
    """原子写入清理配置：写临时文件 + os.replace。"""
    directory = os.path.dirname(path) or '.'
    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix='.cleanup_config.', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise
