const base = 'http://127.0.0.1:15001';

async function main() {
  const uname = `probe${Date.now() % 1000000}`;
  const reg = await fetch(`${base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: uname, password: 'Passw0rd!123', email: `${uname}@t.co`, orgName: 'Probe Org' }),
  });
  const regText = await reg.text();
  console.log('register', reg.status, regText.slice(0, 80));
  const loginRes = await fetch(`${base}/api/v1/auth/login/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: uname, password: 'Passw0rd!123' }),
  });
  const loginText = await loginRes.text();
  let token = '';
  try {
    token = (JSON.parse(loginText).data ?? {}).accessToken ?? '';
  } catch {
    console.log('login failed', loginRes.status, loginText.slice(0, 200));
    return;
  }
  if (!token) {
    console.log('no token', loginRes.status, loginText.slice(0, 200));
    return;
  }
  console.log('login ok');
  const payload = {
    indicator: 'sma',
    param1: { min: 10, max: 10, step: 1 },
    param2: { min: 3, max: 3, step: 1 },
    tickers: ['TLT'],
    startDate: '2018-01-01',
    endDate: '2020-12-31',
    startingValue: 10000,
    rebalanceFrequency: 'daily',
    objective: 'maxSharpe',
    topN: 10,
  };
  const t0 = Date.now();
  const res = await fetch(`${base}/api/v1/tactical-grid/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  console.log(`search: ${res.status} ${Date.now() - t0}ms ${body.slice(0, 300)}`);
  if (res.status === 202) {
    const json = JSON.parse(body) as { jobId?: string; statusUrl?: string };
    if (json.statusUrl) {
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const poll = await fetch(`${base}${json.statusUrl}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const pollBody = await poll.text();
        console.log(`poll ${i}: ${poll.status} ${pollBody.slice(0, 200)}`);
        if (pollBody.includes('completed')) break;
      }
    }
  }
}

main().catch((e) => console.error(e));
