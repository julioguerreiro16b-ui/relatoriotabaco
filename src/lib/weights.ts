export const weightNumber=(v:string)=>{const n=Number(v.replace(',','.'));return Number.isFinite(n)?n:null;};
export function gramsInProduct(text:string):number|null{
  const sizes=[...text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(kg|grs?|grams?|gramas?|g)\b/gi)];
  if(sizes.length!==1)return null;
  const n=weightNumber(sizes[0][1]);return n!==null&&n>0?n*(sizes[0][2].toLowerCase()==='kg'?1000:1):null;
}
export const kgFromUnits=(quantity:number|null,unitGrams:number|null)=>quantity!==null&&unitGrams!==null&&Number.isFinite(quantity)&&Number.isFinite(unitGrams)&&quantity>=0&&unitGrams>0?quantity*unitGrams/1000:null;
export function invoiceItem(line:string,header:string){
  const unitGrams=gramsInProduct(line);let quantity:number|null=null;
  const qtyLabel=line.match(/(?:\bqty|\bquantity|\bquantidade|\bqtd)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i);
  const units=line.match(/\b(\d+(?:[.,]\d+)?)\s*(?:unds?|unidades?|units?|pcs)\b/i);
  const after=line.match(/\b\d+(?:[.,]\d+)?\s*(?:g|grs?|grams?|gramas?|kg)\b\s*[x×]\s*(\d+(?:[.,]\d+)?)/i);
  const before=line.match(/\b(\d+(?:[.,]\d+)?)\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:g|grs?|grams?|gramas?|kg)\b/i);
  const explicit=qtyLabel?.[1]||units?.[1]||after?.[1]||before?.[1];
  if(explicit)quantity=weightNumber(explicit);
  else if(/(?:activity|description|descri[cç][aã]o).*\b(?:qty|quantity|qtd)\b/i.test(header)){
    // QTY follows the description; the next columns are price and amount, never weight.
    const tail=line.match(/\b\d+(?:[.,]\d+)?\s*(?:g|grs?|grams?|gramas?|kg)\b\)?\s+(\d+(?:[.,]\d+)?)(?:\s|$)/i);
    if(tail)quantity=weightNumber(tail[1]);
  }else if(/\b(?:qty|quantity|qtd)\b.*(?:activity|description|descri[cç][aã]o)/i.test(header)){
    const leading=line.match(/^\s*(\d+(?:[.,]\d+)?)\s+/);if(leading)quantity=weightNumber(leading[1]);
  }
  const sku=/\bsku\b/i.test(header)?line.trim().match(/^([A-Z][A-Z0-9_-]*\d[A-Z0-9_-]*)\s+/i)?.[1]||'':'';
  return {quantity,unitGrams,kg:kgFromUnits(quantity,unitGrams),sku};
}
