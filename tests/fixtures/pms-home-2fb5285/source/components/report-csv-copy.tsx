'use client';

import {useState} from 'react';
import {reportCsv, type ReportCell} from '@/lib/report-export';

export function ReportCsvCopy({rows}: {rows: () => ReportCell[][]}) {
  const [csv, setCsv] = useState<string | null>(null);
  const [error, setError] = useState('');
  function show() {
    try { setCsv(reportCsv(rows())); setError(''); }
    catch { setCsv(null); setError('Unable to prepare this report. Refresh it and try again.'); }
  }
  return <section aria-label="Copy report CSV">
    <button type="button" className="secondary" onClick={show}>View CSV for copying</button>
    {error && <p role="alert">{error}</p>}
    {csv !== null && <>
      <p>This contains the complete loaded report, including its property and dates. Select the text and copy it into a UTF-8 .csv file if your browser does not save downloads.</p>
      <label className="field">Complete report CSV<textarea readOnly rows={10} value={csv} onFocus={event => event.currentTarget.select()} spellCheck={false}/></label>
      <button type="button" className="text-button" onClick={() => setCsv(null)}>Hide CSV</button>
    </>}
  </section>;
}
