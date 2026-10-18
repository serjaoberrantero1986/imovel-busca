// Contratos documentados em https://geckoapi.com.br/docs/
// Adaptadores puros e sem credenciais. Não usa endpoints privados de portais.
export const PORTALS = {
  'zapimoveis.com.br': {plp:'structured',urlSearch:false,geo:true,sort:[],amenities:false},
  'vivareal.com.br': {plp:'structured',urlSearch:true,geo:true,sort:['relevance','date','price','biggest_price','biggest_area'],amenities:true},
  'chavesnamao.com.br': {plp:'structured',urlSearch:true,geo:true,sort:['relevance','price','biggest_price'],amenities:true},
  'olx.com.br': {plp:'olx',urlSearch:true,geo:false,sort:['relevance','date','price','biggest_price','price_relevance'],amenities:false},
  'imovelweb.com.br': {plp:'url',urlSearch:true,geo:false,sort:[],amenities:false}
};
export const TYPES = new Set(['house','apartment','land','farm','penthouse','two_story_house','condominium','commercial_room','warehouse','commercial_point','flat','kitnet']);
const STATE_NAMES = {
 AC:'acre',AL:'alagoas',AP:'amapa',AM:'amazonas',BA:'bahia',CE:'ceara',DF:'distrito federal',
 ES:'espirito santo',GO:'goias',MA:'maranhao',MT:'mato grosso',MS:'mato grosso do sul',
 MG:'minas gerais',PA:'para',PB:'paraiba',PR:'parana',PE:'pernambuco',PI:'piaui',RJ:'rio de janeiro',
 RN:'rio grande do norte',RS:'rio grande do sul',RO:'rondonia',RR:'roraima',SC:'santa catarina',
 SP:'sao paulo',SE:'sergipe',TO:'tocantins'
};
export function canon(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
export function stateCode(raw){
  const target=canon(raw);
  if(!target)return '';
  const direct=Object.keys(STATE_NAMES).find(k=>canon(k)===target);
  if(direct)return direct;
  return Object.keys(STATE_NAMES).find(k=>STATE_NAMES[k]===target)||'';
}
function text(v,max=120){return typeof v==='string'?v.trim().slice(0,max):'';}
function integer(v,max=999999999){
  if(v===undefined||v===null||v==='')return null;
  const n=Number(v);if(!Number.isInteger(n)||n<0||n>max)throw Error('Filtro numérico inválido.');
  return n;
}
function range(p,min,max){if(p[min]!==undefined&&p[max]!==undefined&&p[min]>p[max])throw Error('Valor mínimo maior que o máximo.');}
function httpsPortal(raw,target){
  try {
    const u=new URL(raw);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
    const host=u.hostname.toLowerCase();
    return host===target||host.endsWith('.'+target);
  }catch{return false;}
}
function sortFor(target,raw){
  if(!raw)return null;
  const s=text(raw,30);
  if(!PORTALS[target].sort.includes(s))throw Error('Ordenação indisponível para o portal escolhido.');
  return s;
}
export function buildGeckoPayload(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||!PORTALS[input.target]||!['plp','pdp'].includes(input.type))
    throw Error('Portal ou operação inválida.');
  const target=input.target,cap=PORTALS[target];
  const payload={target,type:input.type};
  if(input.type==='pdp'){
    if(!httpsPortal(input.url,target))throw Error('Informe um link HTTPS de anúncio pertencente ao portal selecionado.');
    payload.url=input.url;return payload;
  }
  // Uma avaliação exige município conhecido, mesmo com URL de pesquisa de origem.
  const city=text(input.city,90),state=stateCode(input.state);
  if(city.length<2||!state)throw Error('Informe município e UF brasileiros válidos.');
  const searchUrl=text(input.url,2300),page=integer(input.page,500)||1;
  if(page<1)throw Error('Página precisa ser maior que zero.');
  if(searchUrl){
    if(!cap.urlSearch||!httpsPortal(searchUrl,target))throw Error('Este portal não aceita a URL de pesquisa fornecida.');
    if(target==='imovelweb.com.br'&&!new URL(searchUrl).pathname.endsWith('.html'))
      throw Error('O Imovelweb exige uma URL pública de resultados terminada em .html.');
    payload.url=searchUrl;
    // Com URL, a origem é a fonte de verdade. Só Chaves/VivaReal permitem paginar fora da URL.
    if(target==='chavesnamao.com.br'||target==='vivareal.com.br'||target==='imovelweb.com.br')payload.page=page;
    return payload;
  }
  if(target==='imovelweb.com.br')throw Error('No Imovelweb, copie a URL de resultados (terminada em .html).');
  payload.city=city;payload.state=state;payload.page=page;
  const keyword=text(input.keyword,110),kind=text(input.propertyType,40);
  if(kind&&!TYPES.has(kind))throw Error('Tipo de imóvel inválido.');
  for(const key of ['priceMin','priceMax']){
    const n=integer(input[key],500000000);
    if(n!==null)payload[key]=n;
  }
  range(payload,'priceMin','priceMax');
  if(cap.plp==='olx'){
    payload.categoryPath=text(input.categoryPath,150)||'imoveis';
    // Categoria específica confirmada no portal para casas à venda.
    if(payload.categoryPath==='imoveis'&&kind==='house'&&input.businessType!=='rent')
      payload.categoryPath='imoveis/venda/casas';
    if(!/^[a-zA-Z0-9À-ÿ_-]+(?:\/[a-zA-Z0-9À-ÿ_-]+)*$/.test(payload.categoryPath))
      throw Error('Caminho de categoria OLX inválido.');
    let region=text(input.region,110);
    // Fonte: /imoveis/venda/casas/estado-sp/regiao-de-sorocaba/salto-de-pirapora
    if(state==='SP'&&canon(city)==='salto de pirapora'&&(!region||canon(region)==='sorocaba'))
      region='Regiao de Sorocaba';
    if(region)payload.region=region;
    payload.keyword=keyword||({house:'casa',apartment:'apartamento',land:'terreno',farm:'chacara',penthouse:'cobertura',commercial_room:'sala comercial',warehouse:'galpao'}[kind]||'imoveis');
    if(keyword&&kind){const name={house:'casa',apartment:'apartamento',land:'terreno',farm:'chacara',penthouse:'cobertura',commercial_room:'sala comercial',warehouse:'galpao'}[kind];if(name&&!canon(keyword).includes(canon(name)))payload.keyword+=' '+name;}
  }else{
    payload.businessType=input.businessType==='rent'?'rent':'sale';
    if(kind)payload.propertyTypes=[kind];
    if(keyword&&target!=='chavesnamao.com.br')payload.keyword=keyword; // não documentado para Chaves
    const neigh=text(input.neighborhood,120);
    if(neigh)payload.neighborhood=neigh;
    for(const key of ['areaMin','areaMax']){
      const n=integer(input[key],10000000);
      if(n!==null)payload[key]=n;
    }
    range(payload,'areaMin','areaMax');
    if(input.exactCounts===true){
      for(const key of ['bedrooms','bathrooms','parkingSpots']){
        const n=integer(input[key],20);if(n!==null)payload[key]=[n];
      }
    }
    if(cap.amenities&&Array.isArray(input.amenities)&&input.amenities.length){
      payload.amenities=input.amenities.filter(x=>typeof x==='string'&&/^[a-z_]{2,35}$/.test(x)).slice(0,12);
    }
    if(input.searchNear===true){
      const lat=Number(input.latitude),lon=Number(input.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)
        throw Error('Latitude e longitude inválidas.');
      payload.latitude=lat;payload.longitude=lon;
    }
    if((target==='vivareal.com.br'||target==='chavesnamao.com.br')&&input.directOwner===true)
      payload.directOwner=true;
  }
  const sort=sortFor(target,input.sort);
  if(sort)payload.sort=sort;
  return payload;
}
// O retorno do Imovelweb e Chaves na Mão pode vir sem o envelope {data:{...}}.
// Normalizamos a forma externa, preservando os campos brutos.
export function responseEnvelope(json){
  if(!json||typeof json!=='object')return json;
  if(json.data!==undefined)return json;
  if(Array.isArray(json.items)||json.source&&json.type==='pdp')
    return {data:json};
  return json;
}
export function auditLocation(data,city,state){
  const list=Array.isArray(data?.items)?data.items:[];
  let discardedOtherCities=0,discardedMissingLocation=0;
  const expectedCity=canon(city),expectedState=stateCode(state);
  const items=list.filter(p=>{
    const location=p?.address||p?.location||{};
    const actualCity=canon(location.city??p.city);
    const actualState=stateCode(location.stateAcronym||location.state||p.state);
    if(!actualCity||!actualState){discardedMissingLocation++;return false;}
    if(actualCity!==expectedCity||actualState!==expectedState){discardedOtherCities++;return false;}
    return true;
  });
  return {items,audit:{
    requestedCity:city,requestedState:expectedState,providerItems:list.length,
    acceptedItems:items.length,discardedOtherCities,discardedMissingLocation,
    sourceTotalResults:typeof data.totalResults==='number'?data.totalResults:null,
    exactMunicipality:true
  }};
}


// Verifica qual URL da OLX a GeckoAPI consultou, sem declarar sucesso de busca
// apenas porque o caminho está correto: cada anúncio ainda passa por auditoria.
export function auditOlxRequestUrl(data,payload){
  if(payload.target!=='olx.com.br'||payload.type!=='plp')
    return {status:'not_applicable',url:null};
  const raw=data?.requestUrl||data?.url;
  let address;
  try {
    address=new URL(raw);
    if(address.protocol!=='https:'||!['olx.com.br','www.olx.com.br'].includes(address.hostname))
      throw Error('host não reconhecido');
  }catch{
    return {status:'unknown',url:null,reason:'A GeckoAPI não forneceu uma URL OLX verificável.'};
  }
  const link=address.toString();
  if(payload.url)
    return {status:'provided',url:link,reason:'URL fornecida manualmente; confira os filtros na própria OLX.'};
  const segments=address.pathname.toLowerCase().split('/').filter(Boolean);
  const slug=x=>canon(x).replace(/\s+/g,'-');
  const expected=['estado-'+String(payload.state).toLowerCase()];
  if(payload.region)expected.push(slug(payload.region));
  if(payload.city)expected.push(slug(payload.city));
  const missing=expected.filter(segment=>!segments.includes(segment));
  if(missing.length)
    return {status:'mismatch',url:link,
      reason:'A URL que a GeckoAPI gerou não contém o recorte regional solicitado.',
      missingSegments:missing};
  return {status:'match',url:link,
    reason:'A URL gerada contém estado, região e município solicitados.'};
}
