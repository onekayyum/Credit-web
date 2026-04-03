import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const db = new sqlite3.Database('./data/credit.sqlite');

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function cb(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function init() {
  await run('CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY, name TEXT, mobile TEXT, photo TEXT, uniqueId TEXT, indexNumber TEXT, creditLimit REAL, balance REAL, trustLevel TEXT)');
  await run('CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT, barcode TEXT UNIQUE, price REAL)');
  await run('CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY, customerId INTEGER, total REAL, timestamp TEXT, dueDate TEXT, type TEXT)');
  await run('CREATE TABLE IF NOT EXISTS transaction_items (id INTEGER PRIMARY KEY, transactionId INTEGER, productId INTEGER, barcode TEXT, quantity REAL, price REAL)');
  await run('CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY, customerId INTEGER, amount REAL, timestamp TEXT, method TEXT)');
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'credit-backend' }));

app.post('/api/sync', async (req, res) => {
  const data = req.body;
  try {
    await run('BEGIN TRANSACTION');
    for (const table of ['customers', 'products', 'transactions', 'transaction_items', 'payments']) {
      await run(`DELETE FROM ${table}`);
      if (Array.isArray(data[table])) {
        for (const row of data[table]) {
          const keys = Object.keys(row);
          const marks = keys.map(() => '?').join(',');
          await run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${marks})`, keys.map((k) => row[k]));
        }
      }
    }
    await run('COMMIT');
    res.json({ ok: true, syncedAt: new Date().toISOString() });
  } catch (error) {
    await run('ROLLBACK');
    res.status(500).json({ ok: false, error: error.message });
  }
});

const PORT = process.env.PORT || 4000;
init().then(() => {
  app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
});
