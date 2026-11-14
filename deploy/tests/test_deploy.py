"""Offline script tests: source functions; replace every cloud call and HTTP smoke."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "deploy/deploy.sh"

STUB = r'''
import json,os,sys
from pathlib import Path
p=Path(os.environ['STUB_STATE']); s=json.loads(p.read_text()); a=sys.argv[1:]
s['calls'].append(a)
def save():p.write_text(json.dumps(s))
def flag(name):return next((x.split('=',1)[1] for x in a if x.startswith(name+'=')),'')
def done(value=''):save();print(value);sys.exit(0)
def absent():save();print('NOT_FOUND',file=sys.stderr);sys.exit(1)
scenario=s['scenario']
if a[:3]==['artifacts','repositories','describe']:
 if scenario=='permission':save();print('PERMISSION_DENIED',file=sys.stderr);sys.exit(1)
 if s.get('artifact'):done()
 absent()
if a[:3]==['artifacts','repositories','create']:s['artifact']=True;done()
if a[:3]==['sql','instances','describe']:
 if not s.get('sql'):absent()
 done(json.dumps({'databaseVersion':'POSTGRES_15' if scenario=='wrong-engine' else 'POSTGRES_16','region':'asia-southeast1'}))
if a[:3]==['sql','instances','create']:s['sql']=True;done()
if a[:3]==['sql','databases','describe']:
 if s.get('database'):done()
 absent()
if a[:3]==['sql','databases','create']:s['database']=True;done()
if a[:3]==['iam','service-accounts','describe']:
 if a[3] in s.get('accounts',[]):done()
 absent()
if a[:3]==['iam','service-accounts','create']:
 s.setdefault('accounts',[]).append(a[3]+'@cpe334-borrowbase.iam.gserviceaccount.com');done()
if a[:2]==['secrets','describe']:
 if a[2] in s['secrets']:done()
 absent()
if a[:3]==['secrets','versions','describe']:
 done('ENABLED' if flag('--format')=='value(state)' else 'projects/stub/secrets/stub/versions/1')
if a[:3]==['secrets','versions','add']:
 s['secrets'][a[3]]=sys.stdin.read();done()
if a[:3]==['secrets','versions','access']:done(s['secrets'][flag('--secret')])
if a[:3]==['sql','users','list']:done('borrowbase' if scenario=='credential-conflict' else '')
if a[:4]==['run','jobs','describe','borrowbase-bootstrap']:
 if s.get('bootstrap'):done('{}')
 absent()
if a[:3]==['run','jobs','create']:s['bootstrap']=True;done()
if a[:3]==['run','jobs','execute'] and ((scenario=='migration-failure' and a[3]=='borrowbase-migrate') or (scenario=='bootstrap-failure' and a[3]=='borrowbase-bootstrap')):
 save();print('raw database error must not escape',file=sys.stderr);sys.exit(1)
if a[:4]==['artifacts','docker','images','describe']:
 image=a[4];done(image.rsplit(':',1)[0]+'@sha256:'+('b' if '-maintenance:' in image else 'a')*64)
if a[:3]==['run','deploy','borrowbase']:
 s['service']=True;s['image']=flag('--image');done()
if a[:4]==['run','services','describe','borrowbase']:
 if not s.get('service'):absent()
 done('borrowbase-00002-test' if flag('--format')=='value(status.latestReadyRevisionName)' else 'https://borrowbase-example.asia-southeast1.run.app')
if a[:3]==['run','revisions','describe']:done(s['image'])
done()
'''


class DeployTests(unittest.TestCase):
    def run_stub(self, bootstrap=False, scenario='fresh', state=None):
        with tempfile.TemporaryDirectory(prefix='borrowbase-deploy-offline-') as directory:
            directory = Path(directory)
            stub = directory / 'cloud.py'
            stub.write_text(STUB)
            record = directory / 'state.json'
            record.write_text(json.dumps(state or {'calls': [], 'secrets': {}, 'scenario': scenario}))
            # No entrypoint/dry-run invocation. All lifecycle operations below are mocks.
            wrapper = directory / 'test.sh'
            wrapper.write_text('''source "$DEPLOY_SCRIPT"
DRY_RUN=0
validate_release() { RELEASE_SHA=1111111111111111111111111111111111111111; }
gcloud() { python3 "$CLOUD_STUB" "$@"; }
verify_service() { printf 'OFFLINE HTTP verification stub\\n'; }
main "$@"
''')
            env = {**os.environ, 'DEPLOY_SCRIPT': str(SCRIPT), 'CLOUD_STUB': str(stub),
                   'STUB_STATE': str(record), 'PROJECT_ID': 'cpe334-borrowbase', 'REGION': 'asia-southeast1'}
            result = subprocess.run(['bash', str(wrapper)] + (['--bootstrap-demo'] if bootstrap else []),
                                    env=env, capture_output=True, text=True, timeout=30)
            return result, json.loads(record.read_text())

    def test_default_is_migration_only_with_two_digest_pinned_images(self):
        result, state = self.run_stub()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = state['calls']
        self.assertFalse(any('db:seed' in arg for call in calls for arg in call))
        self.assertFalse(any('borrowbase-bootstrap' in call for call in calls))
        job = next(c for c in calls if c[:3] == ['run', 'jobs', 'deploy'])
        self.assertIn('--args=run,db:migrate', job)
        self.assertTrue(any('borrowbase-maintenance@sha256:' in arg for arg in job))
        sql = next(c for c in calls if c[:3] == ['sql', 'instances', 'create'])
        self.assertIn('--database-version=POSTGRES_16', sql)
        self.assertIn('--edition=enterprise', sql)
        self.assertIn('--no-storage-auto-increase', sql)
        service = [c for c in calls if c[:3] == ['run', 'deploy', 'borrowbase']]
        self.assertEqual(len(service), 2)
        self.assertIn('--no-allow-unauthenticated', service[0])
        self.assertIn('--allow-unauthenticated', service[1])
        self.assertIn('--set-env-vars=NODE_ENV=production,APP_ORIGIN=https://borrowbase-example.asia-southeast1.run.app', service[1])
        self.assertFalse(any('SEED_' in arg for c in service for arg in c))
        self.assertIn('--max-instances=1', service[1])
        self.assertIn('--port=3000', service[1])
        self.assertNotIn('roles/owner', str(calls))
        # Generated test-only credentials remain in the fake secret store, never logs.
        output = result.stdout + result.stderr
        self.assertTrue(all(value not in output for value in state['secrets'].values()))

    def test_bootstrap_is_explicit_separate_and_not_repeated(self):
        result, state = self.run_stub(bootstrap=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        bootstrap = [c for c in state['calls'] if c[:3] == ['run', 'jobs', 'create']]
        self.assertEqual(len(bootstrap), 1)
        self.assertIn('--args=run,db:seed', bootstrap[0])
        self.assertIn('--max-retries=0', bootstrap[0])
        self.assertTrue(any('SEED_BORROWER_PASSWORD=' in arg and 'SEED_CUSTODIAN_PASSWORD=' in arg for arg in bootstrap[0]))
        state['calls'] = []
        repeat, state = self.run_stub(bootstrap=True, state=state)
        self.assertNotEqual(repeat.returncode, 0)
        self.assertFalse(any(c[:3] == ['run', 'jobs', 'execute'] for c in state['calls']))

    def test_migration_failure_prevents_service_deployment_and_hides_raw_error(self):
        result, state = self.run_stub(scenario='migration-failure')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c[:2] == ['run', 'deploy'] for c in state['calls']))
        self.assertNotIn('raw database error', result.stdout + result.stderr)

    def test_existing_user_without_secret_does_not_reset_password(self):
        result, state = self.run_stub(scenario='credential-conflict')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c[:2] == ['sql', 'users'] and c[2] != 'list' for c in state['calls']))

    def test_resource_lookup_error_does_not_trigger_resource_creation(self):
        result, state = self.run_stub(scenario='permission')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c[:3] == ['artifacts', 'repositories', 'create'] for c in state['calls']))

    def test_wrong_database_engine_stops_before_migration(self):
        result, state = self.run_stub(scenario='wrong-engine')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c[:3] == ['run', 'jobs', 'execute'] for c in state['calls']))

    def test_rerun_preserves_secrets_and_does_not_recreate_resources(self):
        first, state = self.run_stub()
        self.assertEqual(first.returncode, 0)
        secrets = dict(state['secrets'])
        state['calls'] = []
        repeat, state = self.run_stub(state=state)
        self.assertEqual(repeat.returncode, 0, repeat.stderr)
        self.assertTrue(state['secrets'] == secrets)
        self.assertFalse(any('create' in call or call[:3] == ['secrets', 'versions', 'add'] for call in state['calls']))
        self.assertFalse(any('db:seed' in arg for call in state['calls'] for arg in call))

    def test_reused_database_secret_target_is_validated_privately(self):
        first, state = self.run_stub()
        self.assertEqual(first.returncode, 0)
        state['secrets']['borrowbase-database-url'] = state['secrets']['borrowbase-database-url'].replace('/borrowbase?', '/unexpected_database?')
        state['calls'] = []
        repeat, state = self.run_stub(state=state)
        self.assertNotEqual(repeat.returncode, 0)
        self.assertFalse(any(call[:3] == ['run', 'jobs', 'execute'] for call in state['calls']))
        self.assertNotIn('unexpected_database', repeat.stdout + repeat.stderr)

    def test_bootstrap_failure_stops_before_public_service(self):
        result, state = self.run_stub(bootstrap=True, scenario='bootstrap-failure')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(call[:2] == ['run', 'deploy'] for call in state['calls']))

    def test_real_execution_guard_rejects_feature_branch_before_any_cloud_call(self):
        code = '''source "$DEPLOY_SCRIPT"
git() { case "$*" in *rev-parse*) printf '%040d\\n' 1;; *branch*) echo build/l5-06-first-deployment;; esac; }
DRY_RUN=0
validate_release
'''
        result = subprocess.run(['bash', '-c', code], env={**os.environ, 'DEPLOY_SCRIPT': str(SCRIPT)},
                                capture_output=True, text=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('reviewed main branch', result.stderr)


if __name__ == '__main__':
    unittest.main()
