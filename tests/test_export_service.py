"""导出服务：列定义、CSV、xlsx 生成。"""
from datetime import datetime

from export_service import EXPORT_COLUMNS, EXPORT_MAX_ROWS, build_csv, build_xlsx


def make_row(**over):
    row = {
        'video_id': '1', 'video_title': '标题', 'video_desc': '描述',
        'author_name': '作者', 'author_id': 'A1',
        'publish_time': datetime(2026, 1, 1),
        'like_count': 1, 'comment_count': 1, 'share_count': 1,
        'collect_count': 66, 'play_count': 0,
        'video_url': 'u', 'cover_url': 'c',
        'crawl_time': datetime(2026, 5, 20), 'update_time': datetime(2026, 8, 10),
    }
    row.update(over)
    return row


def test_export_columns_include_collect_count():
    assert 'collect_count' in EXPORT_COLUMNS


def test_export_max_rows_constant():
    assert EXPORT_MAX_ROWS == 10000


def test_build_csv_bom_header_and_row():
    text = build_csv([make_row(video_title='标题,带逗号\n换行')])
    assert text.startswith('\ufeff')
    assert 'collect_count' in text.splitlines()[0]
    assert '"标题,带逗号\n换行"' in text


def test_build_xlsx_valid_workbook():
    import io
    import openpyxl
    content = build_xlsx([make_row()])
    assert content[:2] == b'PK'
    wb = openpyxl.load_workbook(io.BytesIO(content))
    assert wb.active.cell(1, 1).value == 'video_id'
