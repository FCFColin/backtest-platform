/**
 * seed-fama-french.mts — import public/data/fama-french-factors.json into DB
 * Usage: node --import @esbuild-kit/esm-loader scripts/seed-fama-french.mts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const JSON_PATH = join(process.cwd(), 'public/data/fama-french-factors.json');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) throw new Error('DATABASE_URL env required');
if (!readFileSync(JSON_PATH, { encoding: 'utf-8' }))
  throw new Error(`JSON not found: ${JSON_PATH}`);

const data = JSON.parse(readFileSync(JSON_PATH, 'utf-8')) as Array<{
  date: string;
  mktRf: number;
  smb: number;
  hml: number;
  rf: number;
}>;
const client = new Client({ connectionString: DATABASE_URL });
await client.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS fama_french_factors (
    date TEXT PRIMARY KEY,
    mkt_rf DOUBLE PRECISION NOT NULL,
    smb DOUBLE PRECISION NOT NULL,
    hml DOUBLE PRECISION NOT NULL,
    rf DOUBLE PRECISION NOT NULL
  )`);
  for (const row of data) {
    await client.query(
      'INSERT INTO fama_french_factors (date, mkt_rf, smb, hml, rf) VALUES ($1, $2, $3, $4, $5) ' +
        'ON CONFLICT (date) DO UPDATE SET mkt_rf = $2, smb = $3, hml = $4, rf = $5',
      [row.date, row.mktRf, row.smb, row.hml, row.rf],
    );
  }
  const count = await client.query('SELECT COUNT(*) FROM fama_french_factors');
  console.log(`Seeded ${count.rows[0].count} Fama-French factor rows`);
} finally {
  await client.end();
}
