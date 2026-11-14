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
def absent():
 save();print('ERROR: (gcloud.'+'.'.join(a[:3])+') '+s.get('missing_error','NOT_FOUND'),file=sys.stderr);sys.exit(1)
scenario=s['scenario']
if a[:len(s.get('lookup_path',[]))]==s.get('lookup_path') and sum(c[:len(s['lookup_path'])]==s['lookup_path'] for c in s['calls'])>s.get('lookup_skip',0):
 save();print(s['lookup_error'],file=sys.stderr);sys.exit(1)
if a[:3]==['artifacts','repositories','describe']:
 if scenario=='permission':save();print('PERMISSION_DENIED',file=sys.stderr);sys.exit(1)
 if s.get('artifact'):done()
 absent()
if a[:3]==['artifacts','repositories','create']:s['artifact']=True;done()
if a[:3]==['sql','instances','describe']:
 if not s.get('sql'):absent()
 done(json.dumps({'databaseVersion':'POSTGRES_15' if scenario=='wrong-engine' else 'POSTGRES_16','region':'asia-southeast1','settings':{'edition':'ENTERPRISE','tier':'db-custom-4-15360' if scenario=='wrong-tier' else 'db-f1-micro','storageAutoResize':scenario=='auto-increase'}}))
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
if scenario=='build-failure' and a[:2]==['builds','submit']:save();print('private build diagnostics must not escape',file=sys.stderr);sys.exit(1)
if scenario=='service-failure' and a[:2]==['run','deploy']:save();sys.exit(1)
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
verify_service() { [[ \"$TEST_SCENARIO\" != smoke-failure ]] || return 1; printf 'OFFLINE HTTP verification stub\\n'; }
main "$@"
''')
            env = {**os.environ, 'DEPLOY_SCRIPT': str(SCRIPT), 'CLOUD_STUB': str(stub),
                   'STUB_STATE': str(record), 'TEST_SCENARIO': scenario, 'PROJECT_ID': 'cpe334-borrowbase', 'REGION': 'asia-southeast1'}
            result = subprocess.run(['bash', str(wrapper)] + (['--bootstrap-demo'] if bootstrap else []),
                                    env=env, capture_output=True, text=True, timeout=30)
            return result, json.loads(record.read_text())

    def test_dry_run_summary_is_only_simulation_even_with_bootstrap_requested(self):
        # Test summary formatting directly; do not run the Step 5.2 entrypoint.
        code = '''source "$DEPLOY_SCRIPT"
DRY_RUN=1
BOOTSTRAP=true
SERVICE_URL=https://real-resource.example.test
RELEASE_SHA=real-source-sha
APP_DIGEST=real-application-digest
MAINTENANCE_DIGEST=real-maintenance-digest
REVISION=real-revision
print_completion_summary true
'''
        result = subprocess.run(['bash', '-c', code], env={**os.environ, 'DEPLOY_SCRIPT': str(SCRIPT)},
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        output = result.stdout
        self.assertIn('Deployment Completed! (DRY RUN — SIMULATION)', output)
        self.assertIn('No cloud resources were created by the dry-run logic.', output)
        self.assertIn('NOT EXECUTED — simulation only; no accounts bootstrapped', output)
        for value in ['real-resource', 'real-source-sha', 'real-application-digest', 'real-maintenance-digest', 'real-revision']:
            self.assertNotIn(value, output)
        for value in ['<source-sha>', '<application-image@sha256:digest>',
                      '<maintenance-image@sha256:digest>', '<ready-cloud-run-revision>']:
            self.assertIn(value, output)

    def test_real_summary_reports_mocked_results_and_no_sensitive_values(self):
        for bootstrap in [False, True]:
            with self.subTest(bootstrap=bootstrap):
                result, state = self.run_stub(bootstrap=bootstrap)
                self.assertEqual(result.returncode, 0, result.stderr)
                summary = result.stdout.split('Deployment Completed!', 1)[1]
                self.assertNotIn('SIMULATION', summary)
                for label in ['Service URL', 'Health Check URL', 'Readiness Check URL',
                              'Source SHA', 'Application image digest', 'Maintenance image digest',
                              'Ready Cloud Run revision', 'Synthetic-account bootstrap']:
                    self.assertIn(label, summary)
                origin = 'https://borrowbase-example.asia-southeast1.run.app'
                self.assertIn(origin + '/api/health', summary)
                self.assertIn(origin + '/api/ready', summary)
                self.assertIn('1' * 40, summary)
                self.assertIn('borrowbase@sha256:' + 'a' * 64, summary)
                self.assertIn('borrowbase-maintenance@sha256:' + 'b' * 64, summary)
                self.assertIn('borrowbase-00002-test', summary)
                self.assertIn('Completed successfully in this deployment' if bootstrap else
                              'Not executed in this deployment', summary)
                self.assertIn('Check URLs are references, not passing-check results.', summary)
                self.assertIn('Health checks server liveness; readiness checks database connectivity.', summary)
                self.assertNotIn('does not implement /api/health', summary)
                self.assertTrue(all(value not in summary for value in state['secrets'].values()))
                for forbidden in ['postgresql://', 'SEED_BORROWER_PASSWORD', 'SEED_CUSTODIAN_PASSWORD',
                                  'john.smith@example.com', 'ADMIN_PASSWORD', 'SECRET_ADMIN_PASS',
                                  'SEED_DEMO_DATA', 'borrower@example.test', 'custodian@example.test']:
                    self.assertNotIn(forbidden, summary)

    def test_no_completion_summary_after_any_deployment_failure(self):
        for scenario in ['permission', 'build-failure', 'migration-failure', 'bootstrap-failure', 'service-failure', 'smoke-failure']:
            with self.subTest(scenario=scenario):
                result, _ = self.run_stub(bootstrap=scenario == 'bootstrap-failure', scenario=scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('Deployment Completed!', result.stdout + result.stderr)

    def test_exact_interrupted_state_resumes_after_http_404(self):
        state = {'calls': [], 'secrets': {}, 'scenario': 'fresh', 'artifact': True,
                 'sql': True, 'missing_error': 'HTTPError 404: Not Found'}
        result, state = self.run_stub(state=state)
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = state['calls']
        self.assertFalse(any(c[:3] in [['artifacts', 'repositories', 'create'],
                                      ['sql', 'instances', 'create'],
                                      ['sql', 'instances', 'patch']] for c in calls))
        self.assertEqual(sum(c[:3] == ['sql', 'databases', 'create'] for c in calls), 1)
        self.assertEqual(sum(c[:3] == ['iam', 'service-accounts', 'create'] for c in calls), 2)
        self.assertEqual(sum(c[:3] == ['sql', 'users', 'create'] for c in calls), 1)
        self.assertEqual(sum(c[:3] == ['secrets', 'create', 'borrowbase-database-url'] for c in calls), 1)
        self.assertTrue(any(c[:2] == ['builds', 'submit'] for c in calls))
        migration = next(i for i, c in enumerate(calls) if c[:4] == ['run', 'jobs', 'execute', 'borrowbase-migrate'])
        service = next(i for i, c in enumerate(calls) if c[:2] == ['run', 'deploy'])
        self.assertLess(migration, service)
        self.assertFalse(any('db:seed' in arg for c in calls for arg in c))
        self.assertFalse(any('delete' in c or 'set-password' in c for c in calls))
        secrets = dict(state['secrets'])
        state['calls'] = []
        repeat, state = self.run_stub(state=state)
        self.assertEqual(repeat.returncode, 0, repeat.stderr)
        self.assertEqual(state['secrets'], secrets)
        self.assertFalse(any('create' in c or c[:3] == ['secrets', 'versions', 'add'] for c in state['calls']))

    def test_lookup_errors_abort_each_resource_path_without_creating_it(self):
        # Cover every exists() call site, including optional bootstrap and service.
        paths = [(['artifacts', 'repositories', 'describe'], False),
                 (['sql', 'instances', 'describe'], False),
                 (['sql', 'databases', 'describe'], False),
                 (['iam', 'service-accounts', 'describe'], False),
                 (['secrets', 'describe'], False),
                 (['run', 'jobs', 'describe'], True),
                 (['run', 'services', 'describe'], False)]
        errors = ['HTTPError 403: Forbidden', 'PERMISSION_DENIED: denied',
                  'HTTPError 403: Resource does not exist or you do not have permission',
                  'ConnectionError: connection reset', 'HTTPError 500: Internal Server Error',
                  'Unexpected failure containing NOT_FOUND or HTTPError 404: Not Found']
        for path, bootstrap in paths:
            for error in errors:
                with self.subTest(path=path, error=error):
                    state = {'calls': [], 'secrets': {}, 'scenario': 'fresh',
                             'artifact': True, 'sql': True, 'database': True,
                             'lookup_path': path, 'lookup_error': 'ERROR: (gcloud.' + '.'.join(path) + ') ' + error}
                    result, state = self.run_stub(bootstrap=bootstrap, state=state)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(state['calls'][-1][:len(path)], path)
                    self.assertNotIn(error, result.stdout + result.stderr)
                    self.assertNotIn('set-password', str(state['calls']))

    def test_required_cloud_reads_never_treat_errors_as_optional_absence(self):
        # These reads require real data; even 404 must abort, never create/replace.
        paths = [(['sql', 'instances', 'describe'], 1),
                 (['sql', 'users', 'list'], 0),
                 (['secrets', 'versions', 'describe'], 0),
                 (['secrets', 'versions', 'access'], 0),
                 (['artifacts', 'docker', 'images', 'describe'], 0),
                 (['run', 'services', 'describe'], 1),
                 (['run', 'revisions', 'describe'], 0)]
        for path, skip in paths:
            for error in ['HTTPError 404: Not Found', 'HTTPError 403: Forbidden', 'ConnectionError: offline']:
                with self.subTest(path=path, error=error):
                    state = {'calls': [], 'secrets': {}, 'scenario': 'fresh',
                             'artifact': True, 'sql': True, 'database': True,
                             'lookup_path': path, 'lookup_skip': skip, 'lookup_error': error}
                    result, state = self.run_stub(state=state)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(state['calls'][-1][:len(path)], path)
                    self.assertNotIn(error, result.stdout + result.stderr)

    def test_interrupted_state_with_existing_user_without_secret_stops_safely(self):
        state = {'calls': [], 'secrets': {}, 'scenario': 'credential-conflict',
                 'artifact': True, 'sql': True, 'missing_error': 'HTTPError 404: Not Found'}
        result, state = self.run_stub(state=state)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c[:2] == ['sql', 'users'] and c[2] != 'list' for c in state['calls']))
        self.assertFalse(any(c[:2] == ['secrets', 'create'] for c in state['calls']))
        self.assertFalse(any('set-password' in c or 'delete' in c for c in state['calls']))

    def test_lookup_classification_accepts_only_explicit_missing_responses(self):
        responses = [
            ('NOT_FOUND', 1),
            ('ERROR: (gcloud.secrets.describe) NOT_FOUND: Secret missing', 1),
            ('ERROR: (gcloud.sql.databases.describe) HTTPError 404: Not Found', 1),
            ("ERROR: (gcloud.sql.instances.describe) The resource 'projects/test/instances/borrowbase-pg' does not exist.", 1),
            ('ERROR: (gcloud.sql.databases.describe) HTTPError 4040: Not Found', 99),
            ('ERROR: (gcloud.sql.databases.describe) HTTPError 404: Not Found or permission denied', 99),
            ('ERROR: (gcloud.sql.databases.describe) HTTPError 403: NOT_FOUND', 99),
            ('ConnectionError: NOT_FOUND while resolving proxy', 99),
            ('', 99),
        ]
        code = '''source "$DEPLOY_SCRIPT"
gcloud() { printf '%s' "$LOOKUP_ERROR" >&2; return 1; }
fail() { exit 99; }
if exists sql databases describe borrowbase; then exit 0; else exit $?; fi
'''
        for response, status in responses:
            with self.subTest(response=response):
                result = subprocess.run(['bash', '-c', code],
                    env={**os.environ, 'DEPLOY_SCRIPT': str(SCRIPT), 'LOOKUP_ERROR': response},
                    capture_output=True, text=True, timeout=5)
                self.assertEqual(result.returncode, status, result.stderr)

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

    def test_reused_sql_cost_policy_mismatch_stops_before_migration(self):
        for scenario in ['wrong-tier', 'auto-increase']:
            with self.subTest(scenario=scenario):
                result, state = self.run_stub(scenario=scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(c[:3] == ['run', 'jobs', 'execute'] for c in state['calls']))
                self.assertFalse(any(c[:3] == ['sql', 'instances', 'patch'] for c in state['calls']))

    def test_failed_build_and_jobs_have_actionable_sanitized_diagnostics(self):
        for scenario, hint in [('build-failure', 'https://console.cloud.google.com/cloud-build/builds?project=cpe334-borrowbase'),
                               ('migration-failure', 'gcloud run jobs executions list --job=borrowbase-migrate'),
                               ('bootstrap-failure', 'gcloud run jobs executions list --job=borrowbase-bootstrap')]:
            with self.subTest(scenario=scenario):
                result, state = self.run_stub(bootstrap=scenario == 'bootstrap-failure', scenario=scenario)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(hint, result.stderr)
                self.assertNotIn('private build diagnostics', result.stdout + result.stderr)
                self.assertNotIn('raw database error', result.stdout + result.stderr)
                self.assertTrue(all(value not in result.stdout + result.stderr for value in state['secrets'].values()))
                self.assertNotIn('Deployment Completed!', result.stdout)

    def test_preview_command_wrapper_never_executes_its_argument(self):
        # Exercise only the command wrapper, never the deployment/dry-run entrypoint.
        code = '''source "$DEPLOY_SCRIPT"
DRY_RUN=1
forbidden() { printf 'MUTATION_EXECUTED'; return 99; }
run_cmd forbidden --password=test-private-value
'''
        result = subprocess.run(['bash', '-c', code], env={**os.environ, 'DEPLOY_SCRIPT': str(SCRIPT)},
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertNotIn('MUTATION_EXECUTED', result.stdout + result.stderr)
        self.assertNotIn('test-private-value', result.stdout + result.stderr)
        self.assertIn('<REDACTED>', result.stderr)

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
