export default function Layout({ user, onLogout, activeTab, setActiveTab, children, syncToServer }) {
  const tabs = ['dashboard', 'credit', 'customers', 'products', 'backup'];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Udhaar Shop Manager</h1>
          <p className="text-sm text-slate-300">Offline-first credit management</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={syncToServer} className="bg-emerald-500 px-3 py-2 rounded text-sm">Sync to server</button>
          <span className="text-sm">{user.username}</span>
          <button onClick={onLogout} className="bg-red-500 px-3 py-2 rounded text-sm">Logout</button>
        </div>
      </header>
      <nav className="bg-white border-b px-6 py-2 flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`px-3 py-2 rounded capitalize text-sm ${activeTab === tab ? 'bg-slate-900 text-white' : 'bg-slate-200'}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
