"""Serve only the cell viewer and its reference image; manage a detached process."""
import argparse
import functools
import http.server
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parent
STATE = ROOT / "server.json"


class Handler(http.server.SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(404)

    def do_GET(self):
        if self.path == "/health":
            data = json.dumps({"app": "cell-viewer", "pid": os.getpid()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        elif self.path == "/reference.jpg":
            data = (ROOT.parent / "细胞.jpg").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def health(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as r:
            value = json.load(r)
            return value if value.get("app") == "cell-viewer" else None
    except (OSError, ValueError):
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--start", action="store_true")
    parser.add_argument("--status", action="store_true")
    args = parser.parse_args()
    if args.status or args.start:
        state = json.loads(STATE.read_text()) if STATE.exists() else None
        if state and (value := health(state["port"])) and value["pid"] == state["pid"]:
            print(json.dumps({**state, "status": "running"}))
            return
        if args.status:
            print("Cell viewer is not running")
            sys.exit(1)
    if args.start:
        port = args.port
        for candidate in range(port, port + 20):
            try:
                with socket.socket() as probe:
                    probe.bind((args.host, candidate))
                port = candidate
                break
            except OSError:
                continue
        else:
            raise RuntimeError("No available viewer port")
        with (ROOT / "server.log").open("ab") as log:
            proc = subprocess.Popen([sys.executable, str(ROOT / "serve.py"), "--host", args.host, "--port", str(port)], stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
        for _ in range(50):
            if (value := health(port)) and value["pid"] == proc.pid:
                state = {"pid": proc.pid, "port": port, "host": args.host, "url": f"http://127.0.0.1:{port}"}
                STATE.write_text(json.dumps(state, indent=2) + "\n")
                print(json.dumps({**state, "status": "running"}))
                return
            if proc.poll() is not None:
                raise RuntimeError(f"Server exited; see {ROOT / 'server.log'}")
            time.sleep(.1)
        raise RuntimeError("Server health check timed out")
    server = http.server.ThreadingHTTPServer((args.host, args.port), functools.partial(Handler, directory=str(ROOT)))
    print(f"Cell viewer listening on {args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
