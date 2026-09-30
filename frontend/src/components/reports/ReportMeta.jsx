import React from 'react';

export function ReportMeta({ label, value }) {
  return (
    <div className="border border-[#c9d9d1] bg-[#fbfdfb] p-2">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 font-mono text-[10px] text-[#33545a]">{value}</div>
    </div>
  );
}

export default ReportMeta;
