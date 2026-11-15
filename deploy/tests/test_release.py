import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "deploy" / "release.sh"

SHA_A = "a" * 40
SHA_B = "b" * 40


FAKE_GCLOUD = r"""#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

args = sys.argv[1:]
log = Path(os.environ["MOCK_LOG"])
state = Path(os.environ["MOCK_STATE"])
failure = os.environ.get("MOCK_FAILURE", "")

with log.open("a") as f:
    f.write(json.dumps(args) + "\n")

def fail():
    sys.exit(1)

if args[:4] == ["artifacts", "docker", "images", "describe"]:
    tag = args[4]

    if failure == "missing_app" and "maintenance" not in tag:
        fail()

    if failure == "missing_maint" and "maintenance" in tag:
        fail()

    if failure == "invalid_digest":
        print(tag.rsplit(":", 1)[0] + "@sha256:invalid")
        sys.exit(0)

    if "maintenance" in tag:
        digit = "3"
    elif tag.endswith(":" + "a" * 40):
        digit = "1"
    else:
        digit = "2"

    print(tag.rsplit(":", 1)[0] + "@sha256:" + digit * 64)
    sys.exit(0)

if args[:3] == ["run", "jobs", "describe"]:
    sys.exit(0)

if args[:3] == ["run", "jobs", "update"]:
    sys.exit(0)

if args[:3] == ["run", "jobs", "execute"]:
    if failure == "migration":
        fail()
    sys.exit(0)

if args[:3] == ["run", "services", "update"]:
    if failure == "deployment":
        fail()
    sys.exit(0)

if args[:3] == ["run", "revisions", "list"]:
    if failure == "missing_revision":
        print("borrowbase-new")
    else:
        print("borrowbase-old")
        print("borrowbase-new")
    sys.exit(0)

if args[:3] == ["run", "revisions", "describe"]:
    revision = args[3]

    if failure == "revision_mismatch":
        digit = "4"
    else:
        digit = "1" if revision == "borrowbase-old" else "2"

    prefix = (
        "asia-southeast1-docker.pkg.dev/"
        "cpe334-borrowbase/borrowbase/borrowbase"
    )

    print(prefix + "@sha256:" + digit * 64)
    sys.exit(0)

if args[:3] == ["run", "services", "update-traffic"]:
    if failure == "traffic":
        fail()

    selection = next(
        x for x in args if x.startswith("--to-revisions=")
    )
    revision = selection.split("=", 1)[1].rsplit("=", 1)[0]
    state.write_text(revision)
    sys.exit(0)

if args[:3] == ["run", "services", "describe"]:
    if "--format=json" in args:
        revision = state.read_text() if state.exists() else "borrowbase-old"
        print(json.dumps({
            "status": {
                "traffic": [{
                    "revisionName": revision,
                    "percent": 100
                }]
            }
        }))
        sys.exit(0)

    if "value(status.latestReadyRevisionName)" in " ".join(args):
        print("borrowbase-new")
        sys.exit(0)

    if "value(status.url)" in " ".join(args):
        print("https://borrowbase-example.run.app")
        sys.exit(0)

    sys.exit(0)

fail()
"""


class ReleaseTests(unittest.TestCase):

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

        self.directory = Path(self.temp.name)
        self.bin_dir = self.directory / "bin"
        self.bin_dir.mkdir()

        fake = self.bin_dir / "gcloud"
        fake.write_text(FAKE_GCLOUD)
        fake.chmod(0o755)

        self.log = self.directory / "commands.jsonl"
        self.state = self.directory / "traffic.txt"
        self.log.write_text("")

    def execute(self, mode, sha=SHA_B, failure=""):
        env = os.environ.copy()
        env.update({
            "PATH": str(self.bin_dir) + os.pathsep + env["PATH"],
            "DRY_RUN": "0",
            "PROJECT_ID": "cpe334-borrowbase",
            "REGION": "asia-southeast1",
            "MOCK_LOG": str(self.log),
            "MOCK_STATE": str(self.state),
            "MOCK_FAILURE": failure,
            "GITHUB_STEP_SUMMARY": str(
                self.directory / "summary.md"
            ),
        })

        return subprocess.run(
            ["bash", str(SCRIPT), mode, sha],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )

    def calls(self):
        return [
            json.loads(line)
            for line in self.log.read_text().splitlines()
        ]

    def has_call(self, prefix):
        return any(
            call[:len(prefix)] == prefix
            for call in self.calls()
        )

    def test_normal_release(self):
        result = self.execute("release")
        self.assertEqual(result.returncode, 0, result.stderr)

        self.assertTrue(
            self.has_call(["run", "jobs", "execute"])
        )
        self.assertTrue(
            self.has_call(["run", "services", "update"])
        )
        self.assertTrue(
            self.has_call(["run", "services", "update-traffic"])
        )

        update = next(
            c for c in self.calls()
            if c[:3] == ["run", "services", "update"]
        )
        self.assertIn("--no-traffic", update)

        calls = self.calls()
        migration_index = next(
            i for i, c in enumerate(calls)
            if c[:3] == ["run", "jobs", "execute"]
        )
        deploy_index = next(
            i for i, c in enumerate(calls)
            if c[:3] == ["run", "services", "update"]
        )
        traffic_index = next(
            i for i, c in enumerate(calls)
            if c[:3] == ["run", "services", "update-traffic"]
        )

        self.assertLess(migration_index, deploy_index)
        self.assertLess(deploy_index, traffic_index)

    def test_historical_rollback_does_not_migrate_or_deploy(self):
        result = self.execute("rollback", SHA_A)
        self.assertEqual(result.returncode, 0, result.stderr)

        self.assertFalse(
            self.has_call(["run", "jobs"])
        )
        self.assertFalse(
            self.has_call(["run", "services", "update"])
        )
        self.assertTrue(
            self.has_call(["run", "services", "update-traffic"])
        )
        self.assertEqual(self.state.read_text(), "borrowbase-old")

    def test_missing_application_image(self):
        result = self.execute(
            "rollback", SHA_A, "missing_app"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(
            self.has_call(["run", "services", "update-traffic"])
        )

    def test_missing_maintenance_image(self):
        result = self.execute(
            "release", SHA_B, "missing_maint"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(
            self.has_call(["run", "jobs", "execute"])
        )

    def test_invalid_image_digest(self):
        result = self.execute(
            "release", SHA_B, "invalid_digest"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(
            self.has_call(["run", "services", "update-traffic"])
        )

    def test_revision_image_mismatch(self):
        result = self.execute(
            "release", SHA_B, "revision_mismatch"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(
            self.has_call(["run", "services", "update-traffic"])
        )

    def test_missing_historical_revision(self):
        result = self.execute(
            "rollback", SHA_A, "missing_revision"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(
            self.has_call(["run", "services", "update-traffic"])
        )

    def test_migration_failure_blocks_deployment(self):
        result = self.execute(
            "release", SHA_B, "migration"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(
            self.has_call(["run", "services", "update"])
        )

    def test_deployment_failure_blocks_traffic(self):
        result = self.execute(
            "release", SHA_B, "deployment"
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(
            self.has_call(["run", "services", "update-traffic"])
        )

    def test_traffic_failure_records_evidence(self):
        result = self.execute(
            "rollback", SHA_A, "traffic"
        )
        self.assertNotEqual(result.returncode, 0)

        summary = (
            self.directory / "summary.md"
        ).read_text()

        self.assertIn("FAILED", summary)
        self.assertIn("traffic-switch", summary)
        self.assertIn(SHA_A, summary)

    def test_dry_run_does_not_call_cloud(self):
        env = os.environ.copy()
        env["DRY_RUN"] = "1"

        result = subprocess.run(
            ["bash", str(SCRIPT), "rollback", SHA_A],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.returncode, 0)
        self.assertIn("No cloud operations", result.stdout)

    def finish_workflow(self, mode, failure="", smoke_exit=0):
        # Execute the workflow's actual shell blocks; replace only the HTTP smoke
        # command. gcloud remains the same offline fixture used by release.sh.
        (self.directory / "summary.md").write_text("")
        workflow = (ROOT / ".github/workflows/deploy.yml").read_text()

        def run_block(name):
            step = workflow.split("      - name: " + name + "\n", 1)[1]
            step = step.split("\n      - name:", 1)[0]
            return textwrap.dedent(step.split("        run: |\n", 1)[1])

        deployment = self.execute(mode, failure=failure)
        env = {
            **os.environ,
            "PATH": str(self.bin_dir) + os.pathsep + os.environ["PATH"],
            "PROJECT_ID": "cpe334-borrowbase",
            "REGION": "asia-southeast1",
            "MOCK_LOG": str(self.log),
            "MOCK_STATE": str(self.state),
            "MOCK_FAILURE": "",
            "GITHUB_STEP_SUMMARY": str(self.directory / "summary.md"),
            "GITHUB_SERVER_URL": "https://github.com",
            "GITHUB_REPOSITORY": "thu734/Inventory-and-Borrowing-System",
            "GITHUB_RUN_ID": "offline-test",
            "RELEASE_MODE": mode,
            "RELEASE_SHA": SHA_B,
            "TEST_SMOKE_EXIT": str(smoke_exit),
        }
        smoke = None
        if deployment.returncode == 0:
            smoke = subprocess.run(
                ["bash", "-c", '''python3() {
  if [[ "$1" == deploy/smoke_test.py ]]; then
    return "$TEST_SMOKE_EXIT"
  fi
  command python3 "$@"
}
''' + run_block("Smoke test public URL")],
                cwd=ROOT, env=env, capture_output=True, text=True, timeout=30,
            )

        # These outcomes are supplied by the Actions runner in the real workflow.
        env["SMOKE_OUTCOME"] = (
            "skipped" if smoke is None else
            "success" if smoke.returncode == 0 else "failure"
        )
        env["JOB_RESULT"] = (
            "success" if deployment.returncode == 0 and
            smoke is not None and smoke.returncode == 0 else "failure"
        )
        report = subprocess.run(
            ["bash", "-c", run_block("Record workflow result")],
            cwd=ROOT, env=env, capture_output=True, text=True, timeout=30,
        )
        return deployment, smoke, report, (self.directory / "summary.md").read_text()

    def test_final_success_requires_smoke_success(self):
        for mode in ["release", "rollback"]:
            with self.subTest(mode=mode):
                deployment, smoke, report, summary = self.finish_workflow(mode)
                self.assertEqual(deployment.returncode, 0, deployment.stderr)
                self.assertEqual(smoke.returncode, 0, smoke.stderr)
                self.assertEqual(report.returncode, 0, report.stderr)
                self.assertIn("Final release status: SUCCESS", summary)
                self.assertIn("Smoke test: PASS", summary)
                self.assertIn(SHA_B, summary)
                self.assertIn("Application digest:", summary)
                self.assertIn("Cloud Run revision: borrowbase-new", summary)
                self.assertNotIn("- Status: SUCCESS", summary)

    def test_smoke_failure_reports_failed_and_preserves_failure(self):
        for mode in ["release", "rollback"]:
            with self.subTest(mode=mode):
                deployment, smoke, report, summary = self.finish_workflow(
                    mode, smoke_exit=7,
                )
                self.assertEqual(deployment.returncode, 0, deployment.stderr)
                self.assertEqual(smoke.returncode, 7)
                self.assertNotEqual(report.returncode, 0)
                self.assertIn("Final release status: FAILED", summary)
                self.assertIn("Smoke test: FAIL", summary)
                self.assertIn("Application digest:", summary)
                self.assertIn("Cloud Run revision: borrowbase-new", summary)
                self.assertNotIn("SUCCESS", summary)

    def test_deployment_failure_reports_smoke_not_run(self):
        for mode, failure in [("release", "migration"), ("rollback", "traffic")]:
            with self.subTest(mode=mode):
                deployment, smoke, report, summary = self.finish_workflow(
                    mode, failure=failure,
                )
                self.assertNotEqual(deployment.returncode, 0)
                self.assertIsNone(smoke)
                self.assertNotEqual(report.returncode, 0)
                self.assertIn("Final release status: FAILED", summary)
                self.assertIn("Smoke test: NOT RUN", summary)
                self.assertIn("Migration execution failed" if mode == "release"
                              else "Traffic switch failed", summary)
                self.assertNotIn("SUCCESS", summary)


if __name__ == "__main__":
    unittest.main()
