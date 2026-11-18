#!/usr/bin/env python3
"""Unpack the configuration bundle beside the compose file.

    unpack.py BUNDLE.json TARGET_DIR

The bundle is {"version": 1, "files": {"relative/path": {"mode": "0644",
"content": "..."}}} (deploy/terraform/modules/stack-config). Files are
replaced atomically, and access-control snippets (site.d/*.caddy) that are
no longer in the bundle are removed: a deleted allowlist must stop applying.
"""
import json
import os
import sys
import tempfile


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    bundle_path, target = sys.argv[1], os.path.abspath(sys.argv[2])

    with open(bundle_path, encoding="utf-8") as handle:
        bundle = json.load(handle)
    if bundle.get("version") != 1 or not isinstance(bundle.get("files"), dict):
        print("unpack: not a version 1 bundle", file=sys.stderr)
        return 1
    files = bundle["files"]
    if ".env" not in files or "docker-compose.yml" not in files:
        print("unpack: the bundle has no .env or docker-compose.yml", file=sys.stderr)
        return 1

    resolved = {}
    for relative, entry in files.items():
        path = os.path.normpath(os.path.join(target, relative))
        if os.path.isabs(relative) or not path.startswith(target + os.sep):
            print(f"unpack: refusing path outside the target: {relative}", file=sys.stderr)
            return 1
        resolved[path] = (int(entry["mode"], 8), entry["content"])

    for path, (mode, content) in resolved.items():
        directory = os.path.dirname(path)
        os.makedirs(directory, mode=0o755, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(dir=directory, prefix=".unpack-")
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
                handle.write(content)
            os.chmod(temporary, mode)
            os.replace(temporary, path)
        except BaseException:
            if os.path.exists(temporary):
                os.unlink(temporary)
            raise

    site_dir = os.path.join(target, "site.d")
    os.makedirs(site_dir, mode=0o755, exist_ok=True)
    for name in os.listdir(site_dir):
        path = os.path.join(site_dir, name)
        if name.endswith(".caddy") and path not in resolved:
            os.unlink(path)

    return 0


if __name__ == "__main__":
    sys.exit(main())
