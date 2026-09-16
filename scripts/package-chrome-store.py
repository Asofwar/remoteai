"""Build the Web Store ZIP from the same asset list as the desktop exporter."""

import json
import re
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "apps/desktop/src-tauri/resources/chrome-extension"
EXPORTER = ROOT / "apps/desktop/src-tauri/src/chrome_plugin/extension.rs"


def main():
    assets_block = EXPORTER.read_text(encoding="utf-8").split("assets![", 1)[1].split("]", 1)[0]
    names = re.findall(r'"([^"\n]+)"', assets_block)
    manifest = json.loads((SOURCE / "manifest.json").read_text(encoding="utf-8"))
    # The store signs the item with its own identity and rejects a development key.
    manifest.pop("key", None)
    output = ROOT / "dist/chrome-web-store" / f"codex-switch-chrome-{manifest['version']}.zip"
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in names:
            data = (SOURCE / name).read_bytes()
            if name == "manifest.json":
                data = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            archive.writestr(name, data)
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert "manifest.json" in archive.namelist()
        assert "key" not in json.loads(archive.read("manifest.json"))
    print(output)


if __name__ == "__main__":
    main()
