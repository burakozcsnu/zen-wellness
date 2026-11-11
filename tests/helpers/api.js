// Direct calls to the TEST project's API, used by end-to-end tests to check what the UI really saved.
const { loadTestEnv } = require('./test-env');

const env = loadTestEnv();

async function signIn(email, password) {
  const response = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  const body = await response.json();
  if (!body.access_token) throw new Error(`login failed (HTTP ${response.status})`);
  return body.access_token;
}

const headers = token => ({ apikey: env.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' });

// Returns the parsed rows; throws on HTTP errors so a failed check is never mistaken for "no rows".
async function rest(token, method, pathAndQuery, body) {
  const response = await fetch(`${env.url}/rest/v1/${pathAndQuery}`, { method, headers: headers(token), body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(`${method} ${pathAndQuery.split('?')[0]} failed: HTTP ${response.status}`);
  return response.json();
}

// True when the stored file exists (the caller's token must be allowed to read it).
async function fileExists(token, bucket, filePath) {
  const response = await fetch(`${env.url}/storage/v1/object/info/${bucket}/${filePath}`, { headers: headers(token) });
  return response.ok;
}

module.exports = { env, signIn, rest, fileExists };
