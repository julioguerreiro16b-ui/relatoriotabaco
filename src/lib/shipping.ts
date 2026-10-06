const clean=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\./g,'').trim();
export const UNKNOWN_STATE='Não identificado';
export const US_STATES:Record<string,string>={AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia',PR:'Puerto Rico',VI:'US Virgin Islands',GU:'Guam',AS:'American Samoa',MP:'Northern Mariana Islands'};
const usa=new Set(['us','usa','united states','united states of america','estados unidos','eua']);
const countries=new Set(['canada','can','ca','brazil','brasil','br','bra','mexico','mx','mex','united kingdom','uk','gb','great britain','england','reino unido','france','franca','fr','germany','alemanha','de','portugal','pt','spain','espanha','es','italy','italia','it','australia','au','new zealand','nova zelandia','nz','netherlands','holanda','nl','switzerland','suica','ch','austria','at','belgium','belgica','be','argentina','ar','chile','cl','peru','pe','colombia','co','japan','japao','jp','china','cn','india','in','israel','il','south africa','africa do sul','za','sweden','suecia','se','norway','noruega','no','denmark','dinamarca','dk','ireland','irlanda','ie','ecuador','equador','ec','costa rica','cr','uruguay','uruguai','uy']);
export function normalizeState(state:unknown,shippingCountry:unknown=''):string {
  const country=clean(shippingCountry),value=clean(state);
  // A country code is interpreted only in the destination-country field (CA can mean Canada or California).
  if(country&&!usa.has(country)&&!['unknown','na','n/a','nao identificado',''].includes(country))return 'Exterior';
  if(['exterior','international','internacional','outside usa'].includes(value))return 'Exterior';
  for(const [code,name]of Object.entries(US_STATES))if(value===code.toLowerCase()||value===clean(name)||value===`${clean(name)} - ${code.toLowerCase()}`)return code;
  return UNKNOWN_STATE;
}
export function shippingFromText(text:string){
  const countryLabel=text.match(/(?:shipping country|destination country|pa[ií]s de entrega)\s*:\s*([^\n]+)/i)?.[1]?.trim()||'';
  const stateLabel=text.match(/(?:shipping state|shipping province|estado de entrega)\s*:\s*([^\n]+)/i)?.[1]?.trim()||'';
  const block=text.match(/(?:^|\n)\s*(?:ship to|shipping address|destinat[aá]rio)\s*:?\s*\n?([\s\S]*?)(?=\n\s*(?:invoice|bill to|date\b|due date|terms|sku\b|description|quantity|qty\b|item\b)|$)/i)?.[1]?.trim()||'';
  const lines=block.split('\n').map(l=>l.trim()).filter(Boolean);
  let country=countryLabel;
  if(!country){
    for(const line of lines.slice(1)){
      if(usa.has(clean(line))||/\b(?:USA|US|United States)\s*$/i.test(line)){country='US';break;}
      if(countries.has(clean(line))&&clean(line).length>2){country=line;break;}
    }
  }
  let state=normalizeState(stateLabel,country);
  if(state===UNKNOWN_STATE){
    for(const line of lines.slice(1)){
      const zip=line.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
      if(zip&&US_STATES[zip[1]]){state=normalizeState(zip[1],country);break;}
      for(const [code,name]of Object.entries(US_STATES))if(new RegExp(`\\b${name}\\b`,'i').test(line)){state=normalizeState(code,country);break;}
      if(state!==UNKNOWN_STATE)break;
    }
  }
  return {state,shippingCountry:country,address:block,recipient:lines[0]||text.match(/(?:shipping name|ship to|destinat[aá]rio)\s*:\s*([^\n]+)/i)?.[1]?.trim()||''};
}
