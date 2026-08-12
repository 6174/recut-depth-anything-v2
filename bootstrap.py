"""
[INPUT]: 平台注入的 RECUT_MODELS_DIR 与标准库 HTTPS/ZIP 能力
[OUTPUT]: 在共享模型目录准备 Depth Anything V2 官方代码
[POS]: depth-anything 的跨平台代码准备兜底；不创建 venv、不安装 pip 依赖
[PROTOCOL]: 变更时更新此头部，然后检查 README.md
"""

from __future__ import annotations

import os
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path


def install_archive(url: str, target: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="recut-depth-bootstrap-") as raw:
        temporary = Path(raw)
        archive = temporary / "source.zip"
        print("[depth] 正在下载官方代码。", flush=True)
        urllib.request.urlretrieve(url, archive)
        with zipfile.ZipFile(archive) as bundle:
            roots = {name.split("/", 1)[0] for name in bundle.namelist() if "/" in name}
            if len(roots) != 1:
                raise RuntimeError("官方代码归档结构无效")
            bundle.extractall(temporary)
        source = temporary / roots.pop()
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.rmtree(target, ignore_errors=True)
        shutil.move(str(source), target)


def main() -> None:
    root = Path(os.environ["RECUT_MODELS_DIR"]) / "depth-anything-v2"
    repository = root / "repository"
    if (repository / "depth_anything_v2" / "dpt.py").is_file():
        print("[depth] 官方代码已就绪。", flush=True)
        return
    install_archive("https://github.com/DepthAnything/Depth-Anything-V2/archive/refs/heads/main.zip", repository)
    print("[depth] 官方代码已就绪。", flush=True)


if __name__ == "__main__":
    main()
