import React from 'react';

export function ReportNote({ title, value }) {
  return (
    <div className="rounded-md border border-[#d7e0db] bg-[#fbfdfb] p-3">
      <div className="text-xs font-semibold text-[#33545a]">{title}</div>
      <div className="mt-1 text-[11px] leading-5 text-[#66837d]">{value}</div>
    </div>
  );
}

export default ReportNote;
