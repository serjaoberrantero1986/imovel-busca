import { timingSafeEqual } from 'node:crypto';

const TARGETS = new Set(['zapimoveis.com.br','olx.com.br','imovelweb.com.br','vivareal.com.br','chavesnamao.com.br']);
const STRUCTURED = new Set(['zapimoveis.com.br','vivareal.com.br','chavesnamao.com.br']);
const GEO = STRUCTURED;
const PROPERTY_TYPES = new Set(['house','apartment','land','farm','penthouse','commercial_room','warehouse','commercial_point','flat','kitnet']);
const buckets = new Map();

function send(res, status, data) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(status).json(data);
}
function sameSecret(a,b) {
  if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x,y);
}
function validUrl(raw,target) {
  try {
    const u=new URL(raw);
    return u.protocol==='https:'&&!u.username&&!u.password&&(
      u.hostname===target || u.hostname.endsWith('.'+target)
    );
  }catch{return false;}
}
function optionalText(raw,max) {return typeof raw==='string'?raw.trim().slice(0,max):'';}
function optionalInteger(raw,max=100000000) {
  if(raw===null||raw===undefined||raw==='')return null;
  const n=Number(raw);
  if(!Number.isInteger(n)||n<0||n>max)throw new Error('Um filtro numérico está fora do intervalo aceito.');
  return n;
}
function numIfPresent(body,payload,from,to,limit) {
  const v=optionalInteger(body[from],limit);
  if(v!==null)payload[to]=v;
}
function assertRange(p,lo,hi) {
  if(p[lo]!==undefined&&p[hi]!==undefined&&p[hi]<p[lo])throw new Error('O valor máximo não pode ser inferior ao mínimo.');
}
function queryForProvider(body) {
  if(!body||typeof body!=='object'||Array.isArray(body)||!TARGETS.has(body.target)||!['plp','pdp'].includes(body.type))
    throw new Error('Portal ou operação inválida.');
  const target=body.target, plp=body.type==='plp';
  const payload={target,type:body.type};
  if(!plp) {
    if(typeof body.url!=='string'||body.url.length>2300||!validUrl(body.url,target))
      throw new Error('Informe a URL HTTPS de um anúncio do portal selecionado.');
    payload.url=body.url;
    return payload;
  }
  if(body.url) {
    if(!['olx.com.br','imovelweb.com.br'].includes(target)||typeof body.url!=='string'||body.url.length>2300||!validUrl(body.url,target))
      throw new Error('Este portal não aceita URL personalizada nesta modalidade.');
    payload.url=body.url;
    return payload;
  }
  if(target==='imovelweb.com.br') throw new Error('Para pesquisar no Imovelweb, informe a URL de uma página de resultados do portal.');
  const city=optionalText(body.city,90),state=optionalText(body.state,2).toUpperCase();
  if(city.length<2||!/^[A-Z]{2}$/.test(state))throw new Error('Preencha cidade e UF válidas.');
  payload.city=city;
  payload.state=state;
  payload.page=optionalInteger(body.page,50)||1;
  const word=optionalText(body.keyword,110);
  const kind=optionalText(body.propertyType,60);
  if(kind&&!PROPERTY_TYPES.has(kind))throw new Error('Tipo de imóvel não suportado neste laboratório.');
  numIfPresent(body,payload,'priceMin','priceMin',500000000);
  numIfPresent(body,payload,'priceMax','priceMax',500000000);
  assertRange(payload,'priceMin','priceMax');
  if(STRUCTURED.has(target)) {
    payload.businessType=body.businessType==='rent'?'rent':'sale';
    if(kind)payload.propertyTypes=[kind];
    if(word)payload.keyword=word;
    const neighborhood=optionalText(body.neighborhood,120);
    if(neighborhood)payload.neighborhood=neighborhood;
    numIfPresent(body,payload,'areaMin','areaMin',10000000);
    numIfPresent(body,payload,'areaMax','areaMax',10000000);
    assertRange(payload,'areaMin','areaMax');
    for(const [input,key] of [['bedrooms','bedrooms'],['bathrooms','bathrooms'],['parkingSpots','parkingSpots']]){
      const n=optionalInteger(body[input],20);
      // A API suporta conjuntos de valores específicos, não faixa "pelo menos".
      // Filtros mínimos são aplicados no cliente, para não excluir imóveis inesperadamente.
      if(n!==null&&body.exactCounts===true)payload[key]=[n];
    }
    if(GEO.has(target)&&body.searchNear===true) {
      const lat=Number(body.latitude),lng=Number(body.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)
        throw new Error('Selecione um ponto válido no mapa.');
      payload.latitude=lat;payload.longitude=lng;
    }
  } else if(target==='olx.com.br') {
    // A OLX usa categoria e palavras-chave em vez de propertyTypes/coords.
    // Fixa a categoria de imóveis para não misturar produtos de outros setores.
    payload.categoryPath='imoveis';
    payload.keyword=word||({house:'casa',apartment:'apartamento',land:'terreno',farm:'chácara',penthouse:'cobertura',commercial_room:'sala comercial',warehouse:'galpão'}[kind]||'imóveis à venda');
    if(kind&&word)payload.keyword+= ' '+({house:'casa',apartment:'apartamento',land:'terreno',farm:'chácara',penthouse:'cobertura',commercial_room:'sala comercial',warehouse:'galpão'}[kind]||'');
  }
  return payload;
}
export default async function handler(req,res) {
  if(req.method!=='POST')return send(res,405,{error:'Método não permitido.'});
  const token=process.env.GECKO_API_TOKEN,code=process.env.LAB_ACCESS_CODE;
  if(!token||!code)return send(res,503,{error:'Configure GECKO_API_TOKEN e LAB_ACCESS_CODE na Vercel.'});
  if(!sameSecret(req.headers['x-lab-code'],code))return send(res,401,{error:'Código de acesso incorreto.'});
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].slice(0,80);
  const now=Date.now(),bucket=buckets.get(ip)||{start:now,count:0};
  if(now-bucket.start>60000){bucket.start=now;bucket.count=0;}
  bucket.count++;buckets.set(ip,bucket);
  if(bucket.count>6)return send(res,429,{error:'Limite de consultas temporário: aguarde um minuto.'});
  if(buckets.size>5000)buckets.clear();
  let payload;
  try {payload=queryForProvider(req.body);}catch(error) {return send(res,400,{error:error.message});}
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),26000);
  try {
    const upstream=await fetch('https://api.geckoapi.com.br/v1/extract',{
      method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:controller.signal
    });
    const raw=await upstream.text();let json;
    try{json=JSON.parse(raw);}catch{json=null;}
    if(!upstream.ok)return send(res,upstream.status===429?429:502,{
      error:'A GeckoAPI não concluiu a consulta. Confira os créditos e os filtros.',
      providerStatus:upstream.status
    });
    if(!json||typeof json!=='object')return send(res,502,{error:'A fonte respondeu em formato inesperado.'});
    return send(res,200,json);
  } catch(error) {
    return send(res,502,{error:error?.name==='AbortError'?'Consulta excedeu o tempo limite.':'Falha de conexão com a GeckoAPI.'});
  } finally {clearTimeout(timeout);}
}
