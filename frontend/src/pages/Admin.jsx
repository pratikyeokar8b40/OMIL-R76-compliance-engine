import React, { useEffect, useState } from 'react';
import SectionHeader from '@/components/SectionHeader';
import { api } from '@/api/client';
import { ShieldCheck, ShieldAlert, RefreshCw, KeyRound, Server } from 'lucide-react';
import Button from '@/components/Button';

export function Admin() {
  const [rows, setRows] = useState([]);
  const [chain, setChain] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAuditData = async () => {
    setLoading(true);
    setError('');
    try {
      const [auditRows, chainRes] = await Promise.all([
        api.audit(100),
        api.auditVerify().catch(() => null),
      ]);
      setRows(Array.isArray(auditRows) ? auditRows : []);
      setChain(chainRes);
    } catch (err) {
      setError(err.message || 'Unable to load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditData();
  }, []);

  return (
    <div>
      <SectionHeader
        title="Audit log."
        detail="Recorded audit events and integrity status."
        action={
          <Button variant="quiet" size="sm" onClick={loadAuditData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="panel mb-6 border-[#e7b5ae] bg-[#fff5f3] p-4 text-xs text-[#a6423b]">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-semibold text-[#33545a]">Hash-Chain Integrity</div>
            {chain?.valid ? (
              <ShieldCheck size={18} className="text-[#2e7568]" />
            ) : (
              <ShieldAlert size={18} className="text-[#b24b43]" />
            )}
          </div>
          <div className="mt-2 text-xl font-semibold text-[#17333c]">
            {chain?.valid ? 'Chain verified' : 'Verification Unavailable'}
          </div>
          <p className="mt-1 text-xs text-[#58746f]">
            {chain?.valid
              ? `${chain.count || rows.length} transitions verified without tampering.`
              : 'Hash chain verification status could not be confirmed.'}
          </p>
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-semibold text-[#33545a]">Audit Events</div>
            <Server size={18} className="text-[#66837d]" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-[#17333c]">
            {rows.length}
          </div>
          <p className="mt-1 text-xs text-[#58746f]">
            Recorded actions across sessions, observations, and reports.
          </p>
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="mobile-scroll">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#d7e0db] bg-[#fbfdfb] text-[10px] uppercase tracking-[.12em] text-[#7b9690]">
                <th className="px-5 py-4 font-medium">Timestamp</th>
                <th className="px-5 py-4 font-medium">Actor</th>
                <th className="px-5 py-4 font-medium">Action</th>
                <th className="px-5 py-4 font-medium">Detail</th>
                <th className="px-5 py-4 font-medium">Target Object</th>
                <th className="px-5 py-4 font-medium">Source IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-xs text-[#7b9690]">
                    {loading ? 'Loading audit records…' : 'No audit entries recorded.'}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="table-row border-b border-[#e5ece8] last:border-0">
                    <td className="px-5 py-4 font-mono text-[11px] text-[#66837d]">
                      {r.at ? new Date(r.at).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-4 font-medium text-[#33545a]">
                      {r.actor_email || 'System'}
                    </td>
                    <td className="px-5 py-4 font-semibold text-[#17333c]">
                      <span className="rounded bg-[#edf4ef] px-2 py-0.5 text-[10px] font-mono text-[#2e7568]">
                        {r.action || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#66837d]">
                      {r.action_detail || '—'}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-[#58746f]">
                      {r.object_ref || '—'}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-[#9ab0a9]">
                      {r.source_ip || '127.0.0.1'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Admin;
