#!/usr/bin/env python3
"""Refresh DO Woo CSV dumps via SSH (read-only). Requires DO_SSH_PASS env."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[2]
DUMP = ROOT / "data/compare/dump_do_woo.py"
OUT_DIR = ROOT / "data/compare"
META = OUT_DIR / "do-fetch-meta.json"

HOST = os.environ.get("DO_SSH_HOST", "134.209.146.175")
USER = os.environ.get("DO_SSH_USER", "root")
PASSWORD = os.environ.get("DO_SSH_PASS", "")


def main() -> None:
    if not PASSWORD:
        print("Set DO_SSH_PASS to refresh DO dump.", file=sys.stderr)
        sys.exit(1)
    if not DUMP.exists():
        print(f"Missing {DUMP}", file=sys.stderr)
        sys.exit(1)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)

    remote_dir = "/tmp/woo_compare_refresh"
    remote_script = f"{remote_dir}/dump_do_woo.py"
    client.exec_command(f"mkdir -p {remote_dir}")[1].read()

    sftp = client.open_sftp()
    sftp.put(str(DUMP), remote_script)
    sftp.close()

    # dump writes to /tmp/woo_compare — patch by running from dir with symlink or copy script output path
    # Script hardcodes /tmp/woo_compare — run as-is and fetch from there
    _, stdout, stderr = client.exec_command(f"python3 {remote_script}", timeout=300)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    print(out)
    if err.strip():
        print(err, file=sys.stderr)
    if code != 0:
        sys.exit(code)

    sftp = client.open_sftp()
    for name in ("do_products.csv", "do_variants.csv", "do_attachments.csv"):
        remote = f"/tmp/woo_compare/{name}"
        local = OUT_DIR / name
        sftp.get(remote, str(local))
        print(f"Fetched {local}")
    sftp.close()
    client.close()

    META.write_text(
        __import__("json").dumps(
            {
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "source": f"DigitalOcean MySQL via SSH {USER}@{HOST}",
                "script": "data/compare/dump_do_woo.py",
            },
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
