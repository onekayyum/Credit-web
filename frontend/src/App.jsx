import { useEffect, useMemo, useState } from 'react';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import { db, nowIso, seedDefaults } from './lib/db';
import { debounce, formatCurrency, trustLevelFromBalance, whatsappLink } from './lib/utils';

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [query, setQuery] = useState('');

  const [creditCustomerId, setCreditCustomerId] = useState();
  const [barcode, setBarcode] = useState('');
  const [batch, setBatch] = useState([]);
  const [lastScan, setLastScan] = useState({ code: '', time: 0 });

  useEffect(() => {
    const boot = async () => {
      await seedDefaults();
      const sess = await db.sessions.get('current');
      if (sess) setUser(sess);
      await refreshAll();
    };
    boot();
  }, []);

  async function refreshAll() {
    const [p, c, t, pay] = await Promise.all([
      db.products.toArray(),
      db.customers.toArray(),
      db.transactions.toArray(),
      db.payments.toArray()
    ]);
    setProducts(p);
    setCustomers(c);
    setTransactions(t);
    setPayments(pay);
  }

  async function handleLogin(username, password) {
    const u = await db.users.where({ username, password }).first();
    if (!u) return alert('Invalid credentials');
    const sess = { id: 'current', username, createdAt: nowIso() };
    await db.sessions.put(sess);
    setUser(sess);
  }

  async function logout() {
    await db.sessions.delete('current');
    setUser(null);
  }

  const debouncedSetQuery = useMemo(() => debounce(setQuery, 200), []);

  const filteredCustomers = customers.filter((c) => {
    const t = `${c.name} ${c.mobile} ${c.uniqueId} ${c.indexNumber}`.toLowerCase();
    return t.includes(query.toLowerCase());
  });

  const filteredProducts = products.filter((p) => (`${p.name} ${p.barcode}`).toLowerCase().includes(query.toLowerCase()));

  async function addProduct(payload) {
    const exists = await db.products.where({ barcode: payload.barcode }).first();
    if (exists) return alert('Barcode must be unique');
    await db.products.add(payload);
    await refreshAll();
  }

  async function addCustomer(payload) {
    const exists = await db.customers.where({ uniqueId: payload.uniqueId }).first();
    if (exists) return alert('unique_id already exists');
    const indexNumber = String(customers.length + 1).padStart(4, '0');
    await db.customers.add({ ...payload, indexNumber, balance: 0, trustLevel: 'good' });
    await refreshAll();
  }

  function addItemToBatch(product) {
    setBatch((prev) => {
      const idx = prev.findIndex((i) => i.barcode === product.barcode);
      if (idx >= 0) {
        const cloned = [...prev];
        cloned[idx].quantity += 1;
        cloned[idx].lineTotal = cloned[idx].quantity * cloned[idx].price;
        return cloned;
      }
      return [...prev, { ...product, quantity: 1, lineTotal: Number(product.price) }];
    });
  }

  async function scanBarcode() {
    if (!barcode) return;
    const now = Date.now();
    if (lastScan.code === barcode && now - lastScan.time < 2000) {
      alert('Duplicate scan blocked (2s rule)');
      return;
    }
    setLastScan({ code: barcode, time: now });
    const product = await db.products.where({ barcode }).first();
    if (!product) {
      const name = prompt('Unknown barcode. Enter product name:');
      const price = prompt('Enter price:');
      if (!name || !price) return;
      await addProduct({ name, barcode, price: Number(price) });
      addItemToBatch({ name, barcode, price: Number(price) });
    } else {
      addItemToBatch(product);
    }
    setBarcode('');
  }

  function undoLastScan() {
    setBatch((prev) => {
      if (!prev.length) return prev;
      const cloned = [...prev];
      const last = cloned[cloned.length - 1];
      if (last.quantity > 1) {
        last.quantity -= 1;
        last.lineTotal = last.quantity * last.price;
      } else {
        cloned.pop();
      }
      return [...cloned];
    });
  }

  const liveTotal = batch.reduce((acc, i) => acc + i.lineTotal, 0);

  async function saveTransaction() {
    if (!creditCustomerId || !batch.length) return alert('Select customer and add items');
    const dueDate = prompt('Due date (YYYY-MM-DD) optional') || null;
    const txId = await db.transactions.add({
      customerId: Number(creditCustomerId),
      total: liveTotal,
      timestamp: nowIso(),
      dueDate,
      type: 'credit'
    });

    for (const item of batch) {
      const product = await db.products.where({ barcode: item.barcode }).first();
      await db.transaction_items.add({
        transactionId: txId,
        productId: product?.id || null,
        barcode: item.barcode,
        quantity: item.quantity,
        price: item.price
      });
    }

    const customer = await db.customers.get(Number(creditCustomerId));
    const newBalance = Number(customer.balance || 0) + liveTotal;
    await db.customers.update(customer.id, {
      balance: newBalance,
      trustLevel: trustLevelFromBalance(newBalance, customer.creditLimit)
    });

    const message = `Udhaar Summary:%0A${batch
      .map((b) => `${b.name} x${b.quantity} = ₹${b.lineTotal}`)
      .join('%0A')}%0ATotal: ₹${liveTotal}`;
    window.open(whatsappLink(customer.mobile, message), '_blank');

    setBatch([]);
    await refreshAll();
  }

  async function addPayment(customerId) {
    const amount = Number(prompt('Enter payment amount'));
    if (!amount) return;
    await db.payments.add({ customerId, amount, timestamp: nowIso(), method: 'cash' });
    const customer = await db.customers.get(customerId);
    const newBalance = Math.max(0, Number(customer.balance || 0) - amount);
    await db.customers.update(customerId, {
      balance: newBalance,
      trustLevel: trustLevelFromBalance(newBalance, customer.creditLimit)
    });
    await refreshAll();
  }

  async function exportData() {
    const data = {
      customers: await db.customers.toArray(),
      products: await db.products.toArray(),
      transactions: await db.transactions.toArray(),
      transaction_items: await db.transaction_items.toArray(),
      payments: await db.payments.toArray()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `udhaar-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const data = JSON.parse(await file.text());
    await db.transaction('rw', db.customers, db.products, db.transactions, db.transaction_items, db.payments, async () => {
      for (const table of ['customers', 'products', 'transactions', 'transaction_items', 'payments']) {
        if (Array.isArray(data[table])) await db[table].bulkPut(data[table]);
      }
    });
    await refreshAll();
  }

  async function importProductsCsv(event) {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    const rows = text.split('\n').filter(Boolean).slice(1);
    for (const row of rows) {
      const [name, barcode, price] = row.split(',').map((x) => x.trim());
      if (name && barcode && price) {
        const exists = await db.products.where({ barcode }).first();
        if (!exists) await db.products.add({ name, barcode, price: Number(price) });
      }
    }
    await refreshAll();
  }

  async function syncToServer() {
    const payload = {
      customers: await db.customers.toArray(),
      products: await db.products.toArray(),
      transactions: await db.transactions.toArray(),
      transaction_items: await db.transaction_items.toArray(),
      payments: await db.payments.toArray()
    };
    try {
      const apiBase = window.location.hostname === 'localhost' && window.location.port === '5173' ? 'http://localhost:4000' : ''
      const response = await fetch(`${apiBase}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Sync failed');
      alert('Synced successfully');
    } catch {
      alert('Server unavailable. Data remains safe locally.');
    }
  }

  const dashboard = useMemo(() => {
    const totalCredit = transactions.reduce((a, t) => a + Number(t.total || 0), 0);
    const totalRecovered = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
    const pending = customers.reduce((a, c) => a + Number(c.balance || 0), 0);
    const overdueCustomers = transactions
      .filter((t) => t.dueDate && new Date(t.dueDate) < new Date())
      .map((t) => customers.find((c) => c.id === t.customerId))
      .filter(Boolean);
    const topRisky = [...customers].sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0)).slice(0, 5);

    return { totalCredit, totalRecovered, pending, overdueCustomers, topRisky };
  }, [transactions, payments, customers]);

  if (!user) return <LoginPage onLogin={handleLogin} />;

  return (
    <Layout user={user} onLogout={logout} activeTab={activeTab} setActiveTab={setActiveTab} syncToServer={syncToServer}>
      <div className="mb-3">
        <input
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            debouncedSetQuery(e.target.value);
          }}
          placeholder="Instant search customers/products"
          className="w-full p-3 border rounded text-lg"
        />
      </div>

      {activeTab === 'dashboard' && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card title="Total Credit" value={formatCurrency(dashboard.totalCredit)} />
          <Card title="Total Recovered" value={formatCurrency(dashboard.totalRecovered)} />
          <Card title="Pending Amount" value={formatCurrency(dashboard.pending)} />
          <Card title="Overdue Customers" value={dashboard.overdueCustomers.length} />
          <div className="bg-white rounded p-4 md:col-span-2">
            <h3 className="font-semibold mb-2">Top 5 Risky Customers</h3>
            {dashboard.topRisky.map((c) => <p key={c.id}>{c.name} - {formatCurrency(c.balance)}</p>)}
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="space-y-3">
          <ProductForm onAdd={addProduct} />
          <input type="file" accept=".csv" onChange={importProductsCsv} />
          <div className="bg-white rounded p-3">
            {filteredProducts.map((p) => <div key={p.id} className="border-b py-2">{p.name} | {p.barcode} | {formatCurrency(p.price)}</div>)}
          </div>
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="space-y-3">
          <CustomerForm onAdd={addCustomer} />
          <div className="bg-white rounded p-3">
            {filteredCustomers.map((c) => {
              const paid = payments.filter((p) => p.customerId === c.id).reduce((a, p) => a + p.amount, 0);
              return (
                <div key={c.id} className="border-b py-2 flex justify-between gap-3">
                  <div>
                    <p className="font-semibold">#{c.indexNumber} {c.name}</p>
                    <p>{c.mobile} | UID: {c.uniqueId} | Trust: {c.trustLevel}</p>
                    <p>Total Paid: {formatCurrency(paid)} | Balance: {formatCurrency(c.balance)}</p>
                    <a className="text-green-600 underline" href={whatsappLink(c.mobile, `Your pending amount is ₹${c.balance}, please clear today.`)} target="_blank">Send reminder</a>
                  </div>
                  <button onClick={() => addPayment(c.id)} className="bg-blue-500 text-white px-3 h-fit py-2 rounded">Add Payment</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'credit' && (
        <div className="space-y-3">
          <div className="bg-white rounded p-4 space-y-3">
            <h3 className="font-semibold">Credit Transaction</h3>
            <select className="w-full border p-2 rounded" value={creditCustomerId || ''} onChange={(e) => setCreditCustomerId(e.target.value)}>
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>)}
            </select>
            <div className="flex gap-2">
              <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan/input barcode" className="border p-2 rounded flex-1" />
              <button onClick={scanBarcode} className="bg-slate-900 text-white px-3 rounded">Scan</button>
              <button onClick={undoLastScan} className="bg-orange-500 text-white px-3 rounded">Undo last</button>
            </div>
            <div>
              {batch.map((b) => <p key={b.barcode}>{b.name} x {b.quantity} = {formatCurrency(b.lineTotal)}</p>)}
            </div>
            <p className="font-bold">Live total: {formatCurrency(liveTotal)}</p>
            <button onClick={saveTransaction} className="bg-emerald-600 text-white px-4 py-2 rounded">Save Transaction</button>
          </div>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="bg-white rounded p-4 space-y-2">
          <button onClick={exportData} className="bg-indigo-600 text-white px-4 py-2 rounded">Export JSON Backup</button>
          <input type="file" accept="application/json" onChange={importData} />
        </div>
      )}
    </Layout>
  );
}

function Card({ title, value }) {
  return (
    <div className="bg-white rounded p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function ProductForm({ onAdd }) {
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState('');

  return (
    <div className="bg-white rounded p-3 grid md:grid-cols-4 gap-2">
      <input className="border p-2 rounded" placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="border p-2 rounded" placeholder="Barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
      <input className="border p-2 rounded" placeholder="Price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
      <button
        className="bg-slate-900 text-white rounded"
        onClick={() => {
          onAdd({ name, barcode, price: Number(price) });
          setName(''); setBarcode(''); setPrice('');
        }}
      >
        Add Product
      </button>
    </div>
  );
}

function CustomerForm({ onAdd }) {
  const [form, setForm] = useState({ name: '', mobile: '', photo: '', uniqueId: '', creditLimit: 1000 });

  return (
    <div className="bg-white rounded p-3 grid md:grid-cols-6 gap-2">
      <input className="border p-2 rounded" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input className="border p-2 rounded" placeholder="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
      <input className="border p-2 rounded" placeholder="Photo URL" value={form.photo} onChange={(e) => setForm({ ...form, photo: e.target.value })} />
      <input className="border p-2 rounded" placeholder="10-digit unique id" value={form.uniqueId} onChange={(e) => setForm({ ...form, uniqueId: e.target.value })} />
      <input className="border p-2 rounded" type="number" placeholder="Credit limit" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })} />
      <button
        className="bg-slate-900 text-white rounded"
        onClick={() => {
          if (form.uniqueId.length !== 10) return alert('Unique ID must be 10 digits');
          onAdd(form);
          setForm({ name: '', mobile: '', photo: '', uniqueId: '', creditLimit: 1000 });
        }}
      >
        Add Customer
      </button>
    </div>
  );
}

export default App;
