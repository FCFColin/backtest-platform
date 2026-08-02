const base = 'http://127.0.0.1:15001';

async function main() {
  const uname = `probe${Date.now() % 1000000}`;
  const register = await fetch(`${base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: uname, password: 'Passw0rd!123', email: `${uname}@t.co` }),
  });
  console.log('register', register.status);
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: uname, password: 'Passw0rd!123' }),
  });
  const loginText = await login.text();
  let auth: { data?: { accessToken?: string } } = {};
  try {
    auth = JSON.parse(loginText);
  } catch {
    console.log('login failed', login.status, loginText);
    return;
  }
  const token = auth.data?.accessToken;
  if (!token) {
    console.log('no token', login.status, loginText.slice(0, 200));
    return;
  }
  const payload = { tickers: ['SPY', 'TLT', 'GLD', 'QQQ'], startDate: '2014-01-01', endDate: '2022-12-31' };
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const res = await fetch(`${base}/api/v1/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { success?: boolean; error?: { code?: string; detail?: string } };
    console.log(`run ${i}: ${res.status} ${Date.now() - t0}ms ${JSON.stringify(body).slice(0, 200)}`);
  }
}

main().catch((e) => console.error(e));
