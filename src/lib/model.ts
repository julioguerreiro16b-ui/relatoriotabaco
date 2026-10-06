export type Category = 'DRY_SNUFF' | 'MAPACHO';
export type Kind = 'OPENING_STOCK' | 'ENTRY' | 'WHOLESALE_SALE' | 'SITE_SALE' | 'LOSS' | 'MANUAL_ADJUSTMENT';
export type Source = 'history' | 'outgoing' | 'incoming' | 'entry' | 'sacred' | 'haux' | 'natural' | 'loss' | 'products';
export type Status = 'staged' | 'pending' | 'accepted' | 'ignored' | 'duplicate';
export interface Origin { documentId: string; file: string; sheet?: string; row?: number; page?: number; source: Source }
export interface Movement {
  id: string; date: string; invoice: string; order: string; customer: string; recipient: string;
  state: string; address: string; category: Category | ''; kind: Kind; kg: number | null;
  sku: string; product: string; quantity: number | null; unitGrams: number | null;
  site: string; transport: string; cargo: string; country: string; amount: number | null;
  origins: Origin[]; importedAt: string; status: Status; issues: string[];
  duplicateOf?: string; relatedId?: string; historical: boolean; note: string;
  originalLb?: number; distinctFrom?: string[]; shippingCountry?:string;
}
export interface DocumentInfo {
  id: string; name: string; hash: string; size: number; mime: string; source: Source;
  importedAt: string; sheets: { name: string; rows: number; treatment: string }[];
  extraction?: string; batch: string;
  historicalSheets?:{name:string;rows:(string|number|null)[][]}[];
}
export interface Product { id: string; sku: string; name: string; category: Category | 'IGNORE'; unitGrams: number }
export interface Audit { id: string; at: string; action: string; target: string; reason: string; before?: unknown; after?: unknown }
export interface HistoricalReference {
  id:string; documentId:string; sheet:string; row:number; month:string; category:Category|'';
  metric:'opening'|'entries'|'wholesale'|'sites'|'losses'|'closing'|'outgoing'|'balance'|'florida';
  kg:number; originalLb:number|null; ignored?:boolean; reason?:string;
  trusted?:boolean;
}
export interface ValidationFinding {
  check:string; severity:'error'|'warning'; message:string;
  movementIds?:string[]; documentId?:string; referenceId?:string;
}
export interface ValidationRun {
  id:string; at:string; version:number;
  documents:number; movements:number; skipped:number; cleanMovements:number; historicalSkipped?:number;
  checks:{key:string;label:string;checked:number;findings:number}[];
  findings:ValidationFinding[];
}
export interface State {
  version: number; initialized: boolean; documents: DocumentInfo[]; movements: Movement[];
  products: Product[]; audit: Audit[]; unavailable: Partial<Record<Source, boolean>>;
  lossKeywords: string[]; storage?: 'local' | 'postgres';
  references?:HistoricalReference[];
  lastValidation?:ValidationRun;
  importRulesVersion?:number;
}
export const emptyState = (): State => ({ version: 0, initialized: false, documents: [], movements: [], products: [], audit: [], unavailable: {}, lossKeywords: ['Crypto'],references:[] });
export const CATEGORIES: Category[] = ['DRY_SNUFF', 'MAPACHO'];
export const CATEGORY_LABEL: Record<Category, string> = { DRY_SNUFF: 'Dry Snuff', MAPACHO: 'Mapacho Rolls' };
export const KIND_LABEL: Record<Kind, string> = { OPENING_STOCK: 'Estoque inicial', ENTRY: 'Entrada', WHOLESALE_SALE: 'Atacado', SITE_SALE: 'Sites', LOSS: 'Perda', MANUAL_ADJUSTMENT: 'Ajuste manual' };
export const SOURCES: { key: Source; label: string; description: string; required: boolean }[] = [
  { key: 'history', label: 'Planilha histórica', description: 'A base que você já utiliza. XLSX ou CSV.', required: true },
  { key: 'outgoing', label: 'Invoices de saída', description: 'Vendas de atacado e envios aos clientes.', required: true },
  { key: 'incoming', label: 'Invoices de entrada', description: 'Documentos de envio e importação.', required: true },
  { key: 'entry', label: 'Entry Summaries', description: 'Documentos correspondentes às entradas.', required: true },
  { key: 'sacred', label: 'Sacred', description: 'Relatório de pedidos e itens vendidos.', required: true },
  { key: 'haux', label: 'Haux Haux', description: 'Relatório de pedidos e itens vendidos.', required: true },
  { key: 'natural', label: 'Natural Medicine', description: 'Relatório de pedidos e itens vendidos.', required: true },
  { key: 'loss', label: 'Perdas / Crypto', description: 'Invoices de perdas que reduzem o estoque.', required: true },
  { key: 'products', label: 'Cadastro de produtos', description: 'SKU, categoria e peso unitário em gramas.', required: false },
];
export const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
