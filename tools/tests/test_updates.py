"""LAN APK server (tools/serve_updates.py)."""
import hashlib
import json


def test_serve_updates_reads_the_built_apk(tmp_path):
    from serve_updates import apk_info
    assert apk_info(tmp_path) is None
    (tmp_path / "app-debug.apk").write_bytes(b"apk")
    (tmp_path / "output-metadata.json").write_text(json.dumps({"elements": [
        {"outputFile": "app-debug.apk", "versionCode": 29400000, "versionName": "1.0 (2026-10-12 10:00)"}]}))
    meta, apk = apk_info(tmp_path)
    assert meta["versionCode"] == 29400000 and meta["size"] == 3 and meta["sha256"] == hashlib.sha256(b"apk").hexdigest()
    assert apk.name == "app-debug.apk" and meta["url"] == "banca.apk"
