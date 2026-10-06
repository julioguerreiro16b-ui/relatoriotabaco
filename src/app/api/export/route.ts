import ExcelJS from 'exceljs';
import { guard, failure } from '@/server/auth';
import { readState } from '@/server/store';
import { buildReports, defaultFilters, type Filters } from '@/lib/reports';
export async function GET(request:Request){try{
  await guard(request);const state=await readState();if(!state.initialized)throw new Error('Confirme a análise dos arquivos antes de gerar relatórios.');
  const url=new URL(request.url),f={...defaultFilters,...Object.fromEntries(url.searchParams),year:Number(url.searchParams.get('year')||2026)} as Filters;
  const reports=buildReports(state,f), selected=url.searchParams.get('report')||'all',format=url.searchParams.get('format')||'xlsx';
  if(selected!=='all'&&!reports[selected])throw new Error('Relatório inválido');
  const chosen=selected==='all'?Object.values(reports):[reports[selected]];
  const safe=(v:unknown)=>typeof v==='string'&&/^[=+\-@\t\r]/.test(v)?"'"+v:v;
  if(format==='csv') {
    const report=chosen[0];const lines=[...reports.cover.rows,[''],report.columns,...report.rows];
    const csv='\uFEFF'+lines.map(row=>row.map(v=>'"'+String(safe(v)??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
    return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="hf-${selected}-${f.year}.csv"`,'Cache-Control':'no-store'}});
  }
  const workbook=new ExcelJS.Workbook();workbook.creator='H&F • Controle de estoque';
  for(const report of selected==='all'?chosen:[reports.cover,...chosen]) {
    const sheet=workbook.addWorksheet(report.title.slice(0,31));sheet.addRow(report.columns);sheet.addRows(report.rows.map(row=>row.map(safe)));
    sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:'A1',to:{row:1,column:report.columns.length}};
    sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF123B35'}};
    sheet.columns.forEach((col,i)=>{col.width=Math.min(42,Math.max(17,report.columns[i].length+3));if(/KG|LB/.test(report.columns[i]))col.numFmt='0.000';});
  }
  if(selected==='all'||selected==='florida'||selected==='history')for(const doc of state.documents.filter(d=>d.source==='history'))for(const original of doc.historicalSheets||[]){const name=('Original '+original.name).slice(0,27);let unique=name,index=1;while(workbook.getWorksheet(unique))unique=name+' '+index++;const sheet=workbook.addWorksheet(unique);sheet.addRows(original.rows);sheet.columns.forEach(c=>c.width=22);}
  return new Response(new Uint8Array(await workbook.xlsx.writeBuffer()),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="hf-${selected}-${f.year}.xlsx"`,'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
