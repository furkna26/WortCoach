const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const SUITES = [
  'test_upgrade_audit.js',
  'test_all_core_functions.js',
  'verify_everything.js',
  'verify_new_features.js',
  'verify_sharing_and_zero_seed.js',
  'verify_latest_bugfixes.js',
  'verify_new_user_requests.js',
  'verify_social_features.js'
];

const results = [];
let hasFailure = false;

for (const suite of SUITES) {
  console.log(`\n>>> RUNNING ${suite}`);
  const t0 = Date.now();
  const res = spawnSync(process.execPath, [path.join(__dirname, suite)], {
    cwd: ROOT,
    stdio: 'inherit'
  });
  const ms = Date.now() - t0;
  const ok = res.status === 0;
  if (!ok) hasFailure = true;
  results.push({ suite, ok, status: res.status, ms });
}

console.log('\n' + '='.repeat(80));
console.log('WORTCOACH UNIFIED TEST RUNNER SUMMARY');
console.log('='.repeat(80));
for (const r of results) {
  const tag = r.ok ? 'PASS' : `FAIL (exit ${r.status})`;
  console.log(`  [${tag}] ${r.suite} (${r.ms}ms)`);
}
console.log('='.repeat(80));

process.exit(hasFailure ? 1 : 0);
