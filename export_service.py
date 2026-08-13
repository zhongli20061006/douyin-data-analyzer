"""数据导出：列定义、CSV 与 xlsx 生成。"""
import csv
import io

import pandas as pd

EXPORT_MAX_ROWS = 10000

EXPORT_COLUMNS = [
    'video_id', 'video_title', 'video_desc', 'author_name', 'author_id',
    'publish_time', 'like_count', 'comment_count', 'share_count', 'collect_count',
    'play_count', 'video_url', 'cover_url', 'crawl_time', 'update_time',
]


def _plain(value):
    return '' if value is None else value


def build_csv(rows):
    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.DictWriter(output, fieldnames=EXPORT_COLUMNS, extrasaction='ignore')
    writer.writeheader()
    for row in rows:
        writer.writerow({c: _plain(row.get(c)) for c in EXPORT_COLUMNS})
    return output.getvalue()


def build_xlsx(rows):
    data = [{c: _plain(row.get(c)) for c in EXPORT_COLUMNS} for row in rows]
    df = pd.DataFrame(data, columns=EXPORT_COLUMNS)
    output = io.BytesIO()
    df.to_excel(output, index=False, engine='openpyxl')
    return output.getvalue()
