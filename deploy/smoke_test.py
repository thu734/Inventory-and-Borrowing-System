#!/usr/bin/env python3
"""BorrowBase public, read-only checks. No login, cookies, tokens or domain writes."""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get(url):
    opener = urllib.request.build_opener(NoRedirect)
    try:
        response = opener.open(urllib.request.Request(url, method="GET"), timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.code, response.headers, response.read(1024 * 1024)


def check(base, request=get, pause=time.sleep):
    parsed = urllib.parse.urlsplit(base)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.path or parsed.query or parsed.fragment):
        raise ValueError("An exact HTTPS origin is required")
    checks = [
        ("/api/health", 200, "ok"),
        ("/api/ready", 200, "ready"),
        ("/", 200, "html"),
        ("/api/v1/auth/me", 401, "UNAUTHENTICATED"),
        ("/api/v1/__deployment_probe_missing__", 404, "NOT_FOUND"),
    ]
    for path, expected_status, expected in checks:
        for attempt in range(3):
            try:
                status, headers, body = request(base + path)
                if status != expected_status:
                    raise ValueError("Unexpected HTTP status")
                if expected == "html":
                    valid = "text/html" in headers.get("Content-Type", "") and b'id="root"' in body
                elif expected == "ok":
                    valid = json.loads(body) == {"status": "ok"} and headers.get("Cache-Control") == "no-store"
                elif expected == "ready":
                    valid = json.loads(body).get("status") == "ready" and headers.get("Cache-Control") == "no-store"
                else:
                    valid = json.loads(body).get("error", {}).get("code") == expected
                if not valid:
                    raise ValueError("Unexpected response")
                break
            except (OSError, ValueError, TypeError, AttributeError):
                if attempt == 2:
                    raise RuntimeError("Smoke check failed: " + path) from None
                pause(2)
        print("PASS", path, expected_status)


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 deploy/smoke_test.py HTTPS_ORIGIN")
        check(sys.argv[1])
    except (ValueError, RuntimeError) as error:
        sys.exit(str(error))
