import contextlib
import importlib.util
import io
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('smoke', Path(__file__).resolve().parents[1] / 'smoke_test.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


class SmokeTests(unittest.TestCase):
    def test_actual_borrowbase_responses_and_only_get_paths(self):
        calls = []
        def fake(url):
            calls.append(url)
            if url.endswith('/api/ready'):
                return 200, {'Cache-Control': 'no-store'}, b'{"status":"ready"}'
            if url.endswith('/auth/me'):
                return 401, {}, b'{"error":{"code":"UNAUTHENTICATED"}}'
            if url.endswith('missing__'):
                return 404, {}, b'{"error":{"code":"NOT_FOUND"}}'
            return 200, {'Content-Type': 'text/html'}, b'<html><div id="root"></div></html>'
        with contextlib.redirect_stdout(io.StringIO()):
            smoke.check('https://borrowbase.example.test', request=fake)
        self.assertEqual(len(calls), 4)
        self.assertFalse(any('login' in path or 'logout' in path for path in calls))

    def test_failure_is_sanitized_and_retried(self):
        calls = []
        def fake(url):
            calls.append(url)
            return 503, {}, b'private database details'
        with self.assertRaisesRegex(RuntimeError, '^Smoke check failed: /api/ready$'):
            smoke.check('https://borrowbase.example.test', request=fake, pause=lambda _: None)
        self.assertEqual(len(calls), 3)

    def test_invalid_origins_fail_before_network(self):
        for origin in ['http://localhost:3000', 'https://example.test/', 'https://user:secret@example.test', 'https://example.test?token=x']:
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                smoke.check(origin, request=lambda _: self.fail('Network must not be called'))

    def test_html_api_fallback_is_not_a_passing_readiness_response(self):
        with self.assertRaisesRegex(RuntimeError, '/api/ready'):
            smoke.check('https://borrowbase.example.test', request=lambda _: (200, {}, b'<html>wrong route</html>'), pause=lambda _: None)


if __name__ == '__main__':
    unittest.main()
