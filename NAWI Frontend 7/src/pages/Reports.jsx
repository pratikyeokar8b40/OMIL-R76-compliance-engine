import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  Archive,
  ArrowRight,
  Download,
  FileText,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  UploadCloud,
  CheckCircle2,
} from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';
import Button from '@/components/Button';
import { api, downloadFile } from '@/api/client';

export function Reports() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');

  const [reports, setReports] = useState([]);
  const [sessionsMap, setSessionsMap] = useState(new Map());
  const [instrumentsMap, setInstrumentsMap] = useState(new Map());
  const [lastSync, setLastSync] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  const download = async (reportId, kind) => {
    setDownloadError('');
    setDownloadingId(`${reportId}-${kind}`);
    try {
      await downloadFile(reportId, kind);
    } catch (err) {
      setDownloadError(err.message || `Could not download the ${kind.toUpperCase()} file.`);
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [repList, sessRes, instRes] = await Promise.all([
          api.reports(),
          // API page size is capped at 100; instruments() takes (query, skip, limit).
          api.sessions(0, 100).catch(() => ({ items: [] })),
          api.instruments('', 0, 100).catch(() => ({ items: [] })),
        ]);

        const sMap = new Map((sessRes?.items || []).map((s) => [s.id, s]));
        const iMap = new Map((instRes?.items || []).map((i) => [i.id, i]));

        setReports(Array.isArray(repList) ? repList : []);
        setSessionsMap(sMap);
        setInstrumentsMap(iMap);
        setLastSync(new Date());
      } catch {
        setLoadError(true);
      }
    }
    loadData();
  }, []);

  const enrichedReports = reports.map((report) => {
    const session = sessionsMap.get(report.session_id);
    const instrument = session?.instrument_id ? instrumentsMap.get(session.instrument_id) : null;
    return {
      ...report,
      session,
      instrument,
      displayId: report.id ? String(report.id).slice(0, 8) : '—',
      model: report.instrument_model || instrument?.model || session?.model || 'NAWI Instrument',
      manufacturer: report.instrument_manufacturer || instrument?.manufacturer || '—',
      serial: report.instrument_serial || instrument?.serial_number || session?.serial || '—',
      mode: (report.evaluation_mode || session?.evaluation_mode) === 'in_service' ? 'In-Service' : 'Initial',
      status: report.session_status || session?.status || (report.signed_by ? 'approved' : 'completed'),
    };
  });

  const filtered = enrichedReports.filter((r) =>
    `${r.id} ${r.model} ${r.manufacturer} ${r.serial} ${r.session_id} ${r.signed_by || ''}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  return (
    <div>
      <SectionHeader
        eyebrow="Records / Archive"
        title="Report archive."
        detail="Completed evaluation reports."
        action={
          <Button onClick={() => setLocation('/evaluations/new')} data-testid="button-new-from-reports">
            <Plus size={16} />
            New evaluation
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-3 text-[#7b9690]" size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports by ID, model, serial…"
            className="w-full rounded-md border border-[#c9d9d1] bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-[#c69852]"
            data-testid="input-search-reports"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-[#66837d]">
          <Archive size={14} /> {filtered.length} reports in archive
        </div>
      </div>

      {downloadError && (
        <div className="mb-4 rounded-md border border-[#e7b5ae] bg-[#fff5f3] px-4 py-3 text-xs text-[#a6423b]">
          {downloadError}
        </div>
      )}

      <section className="panel overflow-hidden">
        <div className="mobile-scroll">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-[#d7e0db] bg-[#fbfdfb] text-[10px] uppercase tracking-[.12em] text-[#7b9690]">
                <th className="px-5 py-4 font-medium">Report / Session</th>
                <th className="px-5 py-4 font-medium">Instrument</th>
                <th className="px-5 py-4 font-medium">Evaluation Date</th>
                <th className="px-5 py-4 font-medium">Result</th>
                <th className="px-5 py-4 font-medium">Signatory / Approval</th>
                <th className="px-5 py-4 font-medium">Integrity SHA-256</th>
                <th className="px-5 py-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((report) => (
                <tr key={report.id} className="table-row border-b border-[#e5ece8] last:border-0">
                  <td className="px-5 py-5">
                    <div className="font-mono font-bold text-[#33545a]">
                      {report.id ? String(report.id).slice(0, 13) : '—'}…
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#9ab0a9]">
                      Session: {report.session_id ? String(report.session_id).slice(0, 8) : '—'}
                    </div>
                  </td>
                  <td className="px-5 py-5">
                    <div className="font-semibold text-[#33545a]">{report.model}</div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-[#7b9690]">
                      <span>SN {report.serial}</span>
                      <span className="rounded bg-[#edf4ef] px-1.5 py-0.5 text-[9px] font-semibold text-[#2e7568]">
                        {report.mode}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-5 text-[#66837d]">
                    {report.created_at ? new Date(report.created_at).toLocaleDateString() : '—'}
                    <div className="text-[10px] text-[#9ab0a9]">
                      {report.created_at ? new Date(report.created_at).toLocaleTimeString() : ''}
                    </div>
                  </td>
                  <td className="px-5 py-5">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${report.overall_result === 'PASS' ? 'bg-[#dceee8] text-[#2e7568]' : report.overall_result === 'FAIL' ? 'bg-[#fdeceb] text-[#b24b43]' : 'bg-[#f4f7f3] text-[#66837d]'}`}>
                      {report.overall_result || 'INCOMPLETE'}
                    </span>
                  </td>
                  <td className="px-5 py-5">
                    {report.signed_by ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dceee8] px-2.5 py-1 text-[10px] font-semibold text-[#2e7568]">
                        <CheckCircle2 size={12} />
                        {report.signed_by_name || 'Approved'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf4ef] px-2.5 py-1 text-[10px] font-medium text-[#66837d]">
                        Sealed (Awaiting Officer)
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-5 font-mono text-[11px] text-[#66837d]">
                    {report.sha256 ? `${report.sha256.slice(0, 10)}…` : '—'}
                  </td>
                  <td className="px-5 py-5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => download(report.id, 'pdf')}
                        disabled={downloadingId === `${report.id}-pdf`}
                        title="Download PDF"
                        className="button-quiet flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-[#17333c]"
                        data-testid={`button-download-pdf-${report.id}`}
                      >
                        <Download size={13} /> PDF
                      </button>
                      <button
                        onClick={() => download(report.id, 'docx')}
                        disabled={downloadingId === `${report.id}-docx`}
                        title="Download DOCX"
                        className="button-quiet flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-[#17333c]"
                        data-testid={`button-download-docx-${report.id}`}
                      >
                        <FileText size={13} /> DOCX
                      </button>
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => setLocation(`/reports/${report.id}`)}
                        data-testid={`button-open-report-${report.id}`}
                      >
                        Open report <ArrowRight size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-[#66837d]">
            {loadError ? 'Could not connect to report archive.' : `No reports match “${query}”.`}
          </div>
        )}
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-4 text-[10px] text-[#7b9690]">
        <span className="flex items-center gap-2">
          <UploadCloud size={13} />
          {loadError
            ? 'Could not reach the report archive'
            : lastSync
            ? `Last synced: ${lastSync.toLocaleTimeString()}`
            : 'Syncing…'}
        </span>
        <span className="flex items-center gap-2">
          <LockKeyhole size={13} />
          Cryptographic seal verification enabled
        </span>
      </div>
    </div>
  );
}

export default Reports;
