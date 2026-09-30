import React from 'react';

export function ReportGrid({ rows = [] }) {
  return (
    <div className="report-grid">
      {rows.map((row, index) => (
        <div className="contents" key={`${row[0]}-${index}`}>
          <div className="report-label">{row[0]}</div>
          <div className="report-value">{row[1]}</div>
          <div className="report-label">{row[2]}</div>
          <div className="report-value">{row[3]}</div>
        </div>
      ))}
    </div>
  );
}

export default ReportGrid;
