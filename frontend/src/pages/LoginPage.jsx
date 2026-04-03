import { useState } from 'react';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-6 rounded-lg shadow w-full max-w-sm space-y-3">
        <h2 className="text-xl font-bold">Login</h2>
        <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border p-2 rounded" placeholder="Username" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="w-full border p-2 rounded" placeholder="Password" />
        <button className="w-full bg-slate-900 text-white p-2 rounded" onClick={() => onLogin(username, password)}>Sign In</button>
      </div>
    </div>
  );
}
