import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Download, ShieldCheck, FileText, Loader2 } from 'lucide-react';
import Button from '@/components/Button';
import SectionHeader from '@/components/SectionHeader';
import { api, downloadFile } from '@/api/client';
import { labelForTestType } from '@/lib/requirements';

export default function ReportView({ id }) {
  const [, setLocation] = useLocation();
  const [report, setReport] = useState(null);
  const [session, setSession] = useState(null);
  const [instrument, setInstrument] = useState(null);
  const [observations, setObservations] = useState([]);
  const [checklist, setChecklist] = useState({ items: [], progress: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ruleset, setRuleset] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.report(id);
        const rs = await api.ruleset().catch(() => null);
        if (!cancelled) setRuleset(rs);
        if (cancelled) return;
        setReport(r);
        if (r?.session_id) {
          const s = await api.session(r.session_id);
          if (cancelled) return;
          setSession(s);
          if (s?.instrument_id) setInstrument(await api.instrument(s.instrument_id));
          setObservations(await api.observations(r.session_id));
          setChecklist((await api.checklist(r.session_id)) || { items: [], progress: {} });
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Unable to load report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const result = report?.overall_result || 'INCOMPLETE';

  if (loading) return <div className="panel p-10 text-center"><Loader2 className="mx-auto animate-spin" /> Loading report…</div>;
  if (error) return <div className="panel p-8"><div className="text-sm text-[#b24b43]">{error}</div></div>;
  if (!report) return <div className="panel p-8">Report not found.</div>;

  return (
    <div className="space-y-7">
      <SectionHeader
        eyebrow="Evaluation report"
        title="Evaluation report"
        detail="Completed evaluation report and verification details."
        action={<Link href="/reports" className="button-quiet inline-flex items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold"><ArrowLeft size={15} /> Reports</Link>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="panel p-6 md:p-8 space-y-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <Info label="Manufacturer" value={instrument?.manufacturer} />
            <Info label="Model" value={instrument?.model} />
            <Info label="Serial number" value={instrument?.serial_number} mono />
            <Info label="Evaluation mode" value={session?.evaluation_mode === 'in_service' ? 'In-Service Verification' : 'Initial Verification'} />
            <Info label="Report created" value={report.created_at ? new Date(report.created_at).toLocaleString() : '—'} />
            <Info label="Template version" value={report.template_version} mono />
            <Info label="Ruleset" value={ruleset ? `${ruleset.id} · ${ruleset.version}` : '—'} mono />
          </div>

          <div>
            <div className="eyebrow mb-3">Observation summary</div>
            <div className="rounded-lg border border-[#d7e0db] overflow-hidden bg-white">
              {observations.length === 0 ? <div className="p-5 text-sm text-[#66837d]">No observations returned.</div> : observations.map((o, i) => (
                <div key={o.id || `${o.test_type}-${o.sequence_no}-${i}`} className="flex items-center justify-between gap-4 border-b last:border-b-0 border-[#e5ece8] p-4 text-xs">
                  <div><div className="font-semibold text-[#17333c]">{labelForTestType(o.test_type)}</div><div className="mt-1 text-[#66837d]">Position {o.position || '—'} · Load {o.applied_load ?? '—'} · Indication {o.indication ?? '—'} · Error {o.corrected_error ?? '—'} · MPE ±{o.mpe_limit ?? '—'}</div><div className="mt-1 font-mono text-[10px] text-[#9ab0a9]">Seq #{o.sequence_no ?? i} · {o.source || 'manual'} · {o.entered_at ? new Date(o.entered_at).toLocaleString() : '—'}</div></div>
                  <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${o.verdict === 'PASS' ? 'bg-[#dceee8] text-[#2e7568]' : o.verdict === 'FAIL' ? 'bg-[#fdeceb] text-[#b24b43]' : 'bg-[#f4f7f3] text-[#66837d]'}`}>{o.verdict || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Officer approval" value={report.signed_by_name || 'Not signed'} />
            <Info label="Signed at" value={report.signed_at ? new Date(report.signed_at).toLocaleString() : 'Not signed'} />
            <Info label="SHA-256" value={report.sha256} mono />
            <Info label="Report ID" value={report.id} mono />
          </div>
        </section>

        <aside className="space-y-4">
          <div className="panel p-6 text-center">
            <div className="eyebrow">Evaluation state</div>
            <div className={`mt-3 text-3xl font-bold font-mono ${result === 'PASS' ? 'text-[#2e7568]' : result === 'FAIL' ? 'text-[#b24b43]' : 'text-[#66837d]'}`}>{result}</div>
            <p className="mt-3 text-xs leading-5 text-[#66837d]">Result calculated from the recorded evaluation.</p>
          </div>
          <div className="panel p-5 space-y-3">
            <Button className="w-full" onClick={() => downloadFile(report.id, 'pdf')}><Download size={15} /> Download PDF</Button>
            <Button variant="quiet" className="w-full" onClick={() => downloadFile(report.id, 'docx')}><FileText size={15} /> Download DOCX</Button>
            <Button variant="quiet" className="w-full" onClick={() => setLocation(`/verify/${report.id}`)}><ShieldCheck size={15} /> Verify integrity</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value, mono = false }) {
  return <div><div className="eyebrow">{label}</div><div className={`mt-1 text-sm font-semibold text-[#17333c] ${mono ? 'font-mono break-all' : ''}`}>{value || '—'}</div></div>;
}
