import React from 'react';

export function ReportSection({ number, title, children }) {
  return (
    <section className="report-section mt-8">
      <div className="report-section-heading">
        <span className="font-mono text-[10px] text-[#2e7568]">{number}.</span>
        <h3>{title}</h3>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default ReportSection;
