"""Writes app/version.json: the file list the Android app downloads to update itself.
Run by the Pages workflow before deploying. native = lowest APK versionCode these files need."""
import json
import os
import sys

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
NATIVE_MIN = 0
version = (sys.argv[1] if len(sys.argv) > 1 else "dev")[:12]
files = []
for root, _, names in os.walk(APP):
    for n in names:
        rel = os.path.relpath(os.path.join(root, n), APP).replace(os.sep, "/")
        if rel in ("version.json", "sw.js"):
            continue
        files.append(rel)
with open(os.path.join(APP, "version.json"), "w", encoding="utf-8") as f:
    json.dump({"version": version, "native": NATIVE_MIN, "files": sorted(files)}, f)
print(f"version.json: {version}, {len(files)} files")
