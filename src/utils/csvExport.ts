/**
 * @module csvExport
 * @description
 * Exports BPSession data to a CSV file compatible with the import parser.
 * One row per session (session average), same column order as the import template.
 */

import type { BPSession } from '../types';

function formatDate(ts: number): string {
  const d  = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function quoteField(value: string): string {
  if (!value) return '';
  // Wrap in quotes if the value contains commas, quotes, or newlines
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportSessionsCSV(sessions: BPSession[]): void {
  const header = 'Data,Sistolica,Diastolica,Frequenza,Tag,Nota';

  const rows = [...sessions]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((s) => {
      const date = formatDate(s.timestamp);
      const tags = s.tags.join(';');
      const note = quoteField(s.note ?? '');
      return `${date},${s.systolic},${s.diastolic},${s.heartRate},${tags},${note}`;
    });

  const csv  = [header, ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).replace(/\//g, '-');

  a.href     = url;
  a.download = `pressione_export_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
