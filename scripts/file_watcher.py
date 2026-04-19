"""File watcher for data/incoming/

Watches data/incoming/ for new or moved-in files and automatically runs
ingestion + pipeline rebuild after a 15-second debounce window.

The debounce is intentional: staff often drop several files at once (one per
report type). The timer resets on every new file event so the pipeline fires
once after all drops are complete, not once per file.

Usage
-----
    PYTHONPATH=. python scripts/file_watcher.py

Leave it running in a terminal while working. Drop files into any subfolder
under data/incoming/ and the pipeline fires automatically ~15 seconds later.

Press Ctrl+C to stop.
"""

import os
import subprocess
import sys
import threading
import time
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

INCOMING_DIR = Path("data/incoming")
DEBOUNCE_SECONDS = 15


class IncomingHandler(FileSystemEventHandler):
    def __init__(self) -> None:
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def on_created(self, event) -> None:
        if not event.is_directory:
            fname = Path(event.src_path).name
            # Skip hidden/temp files (e.g. .DS_Store, ~$file.xlsx)
            if not fname.startswith(".") and not fname.startswith("~"):
                print(f"[WATCHER] Detected: {event.src_path}")
                self._schedule()

    def on_moved(self, event) -> None:
        # Covers files moved/renamed into the watched folder
        if not event.is_directory and str(INCOMING_DIR) in event.dest_path:
            print(f"[WATCHER] Moved in: {event.dest_path}")
            self._schedule()

    def _schedule(self) -> None:
        with self._lock:
            if self._timer is not None:
                self._timer.cancel()
            self._timer = threading.Timer(DEBOUNCE_SECONDS, self._run)
            self._timer.daemon = True
            self._timer.start()
            print(f"[WATCHER] Pipeline scheduled in {DEBOUNCE_SECONDS}s "
                  f"(timer resets on each new file).")

    def _run(self) -> None:
        env = {**os.environ, "PYTHONPATH": "."}

        print("\n[WATCHER] ── Starting ingestion ──────────────────────────")
        try:
            subprocess.run(
                [sys.executable, "scripts/ingest_all.py"],
                check=True,
                env=env,
            )
        except subprocess.CalledProcessError as e:
            print(f"[WATCHER] ERROR: ingestion failed (exit {e.returncode}). "
                  "Skipping pipeline rebuild.\n")
            return

        print("[WATCHER] ── Ingestion done — rebuilding derived tables ──")
        try:
            subprocess.run(
                [sys.executable, "pipelines/weekly_pipeline.py"],
                check=True,
                env=env,
            )
            print("[WATCHER] ── Done. Dashboard data is now fresh. ────────\n")
        except subprocess.CalledProcessError as e:
            print(f"[WATCHER] ERROR: pipeline rebuild failed (exit {e.returncode}). "
                  "Raw data was ingested but derived tables may be stale.\n")


def main() -> None:
    if not INCOMING_DIR.exists():
        print(f"[WATCHER] ERROR: {INCOMING_DIR.resolve()} does not exist. "
              "Create it or run from the project root.")
        sys.exit(1)

    handler = IncomingHandler()
    observer = Observer()
    observer.schedule(handler, str(INCOMING_DIR), recursive=True)
    observer.start()

    print(f"[WATCHER] Watching {INCOMING_DIR.resolve()}")
    print(f"[WATCHER] Drop files to trigger ingestion + rebuild after {DEBOUNCE_SECONDS}s.")
    print("[WATCHER] Press Ctrl+C to stop.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[WATCHER] Stopping...")
        observer.stop()

    observer.join()
    print("[WATCHER] Stopped.")


if __name__ == "__main__":
    main()
