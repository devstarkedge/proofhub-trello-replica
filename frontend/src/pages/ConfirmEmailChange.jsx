import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';

export default function ConfirmEmailChange() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function confirm() {
    setBusy(true);
    try {
      const { data } = await api.post('/api/auth/confirm-email-change', { token: params.get('token') });
      setStatus(`Your account email is now ${data.data.email}.`);
    } catch (error) {
      setStatus(error.response?.data?.message || 'Could not confirm the email change. Try again.');
    } finally { setBusy(false); }
  }
  return <main className="max-w-lg mx-auto mt-16 p-6 rounded-xl border" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}>
    <h1 className="text-2xl font-semibold mb-4">Confirm email change</h1>
    <p className="mb-4">Sign in with your current account, then confirm your new email address.</p>
    {status && <p role="status" className="mb-4">{status}</p>}
    <button className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50" disabled={busy || !params.get('token')} onClick={confirm}>{busy ? 'Confirming…' : 'Confirm my email address'}</button>
    <Link className="block mt-4 underline" to="/login">Sign in</Link>
  </main>;
}
