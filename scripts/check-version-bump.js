// Fails when a shell file (cached by the service worker) changed without a version bump, or the versions disagree.
// Usage: node scripts/check-version-bump.js <base-ref>
const { execFileSync } = require('child_process');

const SHELL = [/^index\.html$/, /^script\.js$/, /^data-service\.js$/, /^exercise-domain\.js$/, /^style\.css$/, /^manifest\.webmanifest$/,
  /^favicon\.svg$/, /^sw\.js$/, /^fonts\//, /^vendor\//, /^icons\//, /^zen-wellness-(logo|icon)\.png$/];
const VERSIONED = /(script|style|data-service|exercise-domain|vendor\/[\w.-]+)\.(js|css)\?v=([^"']+)/g;

const appVersion = js => /const APP_VERSION = '([^']+)'/.exec(js || '')?.[1] || null;
const shellVersion = js => /const SHELL_VERSION = '([^']+)'/.exec(js || '')?.[1] || null;

// Pure comparison: returns a list of plain-English problems (empty = fine).
function checkVersions({ changed, baseScript, script, sw, indexHtml }) {
  if (!changed.some(file => SHELL.some(re => re.test(file)))) return [];
  const problems = [];
  const next = appVersion(script);
  if (!next) return ['APP_VERSION was not found in script.js.'];
  if (next === appVersion(baseScript)) problems.push(`A shell file changed but APP_VERSION is still ${next}. Bump it.`);
  const sv = shellVersion(sw);
  if (sw && sv && sv !== next) problems.push(`SHELL_VERSION in sw.js is ${sv} but APP_VERSION is ${next}.`);
  if (sw && !sv && /SHELL_VERSION/.test(sw)) problems.push('SHELL_VERSION in sw.js is not a plain string.');
  for (const [, name, ext, version] of (indexHtml || '').matchAll(VERSIONED)) {
    if (version !== next) problems.push(`index.html loads ${name}.${ext}?v=${version} but APP_VERSION is ${next}.`);
  }
  return problems;
}

function main(base) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const show = (ref, file) => { try { return git('show', `${ref}:${file}`); } catch { return null; } };
  const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
  const fs = require('fs');
  const problems = checkVersions({
    changed, baseScript: show(base, 'script.js'), script: fs.readFileSync('script.js', 'utf8'),
    sw: fs.existsSync('sw.js') ? fs.readFileSync('sw.js', 'utf8') : null, indexHtml: fs.readFileSync('index.html', 'utf8')
  });
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log('Version check passed.');
}

if (require.main === module) {
  if (!process.argv[2]) { console.error('Usage: node scripts/check-version-bump.js <base-ref>'); process.exit(2); }
  main(process.argv[2]);
}
module.exports = { checkVersions };
