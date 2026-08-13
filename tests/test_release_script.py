"""发布脚本：白名单复制与默认模式替换。"""
import importlib.util


def _load_script():
    spec = importlib.util.spec_from_file_location('build_release', 'scripts/build_open_source_release.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_release_keep_list_has_core_files():
    keep = _load_script().KEEP_FILES
    assert any('api.py' in p for p in keep)
    assert any('extension_receiver.py' in p for p in keep)
    assert any('frontend/src' in p for p in keep)


def test_release_keep_list_excludes_crawler():
    keep = _load_script().KEEP_FILES
    assert not any('douyin_spider' in p for p in keep)
    assert not any('collector.py' in p for p in keep)


def test_replace_default_mode_limited():
    mod = _load_script()
    src = "modeSel.value = data[MODE_KEY] || 'unlimited'"
    assert mod.replace_default_mode(src) == "modeSel.value = data[MODE_KEY] || 'limited'"
