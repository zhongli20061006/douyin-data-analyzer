"""SpiderManager 日志读取：混合编码字节解码与缺失文件处理。"""
from api import decode_log_bytes, read_log_tail


def test_decode_log_bytes_handles_utf8():
    assert '第一行正常' in decode_log_bytes('第一行正常\n'.encode('utf-8'))


def test_decode_log_bytes_falls_back_to_gbk():
    # 早期子进程用 GBK 写入的字节，UTF-8 解码失败时回退 GBK
    assert '第二行中文内容' in decode_log_bytes('第二行中文内容'.encode('gbk'))


def test_decode_log_bytes_handles_mixed_lines():
    # 同一文件里既有 UTF-8 行又有 GBK 行时，应逐行正确解码
    raw = '第一行正常\n'.encode('utf-8') + '第二行中文内容\n'.encode('gbk') + '第三行正常'.encode('utf-8')
    lines = decode_log_bytes(raw).splitlines()
    assert lines[0] == '第一行正常'
    assert lines[1] == '第二行中文内容'
    assert lines[2] == '第三行正常'


def test_read_log_tail_missing_file_returns_empty():
    assert read_log_tail('C:/definitely/not/exist.log') == []


def test_spider_manager_has_get_log_method():
    from api import SpiderManager

    assert hasattr(SpiderManager, 'get_log')
