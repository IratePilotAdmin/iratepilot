export type ReportDecimal = {kind:'decimal';value:string};
export type ReportCell = string | number | boolean | null | undefined | ReportDecimal;

// Only calculated report amounts opt into numeric CSV fields. Guest text and
// references keep the existing formula guard, even when they resemble numbers.
export function reportDecimal(value:string):ReportDecimal {
  if(typeof value!=='string'||! /^-?(0|[1-9][0-9]{0,40})(\.[0-9]{1,2})?$/.test(value))throw new Error('Invalid exact report decimal.');
  return {kind:'decimal',value};
}

// Quote every field and neutralize formula prefixes even after whitespace/control
// characters. Reports may contain guest-supplied names and external references.
export function csvCell(value: ReportCell): string {
  if(value!==null&&typeof value==='object'){
    if(value.kind!=='decimal')throw new Error('Invalid report cell.');
    const exact=reportDecimal(value.value).value;
    const significant=exact.replace(/[-.]/g,'').replace(/^0+/,'');
    // Excel preserves at most 15 significant digits. Keep larger values as text
    // instead of routing exact decimal strings through JavaScript floating point.
    return '"'+(significant.length>15?"'":'')+exact+'"';
  }
  let text = value == null ? '' : String(value);
  // oxlint-disable-next-line no-control-regex -- Control prefixes are an intentional spreadsheet-injection boundary.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function reportCsv(rows: ReportCell[][]): string {
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadReport(name: string, rows: ReportCell[][]): void {
  const url = URL.createObjectURL(new Blob([reportCsv(rows)], {type: 'text/csv;charset=utf-8'}));
  let link: HTMLAnchorElement | undefined;
  let started = false;
  try {
    link = document.createElement('a');
    link.href = url;
    link.download = name.replace(/[^a-z0-9._-]/gi, '-').slice(0, 160) + '.csv';
    document.body.appendChild(link);
    link.click();
    started = true;
  } finally {
    link?.remove();
    if (started) setTimeout(() => URL.revokeObjectURL(url), 1000);
    else URL.revokeObjectURL(url);
  }
}

// Values are already integer minor units from the service, never parsed from
// formatted display strings or re-rounded from browser floating-point totals.
export function reportMoney(minor: number | null | undefined): string {
  if (minor == null) return '';
  if (!Number.isSafeInteger(minor)) throw new Error('This amount exceeds the supported report precision. Narrow the date range.');
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  return sign + Math.floor(absolute / 100) + '.' + String(absolute % 100).padStart(2, '0');
}

// Format grouped USD from the exact integer digits used by report exports.
// Missing display amounts are unavailable, never silently formatted as zero.
export function reportUsd(minor: number): string {
  const exact = reportMoney(minor);
  if (!exact) throw new Error('This report amount is unavailable.');
  const negative = exact.startsWith('-');
  const [whole, fraction] = exact.replace(/^-/, '').split('.');
  return (negative ? '-' : '') + '$' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction;
}
