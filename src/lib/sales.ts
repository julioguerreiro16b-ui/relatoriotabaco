import type { Category, Movement, WooSource } from './model';
import { norm } from './domain';
import { normalizeState, US_STATES } from './shipping';

export const WOO_STORES: { source: WooSource; label: string; env: string }[] = [
  { source: 'sacred', label: 'Sacred', env: 'WC_SACRED' },
  { source: 'haux', label: 'Haux Haux', env: 'WC_HAUX' },
  { source: 'natural', label: 'Natural Medicine', env: 'WC_NATURAL' },
];
export function excludedNational(text: string) {
  return /\bawiry\b|\btobacco[\s_-]*free\b|\bsem[\s_-]*tabaco\b/.test(norm(text));
}
export function salesCategory(text: string): Category | '' {
  const value = norm(text);
  if (/\bmapachos?\b/.test(value)) return 'MAPACHO';
  if (/\brapes?\b|\bhapes?\b|\brapeh\b|\bdry[\s_-]*snuff\b|\bawiry\b/.test(value)) return 'DRY_SNUFF';
  return '';
}
export type SalesScope = 'florida' | 'usa';
export interface SizeRow { category: Category; grams: number; units: number; kg: number; records: Movement[] }
export function salesBySize(movements: Movement[], scope: SalesScope) {
  const grouped = new Map<string, SizeRow>();
  let pending = 0, excluded = 0, unknownDestination = 0;
  for (const m of movements) {
    if (m.historical || !['SITE_SALE', 'WHOLESALE_SALE'].includes(m.kind) || ['ignored', 'duplicate'].includes(m.status)) continue;
    const region = normalizeState(m.state, m.shippingCountry);
    const domestic = /^(us|usa|united states|united states of america|estados unidos)$/i.test(m.shippingCountry || '') || !!US_STATES[region];
    if (!domestic) { if (region !== 'Exterior') unknownDestination++; continue; }
    if (scope === 'florida' && region !== 'FL') { if (!US_STATES[region]) unknownDestination++; continue; }
    if (scope === 'usa' && (m.woo?.nationalExcluded || excludedNational(m.product + ' ' + m.sku))) { excluded++; continue; }
    if (m.status !== 'accepted' || !m.category || m.quantity === null || !Number.isFinite(m.quantity) || m.quantity <= 0 || m.unitGrams === null || !Number.isFinite(m.unitGrams) || m.unitGrams <= 0) { pending++; continue; }
    const key = m.category + ':' + m.unitGrams;
    const row = grouped.get(key) || { category: m.category, grams: m.unitGrams, units: 0, kg: 0, records: [] };
    row.units += m.quantity; row.kg += m.quantity * m.unitGrams / 1000; row.records.push(m); grouped.set(key, row);
  }
  return { rows: [...grouped.values()].sort((a,b) => a.category.localeCompare(b.category) || a.grams-b.grams), pending, excluded, unknownDestination };
}
