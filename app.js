const $ = id => document.getElementById(id);
const number = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const first = value => Array.isArray(value) ? (value.length ? value[0] : null) : value;
const money = value => value === null ? 'Preço não informado' : value.toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const url = value => { try {const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : null} catch {return null;} };
const text = value => value === null || value === undefined || value === '' ? '—' : String(value);
let records = [], selected = new Set(), reported = null, center = null, map = null, ring = null, anchor = null, layer = null;
let activeLocation = null;

function canon(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function classify(item) {
  const units=(Array.isArray(item.unitTypes)?item.unitTypes:[]).map(canon);
  const match=words=>units.some(u=>words.some(w=>u.includes(w)));
  // Tipos estruturados têm prioridade sobre títulos que possam mencionar bairros
  // com palavras como "Chácaras" ou "Jardim dos Terrenos".
  if(match(['allotment','land','lot']))return 'land';
  if(match(['farm','rural']))return 'farm';
  if(match(['penthouse']))return 'penthouse';
  if(match(['warehouse']))return 'warehouse';
  if(match(['commercial_point']))return 'commercial_point';
  if(match(['commercial_room']))return 'commercial_room';
  if(match(['two_story_house']))return 'two_story_house';
  if(match(['condominium']))return 'condominium';
  if(match(['flat']))return 'flat';
  if(match(['kitnet']))return 'kitnet';
  if(match(['apartment']))return 'apartment';
  if(match(['home','house']))return 'house';
  const identify=raw=>{
    if(!raw)return 'unknown';
    if(/^(sobrado|sobrados)\b/.test(raw))return 'two_story_house';
    if(/^(casa|casas)\b/.test(raw))return 'house';
    if(/^(studio|kitnet)\b/.test(raw))return 'kitnet';
    if(/^(flat|flats)\b/.test(raw))return 'flat';
    if(/^(apartamento|apartamentos)\b/.test(raw))return 'apartment';
    if(/^(ponto comercial|pontos comerciais)\b/.test(raw))return 'commercial_point';
    if(/^(terreno|terrenos|lote|lotes)\b/.test(raw))return 'land';
    if(/^(chacara|chacaras|sitio|sitios|fazenda|fazendas)\b/.test(raw))return 'farm';
    if(/^(cobertura|coberturas)\b/.test(raw))return 'penthouse';
    if(/\b(terreno|terrenos|lote|lotes)\b/.test(raw))return 'land';
    if(/\b(chacara|chacaras|sitio|sitios|fazenda|fazendas)\b/.test(raw))return 'farm';
    if(/\b(cobertura|coberturas)\b/.test(raw))return 'penthouse';
    if(/\b(ponto comercial|pontos comerciais)\b/.test(raw))return 'commercial_point';
    if(/\b(galpao|galpoes)\b/.test(raw))return 'warehouse';
    if(/\b(sala comercial|salas comerciais)\b/.test(raw))return 'commercial_room';
    if(/\b(studio|kitnet)\b/.test(raw))return 'kitnet';
    if(/\b(flat|flats)\b/.test(raw))return 'flat';
    if(/\b(apartamento|apartamentos)\b/.test(raw))return 'apartment';
    if(/\b(sobrado|sobrados)\b/.test(raw))return 'two_story_house';
    if(/\b(casa|casas)\b/.test(raw))return 'house';
    return 'unknown';
  };
  const typeFields=[item.realtyType?.name,item.property?.type,item.propertyType,item.typeLabel].filter(Boolean);
  for(const entry of typeFields){
    const code=canon(entry).replace(/\s+/g,'_');
    if(code!=='unknown'&&code!=='other'&&Object.hasOwn(typeLabel,code))return code;
    if(code==='studio')return 'kitnet';
  }
  const structured=identify(canon(typeFields.join(' ')));
  if(structured!=='unknown')return structured;
  // O CSV exportado não tinha coluna de tipo. Quando o próprio link VivaReal
  // informa explicitamente a tipologia, aproveitamos somente esse prefixo.
  const link=url(item.url||item.link||item.listingUrl);
  if(link) {
    const parsed=new URL(link);
    if(/(^|\.)vivareal\.com\.br$/.test(parsed.hostname)) {
      const slug=parsed.pathname.match(/\/imovel\/(casa|sobrado|apartamento|terreno|lote|chacara|sitio|cobertura|galpao|kitnet|flat|studio|ponto-comercial)(?:-|\/|$)/i)?.[1];
      if(slug) {
        const fromLink=identify(canon(slug));
        if(fromLink!=='unknown')return fromLink;
      }
    }
  }
  return identify(canon([item.category,item.title].filter(Boolean).join(' ')));
}
const typeLabel={
  house:'Casa',two_story_house:'Sobrado',condominium:'Imóvel em condomínio',
  apartment:'Apartamento',flat:'Flat',kitnet:'Kitnet / studio',
  land:'Terreno / lote',farm:'Chácara / sítio / fazenda',penthouse:'Cobertura',
  warehouse:'Galpão',commercial_room:'Sala comercial',commercial_point:'Ponto comercial',
  other:'Outro (descrição livre)',unknown:'A classificar'
};
function bestTitle(item,type,address) {
  const provided=[item.title,item.generatedTitle,item.name,item.metaTitle].find(v=>
    typeof v==='string'&&v.trim()&&canon(v)!=='imovel sem titulo');
  return provided?.trim()||[typeLabel[type]||'Imóvel',address.neighborhood||item.neighborhood].filter(Boolean).join(' • ');
}
function propValue(item,keys) {
  const all=[...(Array.isArray(item.properties)?item.properties:[]),...(Array.isArray(item.attributes)?item.attributes:[])];
  const matched=all.find(p=>keys.some(t=>canon([p.name,p.label].join(' ')).includes(canon(t))));
  const value=matched?.value;
  if(value===null||value===undefined)return null;
  const cleaned=String(value).replace(/[^\d,.]/g,'').replace(/\./g,'').replace(',','.');
  return cleaned&&Number.isFinite(Number(cleaned))?Number(cleaned):null;
}

function inferOfferPurpose(item,selectedPrice=null){
  const codes=[item?.offerPurpose,item?.businessType,item?.transactionType,
    item?.operation,selectedPrice?.businessType].filter(v=>typeof v==='string');
  for(const input of codes){
    const code=canon(input);
    if(/^(rent|rental|aluguel|locacao|lease)$/.test(code))return 'rent';
    if(/^(sale|sell|venda|buy)$/.test(code))return 'sale';
  }
  const link=url(item?.link||item?.url||item?.listingUrl)||'';
  if(/(?:^|[-/])(?:aluguel|locacao|rent)(?:[-/?]|$)/i.test(link))return 'rent';
  if(/(?:^|[-/])(?:venda|sale)(?:[-/?]|$)/i.test(link))return 'sale';
  return 'unknown';
}
const BR_STATES={AC:'acre',AL:'alagoas',AP:'amapa',AM:'amazonas',BA:'bahia',CE:'ceara',DF:'distrito federal',ES:'espirito santo',GO:'goias',MA:'maranhao',MT:'mato grosso',MS:'mato grosso do sul',MG:'minas gerais',PA:'para',PB:'paraiba',PR:'parana',PE:'pernambuco',PI:'piaui',RJ:'rio de janeiro',RN:'rio grande do norte',RS:'rio grande do sul',RO:'rondonia',RR:'roraima',SC:'santa catarina',SP:'sao paulo',SE:'sergipe',TO:'tocantins'};
function uf(v) {const x=canon(v);return Object.keys(BR_STATES).find(k=>canon(k)===x||BR_STATES[k]===x)||'';}

// Os dados dos portais não são completos. O texto pode fornecer INDÍCIOS,
// não valores certificados. Áreas sem indicação explícita de natureza não
// são convertidas em área útil, área total ou área construída.
function extractTextEvidence(title,description=''){
  const observations=[];
  const entries=[['título',title],['descrição',description]];
  for(const [origin,input] of entries){
    const raw=typeof input==='string'?input.slice(0,3000):'';
    if(!raw||raw==='—')continue;
    const lowered=canon(raw);
    // Regra explícita e conservadora: números associados a unidades e palavras
    // inequívocas; não inventar preço, área ou localização.
    const patterns=[
      ['beds',/\b(\d{1,2})\s*(?:dormit[oó]rios?|quartos?)\b/gi,'dormitórios'],
      ['suites',/\b(\d{1,2})\s*su[ií]tes?\b/gi,'suítes'],
      ['baths',/\b(\d{1,2})\s*(?:banheiros?|wcs?)\b/gi,'banheiros'],
      ['spaces',/\b(\d{1,2})\s*(?:vagas?(?:\s+de\s+garagem)?)\b/gi,'vagas']
    ];
    for(const [field,re,label] of patterns){
      const m=re.exec(raw);
      if(!m)continue;
      const value=Number(m[1]);
      if(value>0&&value<=60&&!observations.some(x=>x.field===field&&x.value===value))
        observations.push({field,value,origin,label:value+' '+label});
    }
    const re=/\b(\d{1,5}(?:[,.]\d{1,2})?)\s*(?:m\s*(?:²|2)|metros?\s+quadrados?)(?=\s|[,.;:!?\/-]|$)/gi;
    for(const match of raw.matchAll(re)){
      const value=Number(match[1].replace(',','.'));
      if(!Number.isFinite(value)||value<=0||value>100000)continue;
      const left=canon(raw.slice(Math.max(0,match.index-28),match.index));
      const right=canon(raw.slice(match.index+match[0].length,match.index+match[0].length+26)).trim();
      const nearby=(right.match(/^(?:de )?(?:area )?(?:util|privativa|construida|total|terreno|lote)\b/)?.[0]||
        left.match(/(?:area )?(?:util|privativa|construida|total|terreno|lote)(?: de)?\s*$/)?.[0]||'');
      const kind=/\b(util|privativa)\b/.test(nearby)?'útil/privativa':
        /\bconstruida\b/.test(nearby)?'construída':
        /\b(total|terreno|lote)\b/.test(nearby)?'terreno/total':'não especificada';
      if(observations.some(x=>x.field==='area'&&x.value===value&&x.kind===kind))continue;
      observations.push({field:'area',value,kind,origin,label:match[0].trim()+
        ' ('+(kind==='não especificada'?'tipo de área não identificado': 'área '+kind)+')'});
    }
  }
  return observations.slice(0,12);
}
function safeTextEvidence(input,title,description){
  // CSVs legados trazem apenas título. Metadados já enriquecidos são aceitos
  // se puderem ser validados, sem permitir atributos arbitrários ou HTML.
  if(!Array.isArray(input))return extractTextEvidence(title,description);
  return input.slice(0,12).filter(x=>x&&typeof x==='object'&&
    ['beds','suites','baths','spaces','area'].includes(x.field)&&
    Number.isFinite(x.value)&&x.value>0&&x.value<100001).map(x=>({
      field:x.field,value:x.value,origin:['título','descrição'].includes(x.origin)?x.origin:'título',
      kind:typeof x.kind==='string'?x.kind.slice(0,40):'',
      label:typeof x.label==='string'?x.label.slice(0,100):String(x.value)
    }));
}

function normalized(item,source) {
  const attr=(!Array.isArray(item.attributes)&&item.attributes)||{};
  const prices=Array.isArray(item.prices)?item.prices.find(p=>p.businessType==='SALE')||item.prices[0]||{}:item.prices||{};
  const area=item.area||{},counts=item.counts||{};
  const address=item.address&&typeof item.address==='object'?item.address:{};
  const location=item.location&&typeof item.location==='object'?item.location:{};
  const geo=item.coordinates||address.coordinates||location.coordinates||{};
  const lat=number(address.latitude??location.latitude??geo.latitude??item.latitude);
  const lng=number(address.longitude??location.longitude??geo.longitude??item.longitude);
  const valid=lat!==null&&lng!==null&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&(lat!==0||lng!==0);
  const id=text(item.id||item.listingId||item.externalId||item.listingExternalId||item.adId||item.url);
  const take=(key,fallback)=>number(first(attr[key])??fallback);
  const count=(key,fallback)=>number(counts[key]?.count??fallback);
  const type=classify(item);
  return {
    id,key:source+':'+id,source,type,offerPurpose:inferOfferPurpose(item,prices),
    title:bestTitle(item,type,{neighborhood:address.neighborhood||location.neighborhood}),
    textEvidence:extractTextEvidence(item.title||item.generatedTitle||'',item.description),
    link:url(item.url||item.listingUrl),
    price:number(prices.mainValue??prices.value??prices.rawPrice??prices.price??item.askingPrice??item.price?.amount??item.price),
    usable:take('usableAreas',area.useful??item.property?.usableArea??item.usableArea??propValue(item,['area util','area privativa'])),
    total:take('totalAreas',area.total??item.property?.totalArea??item.totalArea??item.landArea??propValue(item,['area total','terreno'])),
    beds:take('bedrooms',count('bedrooms',item.property?.bedrooms??item.bedrooms??propValue(item,['quartos','dormitorios']))),
    suites:take('suites',count('suites',item.property?.suites??item.suites??propValue(item,['suites']))),
    baths:take('bathrooms',count('bathrooms',item.property?.bathrooms??item.bathrooms??propValue(item,['banheiros']))),
    spaces:take('parkingSpaces',count('garages',item.property?.parkingSpaces??item.parkingSpaces??propValue(item,['vagas','garagem']))),
    floors:take('floors',item.floors),
    neighborhood:text(address.neighborhood||location.neighborhood||item.neighborhood),
    city:text(address.city||location.city||item.city),
    state:uf(address.stateAcronym||address.stateCode||address.state||location.stateAcronym||location.stateCode||location.state||item.stateCode||item.state)||text(address.stateCode||address.state||location.stateCode||location.state||item.stateCode||item.state),
    lat:valid?lat:null,lng:valid?lng:null,
    approx:address.isApproximateLocation===true||address.approximate===true||address.publicAddress===false||location.isApproximateLocation===true||location.approximate===true||location.publicAddress===false,
    amenities:Array.isArray(item.amenities)?item.amenities:Array.isArray(item.privativeAmenities)?item.privativeAmenities:[],
    advertiser:text(item.advertiser?.name||item.publisher?.name),description:text(item.description),
    detailed:false
  };
}
function payload(input) {
  const d=input?.data??input;
  // VivaReal PDP: data.listing; ZAP, OLX e Chaves PDP: data.data.
  const leaf=d?.listing??(d?.data&&typeof d.data==='object'&&!Array.isArray(d.data)?d.data:d);
  const arr=Array.isArray(d?.items)?d.items:Array.isArray(d?.results)?d.results:
    d?.item?[d.item]:d?.listing?[d.listing]:d?.property?[d.property]:
    leaf&&(leaf.id||leaf.listingId||leaf.title)?[leaf]:[];
  if(!arr.length)throw Error(input?.notFound?'Anúncio não encontrado.':'A consulta não retornou anúncios para os filtros usados.');
  const source=d?.source||input?.source||d?.target||'Fonte externa';
  return {items:arr.map(x=>normalized(x,source)),total:typeof d?.totalResults==='number'?d.totalResults:typeof d?.total==='number'?d.total:null};
}
function report(message, error=false) { $('status').textContent = message; $('status').className = error ? 'status error' : 'status'; }
const validPoint = p => p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180&&(p.lat!==0||p.lng!==0);
function distance(a,b) { if (!a || !validPoint(b)) return null; const rad = Math.PI/180, dLat=(b.lat-a.lat)*rad, dLon=(b.lng-a.lng)*rad; const z = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2; return 12742.018*Math.asin(Math.min(1,Math.sqrt(z))); }
// OSMF não permite usar seus servidores comunitários como CDN de mapas para
// aplicativos públicos sem respeitar estritamente a política de tiles.
// OpenFreeMap distribui mapas vetoriais próprios baseados no OpenStreetMap,
// permite uso comercial e não exige chave, sem SLA garantido.
// MapLibre GL é integrado ao Leaflet para preservar o círculo, marcadores e raio.
const BASEMAP_STYLE='https://tiles.openfreemap.org/styles/positron';
const BASEMAP_ATTRIBUTION='<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · '+
  '<a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a> · '+
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>';
function showMapError(message){
  const note=$('map-error');
  if(note){note.textContent=message;note.classList.remove('hidden');}
}
let vectorBasemap=null;
const hasMap=typeof window.L!=='undefined';
if(hasMap){
  map=L.map('map',{zoomControl:true,minZoom:1,preferCanvas:false}).setView([-23.65,-47.58],12);
  if(typeof L.maplibreGL==='function'&&typeof window.maplibregl!=='undefined'){
    try{
      const baseLayer=L.maplibreGL({style:BASEMAP_STYLE}).addTo(map);
      vectorBasemap=baseLayer;
      // Attribution is required even when the MapLibre style is shown via Leaflet.
      map.attributionControl.addAttribution(BASEMAP_ATTRIBUTION);
      const vectorMap=baseLayer.getMaplibreMap?.();
      if(vectorMap){
        vectorMap.on('error',event=>{
          // Mantenha os anúncios/marcadores visíveis se o basemap falhar.
          const msg=String(event?.error?.message||'');
          if(/style|source|network|fetch|http|failed|cors|403|404/i.test(msg))
            showMapError('O mapa de fundo está indisponível no momento. Os anúncios continuam na lista; tente atualizar a página. Detalhe técnico: '+msg.slice(0,180));
        });
      }
    }catch(error){
      showMapError('Não foi possível iniciar o mapa de fundo. Os anúncios continuam disponíveis. Detalhe: '+String(error.message||error).slice(0,160));
    }
  }else{
    showMapError('O componente do mapa não carregou. Verifique sua conexão e atualize a página. Os comparáveis permanecem disponíveis na lista.');
  }
  layer=L.layerGroup().addTo(map);
  setTimeout(()=>map.invalidateSize(),200);
}else {
  showMapError('Não foi possível carregar a biblioteca do mapa. Confira a conexão e tente novamente.');
}
function reviewComparable(p) {
  const missing=[],warnings=[];
  if(p.price===null||!Number.isFinite(p.price)||p.price<=0)missing.push('Preço pedido não informado ou inválido');
  if(p.type==='unknown')missing.push('Tipo de imóvel não identificado');
  const area=['land','farm'].includes(p.type)?p.total:p.usable;
  if(area===null||!Number.isFinite(area)||area<=0)
    missing.push(['land','farm'].includes(p.type)?'Área do terreno ausente':'Área útil não informada');
  if(!p.city||p.city==='—'||!uf(p.state))missing.push('Município ou UF não confirmados');
  if(!p.link)warnings.push('Sem link público para conferência');
  if(!p.neighborhood||p.neighborhood==='—')warnings.push('Bairro não informado');
  if(!validPoint(p))warnings.push('Sem coordenadas para localizar no mapa');
  else if(p.approx)warnings.push('Localização aproximada');
  if(p.usable!==null&&p.total!==null&&p.usable>p.total)
    warnings.push('Área útil maior que a total: verificar as definições');
  if(['house','apartment','farm','penthouse'].includes(p.type)&&p.beds===null)
    warnings.push('Número de dormitórios não informado');
  return {
    status:missing.length?'insufficient':warnings.length?'review':'complete',
    issues:[...missing,...warnings],
    unitPrice:p.price>0&&area>0?p.price/area:null,
    unitAreaLabel:['land','farm'].includes(p.type)?'m² de terreno':'m² úteis'
  };
}
const qualityLabels={complete:'Dados essenciais completos',review:'Requer conferência',insufficient:'Dados insuficientes'};
const areaForLocalComparison=p=>['land','farm'].includes(p.type)?p.total:p.usable;
function duplicate(p) {
  const area=['land','farm'].includes(p.type)?p.total:p.usable;
  if(p.type==='unknown'||!p.price||!area||!p.city||!uf(p.state)||!p.neighborhood||p.neighborhood==='—')return false;
  return records.some(q => {
    const comparedArea=['land','farm'].includes(q.type)?q.total:q.usable;
    if(q.key===p.key||q.type!==p.type||!q.price||!comparedArea)return false;
    if(canon(q.city)!==canon(p.city)||uf(q.state)!==uf(p.state))return false;
    if(canon(q.neighborhood)!==canon(p.neighborhood)||p.neighborhood==='—')return false;
    if(q.beds!==null&&p.beds!==null&&q.beds!==p.beds)return false;
    const priceDiff=Math.abs(q.price-p.price)/Math.max(q.price,p.price);
    const areaDiff=Math.abs(comparedArea-area)/Math.max(comparedArea,area);
    return priceDiff<=0.02&&areaDiff<=0.03;
  });
}

// Cadastro de imóvel de referência independente de consultas à GeckoAPI.
// As faixas de aproximação são regras de triagem, NÃO coeficientes de avaliação.
let referenceProfile=null,referenceMarker=null;
const referenceTypeFamilies={
  house:'house',two_story_house:'house',condominium:'condominium',
  apartment:'apartment',flat:'apartment',kitnet:'apartment',
  land:'land',farm:'farm',penthouse:'penthouse',
  warehouse:'warehouse',commercial_room:'commercial_room',
  commercial_point:'commercial_point',other:'other'
};
const referenceLabels={
  compatible:'Aderente nos critérios conferidos',
  review:'Revisar diferenças',
  insufficient:'Comparação incompleta',
  incompatible:'Fora do recorte'
};
const referenceOrder={compatible:0,review:1,insufficient:2,incompatible:3};
function optionalReferenceNumber(raw,field,{zero=false,integer=false,max=1000000000000}={}){
  if(raw===null||raw===undefined||String(raw).trim()==='')return null;
  const str=String(raw).trim().replace(',','.');
  const value=Number(str);
  if(!Number.isFinite(value)||(zero?value<0:value<=0)||value>max||(integer&&!Number.isInteger(value)))
    throw Error(field+': informe um número válido'+(zero?' (zero permitido)':' maior que zero')+'.');
  return value;
}
function makeReference(input){
  if(!input||!Object.hasOwn(referenceTypeFamilies,input.type))throw Error('Selecione a tipologia do imóvel de referência.');
  const city=String(input.city??'').trim().slice(0,100);
  const state=uf(input.state);
  if(city.length<2||!state)throw Error('Informe município e UF brasileiros válidos para o imóvel de referência.');
  const custom=String(input.customType??'').trim().slice(0,100);
  if(input.type==='other'&&custom.length<3)throw Error('Descreva a tipologia personalizada do imóvel.');
  const coords=[input.lat,input.lng].map(v=>v===undefined||v===null||String(v).trim()===''?null:Number(String(v).trim().replace(',','.')));
  if((coords[0]===null)!==(coords[1]===null))
    throw Error('Informe latitude e longitude juntas ou deixe ambas vazias.');
  if(coords[0]!==null&&(!Number.isFinite(coords[0])||!Number.isFinite(coords[1])||Math.abs(coords[0])>90||Math.abs(coords[1])>180||(coords[0]===0&&coords[1]===0)))
    throw Error('As coordenadas do imóvel de referência são inválidas.');
  const tolerance=optionalReferenceNumber(input.tolerance??20,'Tolerância de área',{max:50});
  if(tolerance===null||tolerance<5||tolerance>50)throw Error('A tolerância de área deve ser entre 5% e 50%.');
  const radius=optionalReferenceNumber(input.radius,'Raio máximo',{max:1000});
  if(radius!==null&&coords[0]===null)throw Error('Informe coordenadas conhecidas para utilizar o raio geográfico.');
  return {
    name:String(input.name??'').trim().slice(0,120)||'Imóvel de referência',
    type:input.type,customType:custom,city,state,
    neighborhood:String(input.neighborhood??'').trim().slice(0,120),
    usable:optionalReferenceNumber(input.usable,'Área útil',{max:1000000000}),
    built:optionalReferenceNumber(input.built,'Área construída',{max:1000000000}),
    total:optionalReferenceNumber(input.total,'Área total / terreno'),
    beds:optionalReferenceNumber(input.beds,'Dormitórios',{zero:true,integer:true,max:100}),
    suites:optionalReferenceNumber(input.suites,'Suítes',{zero:true,integer:true,max:100}),
    baths:optionalReferenceNumber(input.baths,'Banheiros',{zero:true,integer:true,max:100}),
    spaces:optionalReferenceNumber(input.spaces,'Vagas',{zero:true,integer:true,max:1000}),
    lat:coords[0],lng:coords[1],radiusKm:radius,tolerance
  };
}
function assessReference(reference,p){
  if(!reference)return null;
  const missing=[],warnings=[],incompatible=[],positive=[];
  const expected=reference.type,actual=p.type;
  if(!Number.isFinite(p.price)||p.price<=0)
    missing.push('Anúncio sem preço pedido verificável.');
  if(expected==='other'){
    missing.push('Tipologia personalizada: confirmar compatibilidade manualmente.');
  }else if(actual==='unknown'||!actual){
    missing.push('Tipologia do anúncio não identificada.');
  }else if(expected!==actual){
    const sameFamily=referenceTypeFamilies[expected]===referenceTypeFamilies[actual];
    const condominiumNeedsReview=expected==='condominium'&&['house','apartment','two_story_house','flat','kitnet'].includes(actual);
    if(sameFamily||condominiumNeedsReview)
      warnings.push('Subtipo de imóvel diferente; confirmar se é equivalente.');
    else incompatible.push('Tipologia diferente do imóvel de referência.');
  }else positive.push('Tipologia correspondente');

  if(!p.city||p.city==='—'||!uf(p.state))missing.push('Município ou UF do anúncio não confirmados.');
  else if(canon(p.city)!==canon(reference.city)||uf(p.state)!==reference.state)
    incompatible.push('Anúncio em município ou UF diferente.');
  else positive.push('Município e UF correspondentes');

  const useLand=['land','farm'].includes(expected);
  const key=useLand?'total':'usable';
  const label=useLand?'área do terreno':'área útil';
  const intended=reference[key],actualArea=p[key];
  let areaDeviation=null;
  if(intended===null||intended===undefined)
    missing.push('Informe a '+label+' do imóvel de referência para comparar metragens.');
  else if(actualArea===null||!Number.isFinite(actualArea)||actualArea<=0)
    missing.push('Anúncio sem '+label+' verificável.');
  else {
    areaDeviation=100*Math.abs(actualArea-intended)/intended;
    if(areaDeviation<=reference.tolerance)positive.push('Metragem dentro da faixa configurada');
    else warnings.push('Diferença de '+Math.round(areaDeviation)+'% na '+label+' (faixa escolhida: ±'+reference.tolerance+'%).');
  }
  if(reference.built!==null&&reference.built!==undefined&&p.built!==null&&p.built!==undefined&&Number.isFinite(p.built)){
    const dev=100*Math.abs(p.built-reference.built)/reference.built;
    if(dev>reference.tolerance)warnings.push('Área construída diferente da referência.');
  }
  if(reference.neighborhood){
    if(!p.neighborhood||p.neighborhood==='—')warnings.push('Bairro do anúncio não informado.');
    else if(canon(p.neighborhood)!==canon(reference.neighborhood))
      warnings.push('Bairro diferente do imóvel de referência.');
    else positive.push('Mesmo bairro');
  }
  for(const [key,label] of [['beds','dormitórios'],['suites','suítes'],['baths','banheiros'],['spaces','vagas']]){
    if(reference[key]===null)continue;
    if(p[key]===null||!Number.isFinite(p[key]))warnings.push('Anúncio sem informação de '+label+'.');
    else if(p[key]!==reference[key])warnings.push('Quantidade de '+label+' diferente ('+p[key]+' vs. '+reference[key]+').');
    else positive.push('Quantidade de '+label+' correspondente');
  }
  let distanceKm=null;
  if(reference.radiusKm!==null){
    if(!validPoint(p))missing.push('Anúncio sem coordenadas para verificar o raio geográfico.');
    else {
      distanceKm=distance(reference,p);
      if(distanceKm>reference.radiusKm)
        warnings.push('Fora do raio escolhido ('+distanceKm.toFixed(1)+' km; máximo '+reference.radiusKm+' km).');
      else positive.push('Dentro do raio geográfico informado');
      if(p.approx)warnings.push('Coordenadas aproximadas: distância não certificada.');
    }
  }else if(reference.lat!==null&&validPoint(p)){
    distanceKm=distance(reference,p);
  }
  const status=incompatible.length?'incompatible':missing.length?'insufficient':warnings.length?'review':'compatible';
  return {status,issues:[...incompatible,...missing,...warnings],positive,areaDeviation,distanceKm};
}
function referenceTitle(reference){
  return reference.type==='other'?reference.customType:typeLabel[reference.type];
}


/*
 * INDICATIVO DE OFERTAS — não é avaliação mercadológica nem PTAM.
 * Base estatística transparente: mediana dos preços pedidos/m², projetada
 * para a área do imóvel de referência, sem "fatores" arbitrários.
 * Faixa exibida = extremos observados na amostra, NÃO intervalo de confiança.
 */
function indicatorMedian(sorted){
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
function indicatorSimilarListing(a,b){
  // Indicadores não devem contar o mesmo anúncio duas vezes. Coincidências
  // mais amplas são apenas indícios; este teste é conservador.
  if(a.source===b.source&&a.id&&b.id&&a.id===b.id)return true;
  const aLink=url(a.link),bLink=url(b.link);
  if(aLink&&bLink&&aLink===bLink)return true;
  return false;
}

function suspectedCrossPortalRepeat(a,b){
  // Apenas suspeita de mesma unidade, não prova identidade do imóvel.
  if(!a||!b||a.source===b.source||a.type==='unknown'||a.type!==b.type)return false;
  if(!a.neighborhood||a.neighborhood==='—'||!b.neighborhood||b.neighborhood==='—')return false;
  if(canon(a.city)!==canon(b.city)||uf(a.state)!==uf(b.state)||
     canon(a.neighborhood)!==canon(b.neighborhood))return false;
  const areaA=areaForLocalComparison(a),areaB=areaForLocalComparison(b);
  if(!Number.isFinite(areaA)||areaA<=0||!Number.isFinite(areaB)||areaB<=0||
     !Number.isFinite(a.price)||a.price<=0||!Number.isFinite(b.price)||b.price<=0)return false;
  for(const key of ['beds','suites','baths','spaces']){
    if(Number.isFinite(a[key])&&Number.isFinite(b[key])&&a[key]!==b[key])return false;
  }
  return Math.abs(areaA-areaB)/Math.max(areaA,areaB)<=.03&&
    Math.abs(a.price-b.price)/Math.max(a.price,b.price)<=.02;
}

function computeOfferIndicator(reference,chosen){
  const list=Array.isArray(chosen)?chosen:[];
  const base={status:'unavailable',value:null,low:null,high:null,unitMedian:null,
    area:null,areaLabel:'',included:[],excluded:[],suspectedDuplicates:[],selectedCount:list.length,
    reliability:'Não calculável',reasons:[]};
  if(!reference)return {...base,reasons:['Cadastre o imóvel de referência antes de calcular o indicativo.']};
  if(reference.type==='other')return {...base,reasons:['Tipologia personalizada: valide equivalência dos anúncios manualmente antes de estimar valores.']};
  const areaKey=['land','farm'].includes(reference.type)?'total':'usable';
  const areaLabel=areaKey==='total'?'área de terreno':'área útil / privativa';
  const area=reference[areaKey];
  if(!Number.isFinite(area)||area<=0)
    return {...base,areaLabel,reasons:['Informe a '+areaLabel+' do imóvel de referência para obter o valor preliminar.']};
  const result={...base,area,areaLabel,reasons:[]};
  // Triar até um único anúncio: mesmo sem estimativa numérica, o usuário precisa
  // enxergar se cada oferta é aproveitável, incompatível ou exige confirmação.
  for(const item of list){
    const p=item||{},label=p.title||p.id||'Anúncio sem título';
    const issue=(reason,classification='excluded')=>
      result.excluded.push({key:p.key||null,label,reason,classification,item:p});
    const purpose=inferOfferPurpose(p);
    if(purpose==='rent'){issue('Anúncio de locação: não pode compor indicativo de venda.');continue;}
    const review=assessReference(reference,p);
    if(review.status==='incompatible'){issue('Tipologia ou município incompatível.');continue;}
    if(review.status==='insufficient'){
      const foundArea=(p.textEvidence||[]).filter(x=>x.field==='area');
      issue('Dados essenciais ausentes: '+review.issues.join(' · ')+
        (foundArea.length?' · O texto menciona '+foundArea.map(x=>x.label).join(', ')+
         ', mas o tipo da área precisa ser confirmado.':''), 'pending');
      continue;
    }
    if(p.type!==reference.type){issue('Subtipos diferentes precisam de conferência antes do cálculo.','pending');continue;}
    const pArea=p[areaKey];
    if(!Number.isFinite(p.price)||p.price<=0||!Number.isFinite(pArea)||pArea<=0){
      issue('Preço pedido ou área do anúncio inválidos.','pending');continue;
    }
    if(review.areaDeviation===null||review.areaDeviation>reference.tolerance){
      issue('Metragem fora da tolerância ±'+reference.tolerance+'% definida para o imóvel.');continue;
    }
    // Divergências graves de área que podem indicar erro de mapeamento precisam
    // de revisão. Não decidir arbitrariamente qual metragem está correta.
    if(p.usable!==null&&p.total!==null&&Number.isFinite(p.usable)&&Number.isFinite(p.total)&&
       p.total>0&&p.usable>p.total){
      issue('Área útil maior que a área total reportada; confirmar definições/valor de origem antes do cálculo.','pending');
      continue;
    }
    if(result.included.some(other=>indicatorSimilarListing(p,other.item))){
      issue('Mesmo anúncio encontrado mais de uma vez.');continue;
    }
    const likelyRepeated=result.included.find(other=>suspectedCrossPortalRepeat(p,other.item));
    if(likelyRepeated){
      result.suspectedDuplicates.push({key:p.key,otherKey:likelyRepeated.key});
      issue('Possível duplicidade com outra fonte ('+likelyRepeated.item.source+'). Excluído preventivamente do indicativo até conferência manual.','pending');continue;
    }
    result.included.push({item:p,key:p.key||null,label,area:pArea,ask:p.price,
      unit:p.price/pArea,normalized:(p.price/pArea)*area,
      warnings:review.issues.slice(0,5)});
  }
  if(result.included.length<2){
    result.reasons.push(!list.length?
      'Selecione pelo menos dois anúncios para calcular o indicativo. Novas importações entram automaticamente na triagem por padrão.':
      'Apenas '+result.included.length+' anúncio(s) da amostra passaram pelos requisitos. É necessário ter ao menos dois para mostrar um indicativo.');
    return result;
  }
  const units=result.included.map(x=>x.unit).sort((a,b)=>a-b);
  result.unitMedian=indicatorMedian(units);
  result.value=result.unitMedian*area;
  result.low=units[0]*area;
  result.high=units.at(-1)*area;
  result.status='ready';
  result.reliability=result.included.length<5?'Baixa — amostra pequena':'Limitada — dados de oferta sem homogeneização';
  if(result.included.length<5)
    result.reasons.push('Somente '+result.included.length+' anúncios válidos; a amostra é pequena.');
  if(result.included.some(x=>x.warnings.length))
    result.reasons.push('Os anúncios apresentam diferenças de características que não foram ajustadas matematicamente.');
  if(result.included.some(x=>inferOfferPurpose(x.item)==='unknown'))
    result.reasons.push('A finalidade de venda não foi confirmada em todos os anúncios; confira os links de origem.');
  const spread=(units.at(-1)-units[0])/result.unitMedian;
  if(spread>0.3)result.reasons.push('Dispersão dos preços por m² superior a 30% da mediana.');
  if(result.excluded.length)
    result.reasons.push(result.excluded.length+' anúncio(s) selecionado(s) não entraram no cálculo.');
  if(result.suspectedDuplicates.length)
    result.reasons.push('Possíveis anúncios repetidos em portais diferentes não foram contados em duplicidade. A semelhança não prova que sejam o mesmo imóvel; a conferência pode alterar a amostra.');
  result.reasons.push('Preços pedidos não equivalem a valores efetivos de transação.');
  return result;
}


// Conferência assistida: somente campos numéricos revisáveis. Não altera cidade,
// tipologia ou URL; esses campos exigem outras fontes e fluxos de verificação.
const REVIEW_FIELDS={
  price:{label:'Preço anunciado',min:0.01,max:1e12,integer:false},
  usable:{label:'Área útil/privativa',min:0.01,max:1e9,integer:false},
  total:{label:'Área total/terreno',min:0.01,max:1e12,integer:false},
  beds:{label:'Dormitórios',min:0,max:100,integer:true},
  suites:{label:'Suítes',min:0,max:100,integer:true},
  baths:{label:'Banheiros',min:0,max:100,integer:true},
  spaces:{label:'Vagas',min:0,max:1000,integer:true}
};
const REVIEW_SOURCES=new Set(['listing','title','description','document','contact']);

const REVIEW_STATE_LABELS={
  unread:'○ Não visualizado',viewed:'◉ Visualizado, sem confirmar',
  confirmed:'✓ Conferido sem alterações',edited:'✓ Dados corrigidos',
  imported:'◈ Conferência importada (não autenticada)'
};
const REVIEW_LOCAL_KEY='imovel-busca.revisoes-local-v1';
function reviewState(p){
  if(!p)return 'unread';
  if(p.reviewImported&&(p.reviewHistory?.length||p.reviewConfirmation))return 'imported';
  if(p.reviewConfirmation)
    return Object.keys(p.manualOverrides||{}).some(f=>p.manualOverrides[f])?'edited':'confirmed';
  // O histórico pode conter uma restauração: correções antigas não tornam
  // o valor atual "corrigido" depois que tudo voltou ao original.
  return p.viewedAt?'viewed':'unread';
}
function reviewBadge(p){
  const state=reviewState(p);
  return '<span class="review-state '+state+'">'+safe(REVIEW_STATE_LABELS[state])+'</span>';
}
function validateReviewConfirmation(o){
  if(!o||!REVIEW_SOURCES.has(o.source)||typeof o.note!=='string'||
     o.note.trim().length<12||o.note.length>700||
     typeof o.at!=='string'||!/^\d{4}-\d\d-\d\dT/.test(o.at))return null;
  return {source:o.source,note:o.note,at:o.at,
    changes:Number.isInteger(o.changes)?o.changes:0,
    evidenceLevel:'declaração local sem autenticação profissional'};
}
function validatedReviewEntries(data){
  if(!Array.isArray(data))return [];
  const entries=[];
  for(const e of data.slice(-60)){
    if(!e||typeof e!=='object'||typeof e.note!=='string'||e.note.length>700||
       typeof e.at!=='string'||!/^\d{4}-\d\d-\d\dT/.test(e.at)||
       !['listing','title','description','document','contact','restore'].includes(e.source))continue;
    if(e.field==='verification'){
      entries.push({field:'verification',oldValue:null,newValue:null,source:e.source,
        note:e.note,at:e.at,evidenceLevel:'declaração local sem autenticação'});
      continue;
    }
    if(!Object.hasOwn(REVIEW_FIELDS,e.field))continue;
    try{
      entries.push({field:e.field,oldValue:reviewFieldNumber(e.oldValue,e.field),
        newValue:reviewFieldNumber(e.newValue,e.field),source:e.source,
        note:e.note,at:e.at,evidenceLevel:'declaração local sem autenticação'});
    }catch{/* Ignorar campos inválidos de dados locais ou importados. */}
  }
  return entries;
}
function browserReviewKey(p){
  return [p.source,p.id,p.link||'',canon(p.city),uf(p.state)].join('|');
}
function readSavedReviews(){
  try{
    const raw=window.localStorage?.getItem(REVIEW_LOCAL_KEY);
    if(!raw||raw.length>2500000)return {};
    const obj=JSON.parse(raw);
    return obj?.version===1&&obj.entries&&typeof obj.entries==='object'&&!Array.isArray(obj.entries)?obj.entries:{};
  }catch{return {};}
}
function saveBrowserReview(p){
  try{
    const storage=window.localStorage;
    if(!storage)return false;
    const entries=readSavedReviews();
    const key=browserReviewKey(p);
    delete entries[key];
    const values={};
    for(const field of Object.keys(REVIEW_FIELDS))
      if(p.manualOverrides?.[field])values[field]=p[field]??null;
    entries[key]={
      source:p.source,id:p.id,link:p.link||'',city:p.city,state:p.state,
      viewedAt:p.viewedAt||null,
      reviewConfirmation:p.reviewConfirmation||null,
      reviewHistory:(p.reviewHistory||[]).slice(-60),
      providerSnapshot:p.providerSnapshot||null,
      manualOverrides:p.manualOverrides||{},values,
      reviewImported:Boolean(p.reviewImported)
    };
    const keys=Object.keys(entries);
    for(const old of keys.slice(0,Math.max(0,keys.length-600)))delete entries[old];
    storage.setItem(REVIEW_LOCAL_KEY,JSON.stringify({version:1,entries}));
    return true;
  }catch{return false;}
}
function restoreBrowserReview(p){
  try{
    const e=readSavedReviews()[browserReviewKey(p)];
    if(!e||e.source!==p.source||String(e.id)!==String(p.id)||
      e.city!==p.city||uf(e.state)!==uf(p.state)||(e.link||'')!==(p.link||''))return p;
    const out={...p,viewedAt:typeof e.viewedAt==='string'?e.viewedAt:null,
      reviewHistory:validatedReviewEntries(e.reviewHistory),
      reviewConfirmation:validateReviewConfirmation(e.reviewConfirmation),
      reviewImported:Boolean(e.reviewImported),manualOverrides:{}};
    if(e.providerSnapshot&&typeof e.providerSnapshot==='object'){
      out.providerSnapshot=Object.fromEntries(Object.keys(REVIEW_FIELDS).map(field=>
        [field,reviewFieldNumber(e.providerSnapshot[field],field)]));
      for(const field of Object.keys(REVIEW_FIELDS)){
        if(e.manualOverrides?.[field]===true){
          out[field]=reviewFieldNumber(e.values?.[field],field);
          out.manualOverrides[field]=true;
        }
      }
    }
    return out;
  }catch{return p;}
}

let activeReviewKey=null;
let reviewReturnSource='eligibility';
function showReviewError(message){
  const box=$('review-action-error');
  box.textContent=message;
  box.classList.toggle('hidden',!message);
}
function showSavedReviewNotice(message,origin='eligibility'){
  const toast=$('review-saved');
  toast.textContent=message;
  toast.classList.remove('hidden');
  const section=origin==='cards'?'results':'eligibility-panel';
  $(section)?.scrollIntoView?.({behavior:'smooth',block:'start'});
}

function reviewFieldNumber(raw,field){
  const v=REVIEW_FIELDS[field];
  if(!v)throw Error('Campo de conferência não permitido.');
  if(raw===null||raw===undefined||String(raw).trim()==='')return null;
  const str=String(raw).trim();
  if(!/^\d+(?:[.,]\d+)?$/.test(str))throw Error(v.label+': informe um número válido.');
  const value=Number(str.replace(',','.'));
  if(!Number.isFinite(value)||value<v.min||value>v.max||(v.integer&&!Number.isInteger(value)))
    throw Error(v.label+': valor fora do intervalo permitido.');
  return value;
}
function suggestedByText(p,field,value,origin){
  const candidates=(p.textEvidence||[]).filter(e=>
    e.origin===(origin==='title'?'título':'descrição')&&Number(e.value)===value);
  if(field==='usable')return candidates.some(e=>e.field==='area'&&e.kind==='útil/privativa');
  if(field==='total')return candidates.some(e=>e.field==='area'&&e.kind==='terreno/total');
  if(field==='price')return false;
  return candidates.some(e=>e.field===field);
}
function applyReviewChanges(p,form,source,note,at=new Date().toISOString()){
  if(!p||!p.key)throw Error('Anúncio de conferência inválido.');
  if(!REVIEW_SOURCES.has(source))throw Error('Escolha a origem da evidência que fundamenta a correção.');
  const reason=String(note||'').trim();
  if(reason.length<12||reason.length>700)
    throw Error('Explique o que foi conferido (mínimo de 12 e máximo de 700 caracteres).');
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:/.test(at))
    throw Error('Data de conferência inválida.');
  const changes=[];
  for(const field of Object.keys(REVIEW_FIELDS)){
    const value=reviewFieldNumber(form?.[field],field);
    const prev=p[field]??null;
    if(value===prev)continue;
    if(source==='title'||source==='description'){
      if(value===null||!suggestedByText(p,field,value,source)){
        throw Error(REVIEW_FIELDS[field].label+
          ': o texto não identifica explicitamente esse dado. Confira a ficha do anúncio, documentação ou anunciante.');
      }
    }
    changes.push({field,oldValue:prev,newValue:value,source,note:reason,at,
      evidenceLevel:'declaração do operador, sem autenticação'});
  }
  // Conferir sem alterar valores é um resultado válido, desde que documentado.
  if(!changes.length)changes.push({
    field:'verification',oldValue:null,newValue:null,source,note:reason,at,
    evidenceLevel:'declaração do operador, sem autenticação'
  });
  const snapshot=p.providerSnapshot&&typeof p.providerSnapshot==='object'?
    {...p.providerSnapshot}:Object.fromEntries(Object.keys(REVIEW_FIELDS).map(field=>[field,p[field]??null]));
  const overrides={...(p.manualOverrides||{})};
  const result={...p,providerSnapshot:snapshot,
    reviewHistory:[...(p.reviewHistory||[]),...changes].slice(-100),
    reviewConfirmation:{source,note:reason,at,
      changes:changes.filter(x=>x.field!=='verification').length,
      evidenceLevel:'declaração do operador, sem autenticação'},
    viewedAt:p.viewedAt||at,reviewImported:false};
  for(const change of changes){
    if(change.field==='verification')continue;
    result[change.field]=change.newValue;
    overrides[change.field]=true;
  }
  result.manualOverrides=overrides;
  return result;
}
function restoreProviderFields(p,at=new Date().toISOString()){
  if(!p?.providerSnapshot)return p;
  const audit=[];
  const result={...p};
  for(const field of Object.keys(REVIEW_FIELDS)){
    const original=p.providerSnapshot[field]??null;
    if(original!==p[field]){
      audit.push({field,oldValue:p[field]??null,newValue:original,source:'restore',
        note:'Restauração dos valores da fonte capturados antes da primeira correção.',
        at,evidenceLevel:'ação local sem autenticação'});
    }
    result[field]=original;
  }
  result.manualOverrides={};
  result.reviewConfirmation=null;
  result.reviewHistory=[...(p.reviewHistory||[]),...audit].slice(-100);
  result.reviewImported=false;
  return result;
}
function parseImportedHistory(raw){
  if(typeof raw!=='string'||raw.length>20000)return [];
  try{return validatedReviewEntries(JSON.parse(raw)).map(x=>({
    ...x,evidenceLevel:'histórico importado do CSV, não autenticado'
  }));}catch{return [];}
}
function reviewTarget(){
  return records.find(x=>x.key===activeReviewKey)||null;
}
function openReview(key,origin='eligibility'){
  const p=records.find(x=>x.key===key);
  if(!p){report('Este anúncio não está mais na sessão.',true);return;}
  activeReviewKey=p.key;
  reviewReturnSource=origin;
  if(!p.viewedAt){p.viewedAt=new Date().toISOString();saveBrowserReview(p);}
  $('review-saved').classList.add('hidden');
  showReviewError('');
  refresh();
  const panel=$('review-panel');
  panel.classList.remove('hidden');
  $('review-target').textContent=p.title+' · '+p.source+' · '+p.city+'/'+p.state;
  const evidence=(p.textEvidence||[]).slice(0,12);
  const original=p.providerSnapshot;
  $('review-evidence').innerHTML='<strong>Informações encontradas no texto:</strong>'+
    (evidence.length?'<div>'+evidence.map(e=>safe(e.label)+' — '+safe(e.origin)).join(' · ')+'</div>':
      '<div>Nenhum atributo numérico explícito no título/descrição.</div>')+
    (original?'<div><strong>Valores fornecidos originalmente pelo portal:</strong> '+
      Object.keys(REVIEW_FIELDS).map(field=>safe(REVIEW_FIELDS[field].label)+': '+
        safe(original[field]??'não informado')).join(' · ')+'</div>':'')+
    (p.link?'<div><a href="'+safe(p.link)+'" rel="noopener noreferrer" target="_blank">Abrir anúncio para conferir ↗</a></div>':'');
  $('review-history').textContent=(p.reviewHistory?.length||0)+' alteração(ões) registradas nesta sessão ou arquivo.'+
    (p.reviewImported?' Histórico importado: autoria e autenticidade não confirmadas.':'')+
    (Object.keys(p.providerConflicts||{}).length?
      ' Atenção: a fonte voltou a informar valores diferentes dos dados revisados.':'');
  for(const field of Object.keys(REVIEW_FIELDS))
    $('review-'+field).value=p[field]===null||p[field]===undefined?'':String(p[field]);
  $('review-source').value='';
  $('review-note').value='';
  panel.scrollIntoView?.({behavior:'smooth',block:'start'});
}
function closeReview(){
  activeReviewKey=null;
  $('review-panel').classList.add('hidden');
}
$('review-close').onclick=closeReview;
$('review-save').onclick=()=>{
  try{
    showReviewError('');
    const prior=reviewTarget();
    if(!prior)throw Error('Escolha um anúncio para conferir.');
    const input=Object.fromEntries(Object.keys(REVIEW_FIELDS).map(f=>[f,$('review-'+f).value]));
    const corrected=applyReviewChanges(prior,input,$('review-source').value,$('review-note').value);
    const index=records.findIndex(x=>x.key===prior.key);
    if(index<0)throw Error('O anúncio não foi encontrado na sessão.');
    records[index]=corrected;
    const saved=saveBrowserReview(corrected);
    const status=reviewState(corrected);
    const origin=reviewReturnSource;
    closeReview();
    refresh();
    showSavedReviewNotice(
      (status==='edited'?'✓ Dados corrigidos e conferência registrada: ':'✓ Anúncio conferido sem alterações: ')+
      corrected.title+'. A triagem e o indicativo foram recalculados. '+
      (saved?'Revisão guardada neste navegador.':'Atenção: o navegador não permitiu guardar a revisão; exporte o CSV antes de sair.'),
      origin
    );
    report('Conferência salva. O anúncio foi marcado na lista; dados revisados continuam sujeitos à validação profissional.');
  }catch(error){
    const message=error?.message||'Não foi possível salvar a conferência.';
    showReviewError(message);
    $('review-action-error')?.scrollIntoView?.({behavior:'smooth',block:'center'});
    report(message,true);
  }
};
$('review-reset').onclick=()=>{
  try{
    const prior=reviewTarget();
    if(!prior?.providerSnapshot)throw Error('Este anúncio ainda não possui correções locais para restaurar.');
    if(window.confirm?.('Restaurar os valores originais deste anúncio e registrar a restauração?')===false)return;
    const index=records.findIndex(x=>x.key===prior.key);
    const original=restoreProviderFields(prior);
    records[index]=original;
    const saved=saveBrowserReview(original);
    const origin=reviewReturnSource;
    closeReview();
    refresh();
    showSavedReviewNotice('Valores originais restaurados: '+original.title+
      '. A restauração foi registrada.'+(saved?'':' Não foi possível guardar no navegador; exporte CSV.'),origin);
    report('Restauração concluída. Indicativo atualizado.');
  }catch(error){report(error.message,true);}
};

let eligibilityLimit=25;
const eligibilityNames={included:'Aproveitado',pending:'Conferência necessária',excluded:'Excluído pelo critério'};
function summarizeEligibility(stats,chosen){
  const rows=[
    ...stats.included.map(x=>({key:x.key,item:x.item,label:x.label,
      classification:'included',reason:'Passou pelo tipo, município, preço e metragem verificados.'+
      (x.warnings?.length?' Diferenças sem ajuste: '+x.warnings.slice(0,2).join(' · '):'')})),
    ...stats.excluded.map(x=>({...x,classification:x.classification||'excluded'}))
  ];
  const completed=new Set(rows.map(x=>x.key));
  for(const p of chosen){
    if(!completed.has(p.key))
      rows.push({key:p.key,item:p,label:p.title||p.id||'Anúncio',
        classification:'pending',reason:'Cadastre a referência completa para iniciar a triagem.'});
  }
  const counts={included:0,pending:0,excluded:0};
  for(const r of rows)counts[r.classification]++;
  return {rows,counts,total:chosen.length};
}
function renderEligibility(stats,chosen){
  const summary=$('eligibility-summary'),overview=$('eligibility-overview'),list=$('eligibility-list');
  if(!overview||!list)return;
  const {rows,counts,total}=summarizeEligibility(stats,chosen);
  summary.textContent=total+' anúncio(s) na triagem automática';
  overview.innerHTML=[
    ['included','Usados no indicativo'],
    ['pending','Para confirmar dados'],
    ['excluded','Fora do cálculo']
  ].map(([key,label])=>'<div class="eligibility-metric '+key+'"><strong>'+counts[key]+'</strong><small>'+label+'</small></div>').join('');
  const filter=$('eligibility-filter').value||'all';
  const filtered=filter==='all'?rows:rows.filter(r=>r.classification===filter);
  const batch=filtered.slice(0,eligibilityLimit);
  $('eligibility-visible-count').textContent='Mostrando '+batch.length+' de '+filtered.length+' anúncio(s)';
  list.innerHTML=batch.length?batch.map(row=>{
    const link=url(row.item?.link);
    const title='<strong>'+safe(row.label)+'</strong>';
    return '<div class="eligibility-line"><div>'+title+
      '<p>'+safe(row.item?.source||'Origem não informada')+
      (Number.isFinite(row.item?.price)?' · '+safe(money(row.item.price)):'')+
      '</p></div><span class="status '+row.classification+'">'+eligibilityNames[row.classification]+'</span>'+
      '<div class="reason"><strong>Motivo:</strong> '+safe(row.reason)+
      (link?' · <a class="link" href="'+safe(link)+'" target="_blank" rel="noopener noreferrer">Ver anúncio original ↗</a>':'')+
      ' · <button type="button" class="review-from-eligibility review-verify" data-review-key="'+
      safe(encodeURIComponent(row.key))+'">Conferir dados</button></div></div>';
  }).join(''):'<p class="hint">Nenhum anúncio nesta categoria.</p>';
  const more=$('eligibility-more');
  more.classList.toggle('hidden',filtered.length<=eligibilityLimit);
  list.querySelectorAll?.('.review-from-eligibility').forEach(button=>{
    button.onclick=()=>openReview(decodeURIComponent(button.dataset.reviewKey||''));
  });
}
$('eligibility-filter').addEventListener('change',()=>{
  eligibilityLimit=25;renderOfferIndicator();
});
$('eligibility-more').onclick=()=>{
  eligibilityLimit+=25;renderOfferIndicator();
};

function renderOfferIndicator(){
  const host=$('offer-indicator');
  if(!host)return;
  const chosen=records.filter(p=>selected.has(p.key));
  const stats=computeOfferIndicator(referenceProfile,chosen);
  renderEligibility(stats,chosen);
  if(stats.status!=='ready'){
    host.innerHTML='<div class="offer-empty"><div class="offer-kicker">Indicativo preliminar na tela</div>'+
      '<h3>Aguardando dados para estimar</h3><p>'+safe(stats.reasons.join(' '))+'</p>'+
      (stats.excluded.length?'<p class="offer-note">Veja a lista completa de exclusões e pendências na seção Limpeza automática acima.</p>':'')+
      '<p class="offer-note">Não é necessário exportar CSV para obter um resultado.</p></div>';
    return;
  }
  const approx=value=>money(Math.round(value/1000)*1000);
  const warnings=stats.reasons.map(reason=>'<li>'+safe(reason)+'</li>').join('');
  host.innerHTML=
    '<div class="offer-kicker">Indicativo preliminar · preços anunciados</div>'+
    '<div class="offer-value">'+safe(approx(stats.value))+'</div>'+
    '<div class="offer-subtitle">Mediana de '+stats.included.length+' anúncios equivalentes em tipologia, município e faixa de metragem.</div>'+
    '<div class="offer-band"><div><small>Menor projeção observada</small><strong>'+safe(approx(stats.low))+'</strong></div>'+
      '<div><small>Maior projeção observada</small><strong>'+safe(approx(stats.high))+'</strong></div></div>'+
    '<div class="offer-meta"><span class="pill quality-warn">Confiabilidade: '+safe(stats.reliability)+'</span>'+
      '<span>'+stats.selectedCount+' selecionados · '+stats.excluded.length+' excluídos do cálculo</span></div>'+
    '<ul class="offer-warnings">'+warnings+'</ul>'+
    '<details class="offer-details"><summary>Como este número foi calculado</summary>'+
      '<p>Mediana dos preços <strong>anunciados</strong> por m² × '+safe(stats.area)+
      ' m² de '+safe(stats.areaLabel)+'. Mediana: '+safe(money(stats.unitMedian))+'/m².'+
      ' A faixa é o menor e o maior preço por m² observados, projetados para a mesma área; '+
      '<strong>não é intervalo de confiança nem aplicação de ajustes por fatores</strong>.</p>'+
      '<div class="table-scroll"><table><thead><tr><th>Anúncio</th><th>Preço pedido</th><th>Área</th><th>Preço/m²</th><th>Projeção</th></tr></thead><tbody>'+
      stats.included.map(x=>'<tr><td>'+safe(x.label)+'</td><td>'+safe(money(x.ask))+'</td>'+
        '<td>'+safe(x.area)+' m²</td><td>'+safe(money(x.unit))+'</td><td>'+safe(approx(x.normalized))+'</td></tr>').join('')+
      '</tbody></table></div>'+
      (stats.excluded.length?'<p><strong>Fora do cálculo:</strong> '+stats.excluded.length+
        ' anúncios. Consulte os motivos individualmente na seção Limpeza automática acima.</p>':'')+
    '</details>'+
    '<p class="offer-disclaimer">Isto é um <strong>indicador de ofertas comparáveis</strong>, não um valor de avaliação tecnicamente validado, laudo ou PTAM. O preço pode mudar após verificar características, transações e metodologia.</p>';
}

function guideAdvice(reference,items,chosen){
  const label=reference&&['land','farm'].includes(reference.type)?'área do terreno':'área útil / privativa';
  const area=reference?(['land','farm'].includes(reference.type)?reference.total:reference.usable):null;
  if(!reference)return {level:'important',message:'Primeiro, descreva o imóvel que deseja analisar na etapa 1 e clique em Salvar meu imóvel.'};
  if(area===null)return {level:'important',message:'Falta um dado essencial: informe a '+label+' de '+reference.name+'. Sem essa metragem, nenhum anúncio poderá ter o tamanho comparado com segurança. Volte à etapa 1, preencha o campo e salve novamente.'};
  if(!items.length)return {level:'normal',message:'Imóvel cadastrado. Agora importe um CSV de anúncios na etapa 2. O arquivo será lido no navegador, sem gastar créditos.'};
  if(!chosen.length)return {level:'normal',message:'Agora escolha pelo menos dois anúncios marcando a opção Comparar em cada imóvel da lista abaixo.'};
  if(chosen.length===1)return {level:'normal',message:'Você já escolheu um anúncio. Selecione pelo menos mais um para confrontar preços pedidos e características.'};
  const reviewed=chosen.map(p=>assessReference(reference,p));
  const missing=reviewed.filter(x=>x.status==='insufficient').length;
  const incompatible=reviewed.filter(x=>x.status==='incompatible').length;
  if(incompatible)return {level:'important',message:'Você selecionou '+chosen.length+' anúncios, mas '+incompatible+' estão fora do recorte de tipologia ou município. Considere substituí-los antes de aprofundar a comparação.'};
  if(missing)return {level:'important',message:'Você selecionou '+chosen.length+' anúncios. Em '+missing+' faltam dados para conferir a semelhança. Veja os motivos abaixo; mantenha apenas os anúncios que puder verificar.'};
  return {level:'normal',message:'Você selecionou '+chosen.length+' anúncios. Confira o indicativo preliminar acima, veja as diferenças abaixo e valide os links originais antes de usar os dados numa avaliação.'};
}
function renderGuidedSummary(){
  const el=$('guided-summary');
  if(!el)return;
  const items=records.filter(p=>selected.has(p.key));
  const advice=guideAdvice(referenceProfile,records,items);
  let html='<div class="guide-next'+(advice.level==='important'?' important':'')+'"><strong>Próximo passo:</strong> '+safe(advice.message)+
    (referenceProfile?'<div style="margin-top:8px"><a href="#reference-panel">Revisar dados do meu imóvel ↑</a></div>':'')+'</div>';
  if(items.length){
    html+='<div class="guide-meta">Anúncios escolhidos ('+items.length+'). Valores abaixo são <strong>preços anunciados</strong>, não preços de venda ou avaliações.</div>';
    for(const p of items.slice(0,12)){
      const outcome=referenceProfile?assessReference(referenceProfile,p):null;
      const review=reviewComparable(p);
      const issues=outcome?.issues??['Cadastre o imóvel de referência para comparar características.'];
      const area=areaForLocalComparison(p);
      const label=['land','farm'].includes(p.type)?'m² de terreno':'m² úteis';
      html+='<div class="guide-row"><div><div class="guide-name">'+safe(p.title)+'</div>'+
        '<div class="guide-meta">'+safe(typeLabel[p.type]||'Imóvel')+' · '+safe(p.neighborhood)+' · '+safe(p.city)+
        (area!==null?' · '+safe(area)+' '+label:' · sem metragem confirmada')+'</div>'+
        (outcome?'<div style="margin-top:7px"><span class="pill '+(outcome.status==='compatible'?'quality-ok':outcome.status==='review'?'quality-warn':'quality-missing')+'">'+
           safe(referenceLabels[outcome.status])+'</span></div>':'')+
        (issues.length?'<p class="guide-reason"><strong>Conferir:</strong> '+safe(issues.slice(0,3).join(' · '))+(issues.length>3?' · outros pontos na tabela completa':'')+'</p>':'<p class="guide-reason">Nenhuma diferença identificada nos campos disponíveis. Ainda confirme o anúncio e a conservação do imóvel.</p>')+
        (review.status==='insufficient'?'<p class="guide-reason">O anúncio também tem dados essenciais ausentes.</p>':'')+
        '</div><div class="guide-price">'+safe(money(p.price))+
        (review.unitPrice!==null?'<div class="guide-meta">'+safe(money(review.unitPrice))+' / '+label+'</div>':'')+
        '</div></div>';
    }
  }
  if(items.length>12)html+='<p class="hint">Exibindo um resumo de 12 dos '+items.length+
    ' anúncios selecionados. O indicativo considera todos os elegíveis.</p>';
  html+='<p class="hint"><strong>Importante:</strong> este resultado serve para escolher e conferir comparáveis. O indicador acima utiliza somente preços anunciados por m², sem ajustes técnicos de características. Não representa valor de mercado concluído, preço negociado ou PTAM.</p>';
  el.innerHTML=html;
}

function readReferenceFields(){
  const keys={name:'ref-name',type:'ref-type',customType:'ref-custom-type',
    city:'ref-city',state:'ref-state',neighborhood:'ref-neighborhood',
    usable:'ref-usable',built:'ref-built',total:'ref-total',
    beds:'ref-beds',suites:'ref-suites',baths:'ref-baths',spaces:'ref-spaces',
    lat:'ref-lat',lng:'ref-lng',radius:'ref-radius',tolerance:'ref-tolerance'};
  return Object.fromEntries(Object.entries(keys).map(([key,id])=>[key,$(id).value]));
}
function syncReferenceFields(){
  const type=$('ref-type').value;
  $('ref-custom-wrap').classList.toggle('hidden',type!=='other');
  const isLand=['land','farm'].includes(type);
  const primaryArea=isLand?'área do terreno':'área útil / privativa';
  $('ref-area-hint').textContent='Campo principal para '+(typeLabel[type]||'o imóvel selecionado')+': '+primaryArea+
    ' (m²). Sem esta metragem não é possível avaliar a semelhança de tamanho. Área construída não substitui área útil.';
  const useful=$('ref-usable'),total=$('ref-total');
  useful.classList.toggle('main-area-required',!isLand&&type!==''&&!useful.value.trim());
  total.classList.toggle('main-area-required',isLand&&!total.value.trim());
}
function showReference(){
  const summary=$('ref-summary'),filter=$('reference-filter'),sort=$('reference-sort');
  filter.disabled=!referenceProfile;sort.disabled=!referenceProfile;
  if(!referenceProfile){
    filter.value='';sort.value='';
    summary.textContent='Ainda não há imóvel cadastrado. Informe tipo, cidade, UF e a metragem principal para começar.';
    $('reference-stats').textContent='Cadastre a referência para comparar cada anúncio ao seu recorte.';
    return;
  }
  const r=referenceProfile;
  const isLand=['land','farm'].includes(r.type);
  const missingMain=(isLand?r.total:r.usable)===null;
  summary.className=missingMain?'reference-warning':'';
  summary.textContent=(missingMain?'⚠️ Falta a '+(isLand?'área do terreno':'área útil / privativa')+' para comparar. Preencha acima e salve novamente. · ':'Imóvel cadastrado · ')+
    r.name+' · '+referenceTitle(r)+' · '+r.city+'/'+r.state+
    (r.neighborhood?' · '+r.neighborhood:'')+
    ' · '+(r.type==='land'||r.type==='farm'?'Terreno: '+(r.total??'não informado'):'Área útil: '+(r.usable??'não informada'))+' m²'+
    ' · tolerância: ±'+r.tolerance+'%.';
}
$('reference-save').onclick=()=>{
  try{
    referenceProfile=makeReference(readReferenceFields());
    showReference();syncReferenceFields();
    // Exibir a referência mesmo quando estiver fora da cidade padrão do mapa.
    if(map&&referenceProfile.lat!==null)map.setView([referenceProfile.lat,referenceProfile.lng],12);
    drawMap(false);refresh();
    const essential=['land','farm'].includes(referenceProfile.type)?referenceProfile.total:referenceProfile.usable;
    report(essential===null?'Imóvel salvo parcialmente: informe a metragem principal para que o sistema consiga comparar as áreas.':
      'Imóvel salvo. Agora importe anúncios e escolha quais deseja comparar; isto ainda não é uma avaliação de mercado.',essential===null);
  }catch(e){report(e.message||'Dados inválidos do imóvel de referência.',true);}
};
$('reference-clear').onclick=()=>{
  referenceProfile=null;
  showReference();drawMap(false);refresh();
  report('Imóvel de referência removido. Anúncios e seleção foram preservados.');
};
$('ref-type').addEventListener('change',syncReferenceFields);
for(const id of ['ref-usable','ref-total'])$(id).addEventListener('input',syncReferenceFields);
syncReferenceFields();
showReference();

const valueOf = id => {const v=$(id).value.trim();return v===''?null:Number(v);};
function visibleRecords(){
  const minBeds=Number($('min-beds').value)||0;
  const type=$('result-type').value,neigh=canon($('filter-neighborhood').value.trim());
  const pMin=valueOf('filter-price-min'),pMax=valueOf('filter-price-max');
  const aMin=valueOf('filter-area-min'),aMax=valueOf('filter-area-max');
  const minBaths=valueOf('filter-bathrooms-min'),minSpaces=valueOf('filter-parking-min');
  const onlyRadius=$('in-radius').checked,km=Number($('radius').value);
  const qualityFilter=$('quality-filter').value;
  const referenceFilter=referenceProfile?$('reference-filter').value:'';
  const sortReference=referenceProfile&&$('reference-sort').value==='affinity';
  const matching=records.filter(p=>{
    if(activeLocation&&(canon(p.city)!==activeLocation.city||canon(p.state)!==activeLocation.state))return false;
    if(type&&p.type!==type)return false;
    if(qualityFilter&&reviewComparable(p).status!==qualityFilter)return false;
    if(referenceFilter&&assessReference(referenceProfile,p).status!==referenceFilter)return false;
    if(neigh&&!canon(p.neighborhood).includes(neigh))return false;
    if(minBeds&&(p.beds===null||p.beds<minBeds))return false;
    if(minBaths!==null&&(p.baths===null||p.baths<minBaths))return false;
    if(minSpaces!==null&&(p.spaces===null||p.spaces<minSpaces))return false;
    if(pMin!==null&&(p.price===null||p.price<pMin))return false;
    if(pMax!==null&&(p.price===null||p.price>pMax))return false;
    if(aMin!==null&&(areaForLocalComparison(p)===null||areaForLocalComparison(p)<aMin))return false;
    if(aMax!==null&&(areaForLocalComparison(p)===null||areaForLocalComparison(p)>aMax))return false;
    if(onlyRadius&&(!validPoint(p)||distance(center,p)>km))return false;
    return true;
  });
  return sortReference?matching.sort((a,b)=>{
    const ra=assessReference(referenceProfile,a),rb=assessReference(referenceProfile,b);
    return referenceOrder[ra.status]-referenceOrder[rb.status]||
      ra.issues.length-rb.issues.length||a.title.localeCompare(b.title,'pt-BR');
  }):matching;
}
const pinIcon=(label,klass='')=>L.divIcon({html:'<span class="pin '+klass+'">'+safe(label)+'</span>',className:'',iconSize:[30,30],iconAnchor:[15,15]});
function renderMarkers(){
  if(!map||!layer)return;
  layer.clearLayers();
  for(const p of visibleRecords().filter(validPoint)){
    const marker=L.marker([p.lat,p.lng],{icon:pinIcon(String(records.indexOf(p)+1),p.approx?'approx':'')}).addTo(layer);
    marker.bindPopup('<strong>'+safe(p.title)+'</strong><div>'+safe(money(p.price))+'</div><small>'+safe(typeLabel[p.type]||'Tipo a revisar')+'</small>');
  }
}
function drawMap(recenter=false){
  if(!map)return;
  if(ring){map.removeLayer(ring);ring=null;}
  if(anchor){map.removeLayer(anchor);anchor=null;}
  if(referenceMarker){map.removeLayer(referenceMarker);referenceMarker=null;}
  if(referenceProfile&&referenceProfile.lat!==null){
    referenceMarker=L.marker([referenceProfile.lat,referenceProfile.lng],{icon:pinIcon('R','reference')}).addTo(map);
    referenceMarker.bindPopup('<strong>Imóvel de referência</strong><div>'+safe(referenceProfile.name)+'</div><small>'+
      safe(referenceTitle(referenceProfile))+' · coordenada declarada pelo usuário</small>');
  }
  const located=records.filter(validPoint);
  if((!center||recenter)&&located.length)center={lat:located.reduce((sum,p)=>sum+p.lat,0)/located.length,lng:located.reduce((sum,p)=>sum+p.lng,0)/located.length};
  if(center){
    ring=L.circle([center.lat,center.lng],{radius:Number($('radius').value)*1000,color:'#e95335',weight:2,fillOpacity:.06,dashArray:'7 5'}).addTo(map);
    anchor=L.marker([center.lat,center.lng],{draggable:true,icon:pinIcon('⌖','center')}).addTo(map);
    anchor.bindTooltip('Arraste para mover o centro da pesquisa');
    anchor.on('dragend',()=>{const p=anchor.getLatLng();center={lat:p.lat,lng:p.lng};ring.setLatLng(p);refresh();});
  }
  renderMarkers();
  if(recenter&&located.length)map.fitBounds(L.latLngBounds(located.map(p=>[p.lat,p.lng])).pad(.16),{maxZoom:14});
}
if(map)map.on('click',event=>{center={lat:event.latlng.lat,lng:event.latlng.lng};drawMap(false);refresh();});
function bulkSelectVisible(checked){
  const visible=visibleRecords();
  for(const p of visible){
    if(checked)selected.add(p.key);
    else selected.delete(p.key);
  }
  refresh();
  report((checked?'Selecionados ':'Desmarcados ')+visible.length+
    ' anúncios visíveis. Seleção não significa aprovação dos comparáveis; o indicativo ainda verifica a elegibilidade.');
}
function syncSelectionToolbar(visible){
  const count=visible.filter(p=>selected.has(p.key)).length;
  const all=visible.length>0&&count===visible.length;
  const ticker=$('select-all-visible-toggle');
  ticker.checked=all;
  ticker.indeterminate=count>0&&!all;
  ticker.disabled=!visible.length;
  $('select-all-visible').disabled=!visible.length||all;
  $('deselect-all-visible').disabled=!count;
  $('deselect-all').disabled=!selected.size;
  $('selection-counter').textContent=selected.size+' em análise · '+count+
    ' de '+visible.length+' anúncios visíveis. Nem todos entrarão no cálculo.';
}
$('select-all-visible').onclick=()=>bulkSelectVisible(true);
$('deselect-all-visible').onclick=()=>bulkSelectVisible(false);
function clearComparableSelection(){
  selected.clear();refresh();
  report('Seleção de comparáveis limpa, sem apagar os anúncios ou o imóvel de referência.');
}
$('deselect-all').onclick=clearComparableSelection;
$('select-all-visible-toggle').onchange=event=>bulkSelectVisible(Boolean(event.target.checked));
$('auto-select-new').addEventListener('change',()=>{
  report($('auto-select-new').checked?
    'Novos anúncios serão incluídos automaticamente. Imóveis desmarcados manualmente permanecem desmarcados.':
    'A inclusão automática dos próximos anúncios foi desativada. Sua seleção atual foi preservada.');
});

let visibleCardLimit=40;
$('show-more-cards').onclick=()=>{visibleCardLimit+=40;refresh();};
function renderCards() {
  const box = $('results'); box.replaceChildren();
  const visible = visibleRecords();
  syncSelectionToolbar(visible);
  $('filter-status').textContent = visible.length + ' de ' + records.length + ' anúncios visíveis com os filtros atuais.'+(activeLocation?' Município: '+activeLocation.label+'.':'');
  if (!visible.length) {const el=document.createElement('p');el.className='muted';el.textContent='Nenhum anúncio corresponde aos filtros.';box.appendChild(el);}
  const batch=visible.slice(0,visibleCardLimit);
  for (const p of batch) {
    const card=document.createElement('article'); card.className='listing'+(selected.has(p.key)?' selected':'');
    const dis=distance(center,p), flag=$('dedupe').checked&&duplicate(p);
    const review=reviewComparable(p);
    const reviewClass=review.status==='complete'?'quality-ok':review.status==='review'?'quality-warn':'quality-missing';
    const match=assessReference(referenceProfile,p);
    const refClass=match?.status==='compatible'?'quality-ok':match?.status==='review'?'quality-warn':'quality-missing';
    card.innerHTML =
      '<div class="row between"><span class="pill">'+safe(p.source)+'</span><span class="muted">'+(validPoint(p)?(p.approx?'📍 Aproximada':'📍 Não certificada'):'Sem coordenadas')+'</span></div>'+
      (p.collectedAt?'<span class="muted">Coletado em '+safe(p.collectedAt.slice(0,10))+
       (p.requestId?' · Consulta '+safe(p.requestId):'')+'</span>':'')+
      '<h3>'+safe(p.title)+'</h3><div class="row"><span class="pill orange">'+safe(typeLabel[p.type]||'A classificar')+'</span><span class="pill '+reviewClass+'">'+safe(qualityLabels[review.status])+'</span></div>'+
      (match?'<div class="reference-result"><span class="pill '+refClass+'">Referência: '+safe(referenceLabels[match.status])+'</span>'+
        (match.distanceKm!==null?' <span class="muted">'+safe(match.distanceKm.toFixed(1))+' km do imóvel de referência</span>':'')+
        (match.issues.length?'<div class="quality-reasons">'+match.issues.slice(0,4).map(issue=>'<span>'+safe(issue)+'</span>').join('')+'</div>':'')+
        '</div>':'')+
      '<div class="price">'+safe(money(p.price))+'</div>'+
      (review.unitPrice!==null?'<div class="muted">'+safe(money(review.unitPrice))+' / '+safe(review.unitAreaLabel)+' (preço pedido)</div>':'')+
      (Array.isArray(p.textEvidence)&&p.textEvidence.length?
        '<div class="title-evidence"><strong>Indícios no texto (não confirmados):</strong> '+
        p.textEvidence.map(x=>'<span>'+safe(x.label)+' · '+safe(x.origin)+'</span>').join(' · ')+'</div>':'')+
      (review.issues.length?'<div class="quality-reasons">'+review.issues.map(x=>'<span>'+safe(x)+'</span>').join('')+'</div>':'')+
      '<div class="row"><span class="pill">'+safe(text(areaForLocalComparison(p)))+' '+(['land','farm'].includes(p.type)?'m² terreno':'m² úteis')+'</span>'+
      (['land','farm'].includes(p.type)?'':p.total!==null?'<span class="pill">'+safe(text(p.total))+' m² total</span>':'')+
      '<span class="pill">'+safe(text(p.beds))+' dorm.</span><span class="pill">'+safe(text(p.suites))+' suítes</span><span class="pill">'+safe(text(p.baths))+' banh.</span><span class="pill">'+safe(text(p.spaces))+' vagas</span></div>'+
      '<div class="muted">'+safe(p.neighborhood)+' · '+safe(p.city)+(dis!==null?' · '+dis.toFixed(1)+' km do centro':'')+'</div>'+
      (flag?'<span class="pill orange">Possível duplicidade — revisar</span>':'')+
      '<div class="row between"><label class="check"><input class="pick" type="checkbox" '+(selected.has(p.key)?'checked':'')+'> Comparar</label>'+(p.link?'<a class="link" target="_blank" rel="noopener noreferrer" href="'+safe(p.link)+'">Ver anúncio ↗</a>':'')+'</div>'+
      '<button type="button" class="review-verify">Conferir/corrigir dados'+
       ((p.reviewHistory||[]).length?' · '+p.reviewHistory.length+' alteração(ões)':'')+'</button>'+
      (p.link&&['zapimoveis.com.br','olx.com.br','imovelweb.com.br','vivareal.com.br','chavesnamao.com.br'].includes(p.source)?'<button class="detail" type="button">Buscar detalhes (PDP) · pode consumir créditos</button>':'')+
      (p.detailed?'<div class="pill orange">Dados adicionais consultados</div>':'');
    card.querySelector('.pick').onchange = event=>{if(event.target.checked)selected.add(p.key);else selected.delete(p.key);refresh();};
    const reviewButton=card.querySelector('.review-verify');
    if(reviewButton)reviewButton.onclick=()=>openReview(p.key);
    const details=card.querySelector('.detail');
    if(details)details.onclick=()=>fetchDetails(p,details);
    box.appendChild(card);
  }
  $('show-more-cards').classList.toggle('hidden',visibleCardLimit>=visible.length);
  $('show-more-cards').textContent='Mostrar mais imóveis ('+batch.length+' de '+visible.length+')';
  $('loaded').textContent=records.length;$('total').textContent=reported??'—';$('mapped').textContent=records.filter(validPoint).length;$('picked').textContent=selected.size;
  $('complete').textContent=records.filter(p=>reviewComparable(p).status==='complete').length;
  $('needs-review').textContent=records.filter(p=>reviewComparable(p).status!=='complete').length;
  if(referenceProfile){
    const counts={compatible:0,review:0,insufficient:0,incompatible:0};
    for(const p of records)counts[assessReference(referenceProfile,p).status]++;
    $('reference-stats').textContent=
      counts.compatible+' aderentes nos critérios conferidos · '+counts.review+' para revisar · '+
      counts.insufficient+' comparações incompletas · '+counts.incompatible+' fora do recorte.';
  }
  renderMarkers();
}
function renderComparison() {
  const all=records.filter(p=>selected.has(p.key));
  const arr=all.slice(0,18),container=$('comparison');
  $('export-btn').disabled=all.length<2;
  if(!arr.length){container.textContent='Selecione os anúncios na lista para comparar suas características.';return;}
  const attrs=[['Fonte','source'],['Tipo de imóvel','type'],
    ...(referenceProfile?[['Semelhança com imóvel de referência','referenceMatch']]:[]),
    ['Triagem dos dados','quality'],['Indícios textuais (não confirmados)','textEvidence'],['Preço pedido','price'],['R$/m² da área de referência','unitPrice'],['Área útil','usable'],['Área total','total'],['Dormitórios','beds'],['Suítes','suites'],['Banheiros','baths'],['Vagas','spaces'],['Pavimentos','floors'],['Bairro','neighborhood'],['Anunciante','advertiser'],['Comodidades','amenities']];
  let html='<table><thead><tr><th>Característica</th>'+arr.map(p=>'<th>'+safe(p.title.slice(0,70))+'</th>').join('')+'</tr></thead><tbody>';
  for (const [label,key] of attrs) html+='<tr><th>'+safe(label)+'</th>'+arr.map(p=>'<td>'+safe(key==='referenceMatch'?referenceLabels[assessReference(referenceProfile,p).status]:key==='quality'?qualityLabels[reviewComparable(p).status]:key==='unitPrice'?(reviewComparable(p).unitPrice===null?'—':money(reviewComparable(p).unitPrice)+' / '+reviewComparable(p).unitAreaLabel):key==='price'?money(p.price):key==='type'?(typeLabel[p.type]||'A classificar'):key==='textEvidence'?(p.textEvidence?.map(x=>x.label+' ('+x.origin+')').join(' · ')||'—'):key==='amenities'?(p.amenities.join(', ')||'—'):text(p[key]))+'</td>').join('')+'</tr>';
  const locations=new Set(arr.map(p=>canon(p.city)+'/'+canon(uf(p.state))));
  const types=new Set(arr.map(p=>p.type));
  const cautions=[];
  if(arr.some(p=>reviewComparable(p).status==='insufficient'))cautions.push('Há anúncios sem dados essenciais.');
  if(arr.some(p=>reviewComparable(p).status==='review'))cautions.push('Há atributos que precisam ser conferidos.');
  if(locations.size>1)cautions.push('A seleção contém municípios diferentes.');
  if(types.size>1)cautions.push('A seleção mistura tipos de imóvel.');
  if(arr.some(p=>duplicate(p)))cautions.push('Há possíveis duplicidades na sessão.');
  if(referenceProfile){
    const checks=arr.map(p=>assessReference(referenceProfile,p));
    if(checks.some(c=>c.status==='incompatible'))cautions.push('Alguns anúncios estão fora do recorte do imóvel de referência.');
    if(checks.some(c=>c.status==='insufficient'))cautions.push('Algumas comparações têm dados essenciais ausentes.');
    if(checks.some(c=>c.status==='review'))cautions.push('Existem diferenças relevantes a verificar frente à referência.');
  }
  container.innerHTML=(all.length>18?'<p class="hint">Para manter a tela rápida, a tabela detalhada mostra apenas os primeiros 18 dos '+all.length+
    ' anúncios selecionados. O indicativo e a exportação consideram todos os selecionados elegíveis.</p>':'')+
    html+'</tbody></table>'+
    '<p class="hint">Triagem preliminar: '+safe(cautions.join(' ')||'Campos essenciais presentes; confirme os anúncios, localização e homogeneidade.')+
    ' Preços anunciados não representam preços efetivos de venda. Nenhuma avaliação ou PTAM é calculado.</p>';
}
function refresh(){renderCards();renderComparison();renderGuidedSummary();renderOfferIndicator();}
function loadNormalized(items,total=null,detailed=false){
  const known=new Map(records.map((x,i)=>[x.key,i]));
  for (const p of items) {
    const idx=known.get(p.key);
    if(idx!==undefined) {
      const prior=records[idx], update={...prior};
      for(const [key,val] of Object.entries(p)) {
        if(val===null||val===undefined||val==='—'||(Array.isArray(val)&&val.length===0))continue;
        if(key==='type'&&val==='unknown'&&prior.type!=='unknown')continue;
        // Novos retornos do fornecedor não apagam correções revisadas localmente.
        if(prior.manualOverrides?.[key]){
          if(val!==prior[key]){
            update.providerConflicts={...(update.providerConflicts||{}),
              [key]:{providerValue:val,reviewedValue:prior[key]}};
          }
          continue;
        }
        // Histórico local não é substituído por metadados da nova consulta.
        if(['reviewHistory','manualOverrides','providerSnapshot','reviewImported','providerConflicts'].includes(key))
          continue;
        update[key]=val;
      }
      if(detailed)update.detailed=true;
      records[idx]=update;
    } else {
      known.set(p.key,records.length);
      records.push({...p,detailed});
      if($('auto-select-new').checked)selected.add(p.key);
    }
  }
  if(total!==null)reported=total;
  if(activeReviewKey&&!records.some(x=>x.key===activeReviewKey))closeReview();
  drawMap(true);refresh();
  report('Importação concluída: '+items.length+' anúncios nesta consulta e '+records.length+' únicos por ID/fonte na sessão. Dados sujeitos a revisão.');
}
function load(input){
  const data=payload(input);
  loadNormalized(data.items,data.total,input?.data?.type==='pdp');
}
// Lê exclusivamente o formato CSV de exportação do laboratório, inclusive arquivos
// antigos sem a coluna "type". Arquivos ficam no navegador, sem upload ao servidor.
function parseExportCsv(raw){
  if(typeof raw!=='string'||raw.length>3000000)throw Error('CSV inválido ou maior que 3 MB.');
  const rows=[],row=[];let field='',quoted=false;
  const cell=()=>{row.push(field);field='';};
  const line=()=>{cell();if(row.some(value=>value.trim()!==''))rows.push([...row]);row.length=0;};
  const content=raw.replace(/^\uFEFF/,'');
  for(let i=0;i<content.length;i++){
    const char=content[i];
    if(char==='"'){
      if(quoted&&content[i+1]==='"'){field+='"';i++;}
      else quoted=!quoted;
    }else if(char===';'&&!quoted){cell();}
    else if((char==='\r'||char==='\n')&&!quoted){
      if(char==='\r'&&content[i+1]==='\n')i++;
      line();
    }else field+=char;
  }
  if(quoted)throw Error('CSV contém campo com aspas não fechado.');
  if(field||row.length)line();
  if(!rows.length)throw Error('CSV vazio.');
  const headers=rows.shift().map(v=>v.trim());
  const required=['source','id','price','usable','total','city','state','link'];
  if(required.some(key=>!headers.includes(key)))throw Error('Formato CSV incompatível com a exportação do Imóvel Busca.');
  if(!rows.length)throw Error('CSV sem anúncios.');
  if(rows.length>2000)throw Error('CSV com mais de 2.000 anúncios: divida o arquivo em partes.');
  return rows.map((values,i)=>{
    if(values.length!==headers.length)throw Error('CSV: número de colunas incorreto na linha '+(i+2)+'.');
    const row=Object.fromEntries(headers.map((key,index)=>[key,values[index]]));
    const id=row.id.trim(),source=row.source.trim().toLowerCase();
    if(!source||(!id&&!row.link))throw Error('CSV: anúncio sem identificação na linha '+(i+2)+'.');
    const link=url(row.link);
    const type=Object.hasOwn(typeLabel,row.type)?row.type:classify({title:row.title,link});
    const latitude=number(row.lat),longitude=number(row.lng);
    const valid=latitude!==null&&longitude!==null&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180&&(latitude!==0||longitude!==0);
    const neighborhood=row.neighborhood?.trim()||'—';
    const importedReviewHistory=parseImportedHistory(row.reviewHistory);
    const record={
      source,id:id||link,key:source+':'+(id||link),type,
      offerPurpose:inferOfferPurpose({...row,link}),
      collectedAt:typeof row.collectedAt==='string'&&/^\d{4}-\d\d-\d\dT/.test(row.collectedAt)?row.collectedAt:'',
      searchCriteria:typeof row.searchCriteria==='string'?row.searchCriteria.trim().slice(0,2500):'',
      requestId:typeof row.requestId==='string'?row.requestId.trim().slice(0,150):'',
      executionId:typeof row.executionId==='string'?row.executionId.trim().slice(0,150):'',
      title:bestTitle({title:row.title,neighborhood},type,{neighborhood:neighborhood==='—'?'':neighborhood}),
      textEvidence:safeTextEvidence(
        typeof row.textEvidence==='string'&&row.textEvidence.length<6000?
          (()=>{try{return JSON.parse(row.textEvidence);}catch{return null;}})():null,
        row.title,row.description),
      link,price:number(row.price),usable:number(row.usable),total:number(row.total),
      beds:number(row.beds),suites:number(row.suites),baths:number(row.baths),
      spaces:number(row.spaces),floors:number(row.floors),
      neighborhood,city:row.city?.trim()||'—',
      state:uf(row.state)||row.state?.trim()||'—',
      lat:valid?latitude:null,lng:valid?longitude:null,approx:row.approx?.trim().toLowerCase()==='true',
      advertiser:row.advertiser?.trim()||'—',description:'—',amenities:[],detailed:false,
      reviewHistory:importedReviewHistory,
      reviewImported:importedReviewHistory.length>0,
      providerSnapshot:null,manualOverrides:{},providerConflicts:{}
    };
    return record;
  });
}
$('csv-import-btn').onclick=async()=>{
  const file=$('csv-file').files?.[0];
  if(!file){report('Selecione um CSV anteriormente exportado pelo Imóvel Busca.',true);return;}
  try{
    const content=await file.text();
    const imported=parseExportCsv(content);
    activeLocation=null;displayAudit(null);
    loadNormalized(imported);
    report('CSV importado localmente: '+imported.length+' anúncios. Confira a triagem, as duplicidades e a origem antes de selecionar comparáveis.');
  }catch(e){report(e.message||'Erro ao ler o CSV',true);}
};
$('import-btn').onclick=()=>{try{activeLocation=null;displayAudit(null);load(JSON.parse($('json-input').value));}catch(e){report(e.message||'JSON inválido',true);}};
$('clear-btn').onclick=()=>{records=[];selected.clear();reported=null;center=null;activeLocation=null;closeReview();displayAudit(null);drawMap(false);refresh();report('Sessão limpa. Nenhum dado foi enviado ao servidor.');};
function tab(which){const api=which==='api';$('import-panel').classList.toggle('hidden',api);$('api-panel').classList.toggle('hidden',!api);$('tab-api').classList.toggle('active',api);$('tab-import').classList.toggle('active',!api);}
$('tab-import').onclick=()=>tab('import');$('tab-api').onclick=()=>tab('api');
const GEO_PORTALS=new Set(['zapimoveis.com.br','vivareal.com.br','chavesnamao.com.br']);

const MIXED_PORTALS=[
  {target:'zapimoveis.com.br',label:'ZAP Imóveis',input:'mixed-zap'},
  {target:'vivareal.com.br',label:'VivaReal',input:'mixed-viva'},
  {target:'olx.com.br',label:'OLX',input:'mixed-olx'},
  {target:'chavesnamao.com.br',label:'Chaves na Mão',input:'mixed-chaves'},
  {target:'imovelweb.com.br',label:'Imovelweb',input:'mixed-imovelweb',requiresUrl:true}
];
const mixedName=target=>MIXED_PORTALS.find(item=>item.target===target)?.label||target;
const mixedMode=()=>$('operation').value==='plp'&&$('mixed-enabled').checked;
function mixedTargets(){return MIXED_PORTALS.filter(item=>$(item.input).checked).map(item=>item.target);}
function validateProviderUrl(link,expected){
  try{
    const parsed=new URL(link);
    return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.port&&
      (parsed.hostname===expected||parsed.hostname.endsWith('.'+expected));
  }catch{return false;}
}
function planMixedSearch(base,targets,options={}){
  if(!base||base.type!=='plp')throw Error('Pesquisa multifonte permite apenas listas de anúncios (PLP).');
  if(!Array.isArray(targets)||!targets.length)throw Error('Selecione pelo menos uma fonte.');
  if(new Set(targets).size!==targets.length||targets.length>MIXED_PORTALS.length||
     targets.some(x=>!MIXED_PORTALS.some(item=>item.target===x)))
    throw Error('Lista de portais inválida ou repetida.');
  if(String(base.city||'').trim().length<2||!uf(base.state))
    throw Error('Preencha cidade e UF válidas antes de consultar várias fontes.');
  if(!Number.isInteger(base.page)||base.page<1||base.page>10)
    throw Error('Informe página entre 1 e 10 para a pesquisa mista.');
  for(const name of ['priceMin','priceMax','areaMin','areaMax']){
    const value=base[name];
    if(value!==undefined&&value!==null&&(!Number.isInteger(value)||value<0))
      throw Error('Preencha valores de preço e área válidos antes das chamadas pagas.');
  }
  if(base.priceMin!==undefined&&base.priceMax!==undefined&&base.priceMin>base.priceMax)
    throw Error('O preço mínimo é maior que o máximo.');
  if(base.areaMin!==undefined&&base.areaMax!==undefined&&base.areaMin>base.areaMax)
    throw Error('A área mínima é maior que a máxima.');
  if(!['sale','rent'].includes(base.businessType))
    throw Error('Selecione venda ou aluguel para a pesquisa mista.');
  if(base.propertyType&&(!Object.hasOwn(typeLabel,base.propertyType)||base.propertyType==='unknown'||base.propertyType==='other'))
    throw Error('Selecione uma tipologia compatível com os portais de pesquisa.');
  if(options.imovelwebUrl&&targets.includes('imovelweb.com.br')){
    if(!validateProviderUrl(options.imovelwebUrl,'imovelweb.com.br')||
       !new URL(options.imovelwebUrl).pathname.endsWith('.html'))
      throw Error('Imovelweb exige uma URL HTTPS pública de resultados, do próprio domínio, terminada em .html.');
  }else if(targets.includes('imovelweb.com.br'))
    throw Error('Para incluir o Imovelweb, cole a URL pública de resultados terminada em .html ou desmarque essa fonte.');
  return targets.map(target=>{
    const query={...base,target,type:'plp'};
    // Ordenação e URL da pesquisa simples são específicas de cada portal.
    delete query.sort;delete query.url;delete query.region;delete query.categoryPath;
    // As três APIs estruturadas aceitam localização aproximada; as outras não.
    if(!GEO_PORTALS.has(target)){
      delete query.searchNear;delete query.latitude;delete query.longitude;
    }
    if(target==='imovelweb.com.br')query.url=options.imovelwebUrl;
    if(target==='olx.com.br'){
      if(options.olxRegion)query.region=options.olxRegion;
      query.categoryPath=options.olxCategory||'imoveis';
    }
    return query;
  });
}
function updateMixedCost(){
  const targets=mixedTargets(),count=targets.length;
  $('mixed-cost').textContent=count+' fonte(s) selecionada(s): até '+count+
    ' consulta(s) à GeckoAPI nesta execução (uma página por fonte). A cobrança real é definida pela API.'+
    (targets.includes('imovelweb.com.br')?' Para Imovelweb, informe a URL pública .html.':'');
  $('mixed-imovelweb-wrap').classList.toggle('hidden',!targets.includes('imovelweb.com.br'));
}
function syncMixedControls(){
  const mode=mixedMode(),pdp=$('operation').value==='pdp';
  $('mixed-switch-wrap').classList.toggle('hidden',pdp);
  $('mixed-picker').classList.toggle('hidden',!mode);
  $('single-portal-wrap').classList.toggle('hidden',mode);
  $('portal').disabled=mode;
  updateMixedCost();
}
$('mixed-enabled').addEventListener('change',syncForm);
for(const item of MIXED_PORTALS)$(item.input).addEventListener('change',()=>{updateMixedCost();syncForm();});
$('mixed-select-structured').onclick=()=>{
  for(const p of MIXED_PORTALS)$(p.input).checked=!p.requiresUrl;
  updateMixedCost();syncForm();
};
$('mixed-select-all').onclick=()=>{
  for(const p of MIXED_PORTALS)$(p.input).checked=true;
  updateMixedCost();syncForm();
};
$('mixed-select-none').onclick=()=>{
  for(const p of MIXED_PORTALS)$(p.input).checked=false;
  updateMixedCost();syncForm();
};
$('mixed-fill-reference').onclick=()=>{
  if(!referenceProfile){report('Cadastre e salve seu imóvel de referência na etapa 1.',true);return;}
  const r=referenceProfile;
  $('city').value=r.city;$('state').value=r.state;
  $('property-type').value=r.type==='other'?'':r.type;
  // Se a referência tiver dormitórios, usar o mínimo apenas nos filtros locais;
  // contagens exatas no provedor não são equivalentes a um mínimo.
  $('bedrooms-min').value=r.beds??'';
  $('neighborhood').value=r.neighborhood||'';
  // Não inferir área útil a partir de área de terreno ou construída.
  if(!['land','farm'].includes(r.type)&&r.usable&&Number.isFinite(r.usable)){
    $('area-min').value=Math.max(0,Math.floor(r.usable*(1-r.tolerance/100)));
    $('area-max').value=Math.ceil(r.usable*(1+r.tolerance/100));
  }else {
    $('area-min').value='';$('area-max').value='';
  }
  $('business-type').value='sale';
  syncForm();
  report('Campos de busca preenchidos a partir do imóvel de referência. Revise a tipologia e a finalidade antes da consulta paga.');
};

const SORT_OPTIONS={
 'olx.com.br':[['relevance','Relevância'],['date','Mais recentes'],['price','Menor preço'],['biggest_price','Maior preço'],['price_relevance','Preço relevante']],
 'vivareal.com.br':[['relevance','Relevância'],['date','Mais recentes'],['price','Menor preço'],['biggest_price','Maior preço'],['biggest_area','Maior área']],
 'chavesnamao.com.br':[['relevance','Relevância'],['price','Menor preço'],['biggest_price','Maior preço']]
};
function syncOlxPilotLocation(){
  const isOlx=mixedMode()?$('mixed-olx').checked:$('portal').value==='olx.com.br';
  const local=isOlx&&canon($('city').value)==='salto de pirapora'&&canon($('state').value)==='sp';
  $('olx-reference').classList.toggle('hidden',!local||$('operation').value==='pdp');
  if(local&&['','sorocaba'].includes(canon($('olx-region').value)))
    $('olx-region').value='Regiao de Sorocaba';
  if(isOlx){
    const category=$('olx-category');
    if($('property-type').value==='house'&&$('business-type').value==='sale'&&category.value==='imoveis')
      category.value='imoveis/venda/casas';
    else if(($('property-type').value!=='house'||$('business-type').value!=='sale')&&category.value==='imoveis/venda/casas')
      category.value='imoveis';
  }
}
function syncForm(){
  const portal=$('portal').value,pdp=$('operation').value==='pdp';
  const mixed=!pdp&&$('mixed-enabled').checked;
  syncMixedControls();
  $('pdp-wrap').classList.toggle('hidden',!pdp);
  const urlEnabled=['olx.com.br','imovelweb.com.br','vivareal.com.br','chavesnamao.com.br'].includes(portal);
  $('search-url-wrap').classList.toggle('hidden',pdp||mixed||!urlEnabled);
  const wantsOlx=!pdp&&(mixed?$('mixed-olx').checked:portal==='olx.com.br');
  $('olx-region-wrap').classList.toggle('hidden',!wantsOlx);
  $('olx-category-wrap').classList.toggle('hidden',!wantsOlx);
  $('olx-region').disabled=!wantsOlx;
  $('olx-category').disabled=!wantsOlx;
  syncOlxPilotLocation();
  for(const id of ['city','state','page','keyword','property-type','neighborhood','price-min','price-max','area-min','area-max','bedrooms-min','bathrooms-min','parking-min','search-near','search-url','business-type','sort']){
    $(id).disabled=pdp;
  }
  $('search-near').disabled=pdp||mixed||!GEO_PORTALS.has(portal);
  if(mixed||!GEO_PORTALS.has(portal))$('search-near').checked=false;
  $('sort').disabled=pdp||mixed;
  const select=$('sort'),prior=select.value;
  select.replaceChildren();
  for(const [value,label] of [['','Padrão do portal'],...(SORT_OPTIONS[portal]||[])]){
    const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);
  }
  select.value=(SORT_OPTIONS[portal]||[]).some(([value])=>value===prior)?prior:'';
  $('provider-hint').textContent=pdp?'Detalhamento de uma URL por vez.':
    mixed?'Pesquisa mista: uma chamada por fonte; falhas isoladas e cidade/UF auditadas em cada resposta.':
    portal==='olx.com.br'?'OLX: categoria e região são nativas; cidade e UF também serão conferidas em cada anúncio.':
    portal==='imovelweb.com.br'?'Imovelweb: forneça uma URL de resultados terminada em .html.':
    portal==='zapimoveis.com.br'?'ZAP: tipo, preço, área útil e bairro. Não aceita URL de busca nessa API.':
    'Tipo, preço, área, bairro e URL pública de busca; cidade/UF são auditadas em cada anúncio.';
  $('url-help').textContent=mixed?'Na pesquisa mista, os filtros seguem as capacidades de cada portal. Imovelweb requer URL pública e as contagens mínimas são aplicadas localmente.':portal==='imovelweb.com.br'?
    'Imovelweb: cole a URL de resultados .html. O site não aceita filtros estruturados nesta API.':
    portal==='olx.com.br'?'OLX: a documentação aceita URL de lista estadual/nacional. Para pesquisar um município, prefira os campos cidade + UF + região oficial.':
    'VivaReal/Chaves: URL opcional; pode preservar os filtros do portal. Cidade/UF continuam verificadas na resposta.';
}
$('operation').onchange=syncForm;
$('portal').onchange=syncForm;
for(const id of ['city','state','property-type','business-type'])
  $(id).addEventListener('change',syncOlxPilotLocation);
syncForm();
async function callApi(query){
  const response=await fetch('/api/extract',{
    method:'POST',headers:{'Content-Type':'application/json','x-lab-code':$('access').value},
    body:JSON.stringify(query)
  });
  const body=await response.json();
  if(!response.ok){
    const error=new Error(body.error||'Falha na GeckoAPI (HTTP '+response.status+')');
    error.httpStatus=response.status;
    throw error;
  }
  return body;
}
function validatedNum(id){
  const raw=$(id).value.trim();
  return raw===''?null:Number(raw);
}
function queryFilters(){
  syncOlxPilotLocation();
  const type=$('operation').value,target=$('portal').value,query={target,type};
  if(type==='pdp'){query.url=$('pdp-url').value.trim();return query;}
  query.city=$('city').value.trim();
  query.state=$('state').value.trim().toUpperCase();
  query.page=Number($('page').value);
  query.keyword=$('keyword').value.trim();
  query.businessType=$('business-type').value;
  query.sort=$('sort').value;
  if(target==='olx.com.br'){query.region=$('olx-region').value.trim();query.categoryPath=$('olx-category').value.trim();}
  query.propertyType=$('property-type').value;
  query.neighborhood=$('neighborhood').value.trim();
  const searchUrl=$('search-url').value.trim();
  if(searchUrl&&['olx.com.br','imovelweb.com.br','vivareal.com.br','chavesnamao.com.br'].includes(target))query.url=searchUrl;
  for(const [from,to] of [['price-min','priceMin'],['price-max','priceMax'],['area-min','areaMin'],['area-max','areaMax'],['bedrooms-min','bedrooms'],['bathrooms-min','bathrooms'],['parking-min','parkingSpots']]){
    const n=validatedNum(from);if(n!==null)query[to]=n;
  }
  if($('search-near').checked&&GEO_PORTALS.has(target)){
    if(!center)throw new Error('Clique no mapa para definir o centro da pesquisa geográfica.');
    query.searchNear=true;query.latitude=center.lat;query.longitude=center.lng;
  }
  return query;
}
function mirrorLocalFilters(query){
  // Os mínimos de quartos, banheiros e vagas são aplicados localmente porque
  // a API espera listas exatas desses valores, não limiares mínimos.
  if(query.propertyType!==undefined)$('result-type').value=query.propertyType||'';
  if(query.neighborhood!==undefined)$('filter-neighborhood').value=query.neighborhood;
  const table=[['priceMin','filter-price-min'],['priceMax','filter-price-max'],['areaMin','filter-area-min'],['areaMax','filter-area-max'],['bedrooms','min-beds'],['bathrooms','filter-bathrooms-min'],['parkingSpots','filter-parking-min']];
  for(const [from,to] of table)$(to).value=query[from]??'';
}
function displayAudit(a){
  const el=$('location-audit'),origin=$('origin-audit'),originLink=$('origin-url');
  if(!a){
    el.classList.add('hidden');el.textContent='';
    origin.classList.add('hidden');originLink.removeAttribute('href');
    return;
  }
  el.classList.remove('hidden');
  el.classList.toggle('error',a.acceptedItems===0);
  el.textContent='Cidade conferida: '+a.requestedCity+'/'+a.requestedState+'. '+
    a.acceptedItems+' de '+a.providerItems+' anúncios desta página pertencem ao município informado. '+
    a.discardedOtherCities+' de outras cidades e '+a.discardedMissingLocation+
    ' sem localização verificável foram descartados. O total geral do portal pode incluir outras localidades.'+
    (a.requestId?' Referência GeckoAPI: '+a.requestId+'.':'');
  const check=a.requestUrlCheck;
  if(!check||check.status==='not_applicable'){origin.classList.add('hidden');return;}
  origin.classList.remove('hidden');
  origin.classList.toggle('error',check.status==='mismatch');
  const label={
    match:'A URL contém o estado, região e município solicitados. Isso não garante que os anúncios retornados estejam corretos.',
    mismatch:'ATENÇÃO: a GeckoAPI montou a URL sem todos os segmentos de localização solicitados.',
    provided:'A API recebeu uma URL pronta; confira se ela contém os filtros de localização.',
    unknown:'Não foi possível verificar o endereço da pesquisa enviado pelo fornecedor.'
  };
  $('origin-analysis').textContent=(label[check.status]||'')+(check.missingSegments?.length?' Faltando: '+check.missingSegments.join(', '):'');
  originLink.classList.toggle('hidden',!check.url);
  if(check.url){originLink.href=check.url;}else originLink.removeAttribute('href');
}

// Orquestração no cliente sobre /api/extract: um portal por vez, sem endpoint
// privilegiado nem chamadas não autorizadas à GeckoAPI.
async function executeMixedSearch(plans,fetcher,onUpdate=()=>{}){
  const states=plans.map(query=>({target:query.target,label:mixedName(query.target),
    state:'queued',items:[],audit:null,error:null,accepted:0,discarded:0,
    collectedAt:null,requestId:null,executionId:null}));
  onUpdate(states);
  for(let i=0;i<plans.length;i++){
    const current=states[i],query=plans[i];
    current.state='running';
    onUpdate(states);
    try{
      const response=await fetcher(query);
      const data=response?.data;
      if(response?.notFound||data===null){
        current.items=[];current.state='done';current.collectedAt=new Date().toISOString();
      }else if(!data||typeof data!=='object'||!Array.isArray(data.items)){
        throw new Error('A resposta desta fonte não contém uma lista de anúncios verificável.');
      }else{
        const audit=data.locationAudit||null;
        current.audit=audit;
        current.requestId=audit?.requestId||null;
        current.executionId=audit?.executionId||null;
        current.collectedAt=new Date().toISOString();
        // A origem é a fonte que consultamos, sem confiar no campo "source"
        // possivelmente divergente do retorno externo.
        const normalizedItems=data.items.length?payload({data:{...data,source:query.target}}).items:[];
        current.items=normalizedItems.filter(p=>
          canon(p.city)===canon(query.city)&&uf(p.state)===uf(query.state));
        current.accepted=current.items.length;
        current.discarded=Math.max(0,(audit?.providerItems??data.items.length)-current.accepted);
        const criteria={...query};
        // São apenas filtros da busca; senha do laboratório e token GeckoAPI
        // nunca entram na requisição serializada ou na exportação.
        current.items=current.items.map(p=>({
          ...p,collectedAt:current.collectedAt,
          searchCriteria:JSON.stringify(criteria),
          requestId:current.requestId,executionId:current.executionId
        }));
        current.state='done';
      }
    }catch(error){
      current.state='error';current.error=String(error?.message||'Falha desconhecida');
      if([401,429,503].includes(error?.httpStatus)){
        for(const waiting of states.slice(i+1)){
          waiting.state='skipped';
          waiting.error=error.httpStatus===429?'Limite de consultas; nenhuma chamada adicional foi feita.':
            'Execução interrompida por problema de autorização ou configuração.';
        }
        onUpdate(states);
        break;
      }
    }
    onUpdate(states);
  }
  return states;
}
function renderMixedResults(states){
  const el=$('mixed-results');
  el.classList.remove('hidden');
  el.replaceChildren();
  const header=document.createElement('h3');header.textContent='Resultado por fonte';
  el.appendChild(header);
  const desc={queued:'Aguardando consulta',running:'Consultando...',
    done:'Concluída',error:'Falhou',skipped:'Não executada'};
  for(const row of states){
    const div=document.createElement('div');div.className='mixed-source';
    const name=document.createElement('strong');name.textContent=row.label;div.appendChild(name);
    const info=document.createElement('span');info.className=row.state==='done'?'success':
      row.state==='error'?'failure':'pending';
    if(row.state==='done'){
      info.textContent=row.accepted+' anúncio(s) válidos'+
        (row.discarded?' · '+row.discarded+' descartados por localização':'')+
        (row.requestId?' · ID de consulta: '+row.requestId:'')+
        (row.audit?.requestUrlCheck?.status==='mismatch'?' · Verifique a URL gerada pela OLX':'');
    }else info.textContent=desc[row.state]+(row.error?': '+row.error:'');
    div.appendChild(info);el.appendChild(div);
  }
}
async function performMixedSearch(plans,fetcher=callApi){
  const collected=[];
  const rows=await executeMixedSearch(plans,fetcher,states=>{
    renderMixedResults(states);
    const ready=states.filter(x=>x.state==='done').length;
    const failed=states.filter(x=>x.state==='error').length;
    const running=states.find(x=>x.state==='running');
    report('Pesquisa mista: '+ready+' de '+states.length+' fontes concluídas'+
      (running?' · consultando '+running.label:'')+
      (failed?' · '+failed+' falha(s)':'')+'.');
    for(const r of states){
      if(r.state==='done'&&!collected.includes(r.target)){
        collected.push(r.target);
        if(r.items.length)loadNormalized(r.items,null);
      }
    }
  });
  reported=null; // Os totais por portal não devem ser somados como total único.
  refresh();
  const success=rows.filter(x=>x.state==='done'),failed=rows.filter(x=>x.state==='error');
  const count=success.reduce((n,x)=>n+x.accepted,0);
  report('Pesquisa mista encerrada: '+success.length+'/'+rows.length+' fonte(s) concluída(s), '+
    count+' anúncio(s) aceitos nas respostas e '+records.length+' anúncio(s) únicos por portal/ID na sessão.'+
    (failed.length?' Atenção: '+failed.length+' fonte(s) falharam; confira a tabela por fonte.':'')+
    ' Antes de emitir um PTAM, verifique possíveis duplicidades entre portais e a autenticidade dos anúncios.',
    failed.length>0||success.length===0);
  return rows;
}

function setActiveLocation(query) {
  const next={city:canon(query.city),state:canon(query.state),label:query.city+'/'+query.state};
  // Preservar CSV previamente importado quando todos os anúncios são do
  // mesmo município. Ao mudar de município, não misturar amostras.
  const priorDifferent=activeLocation?
    activeLocation.city!==next.city||activeLocation.state!==next.state:
    records.some(p=>canon(p.city)!==next.city||uf(p.state)!==uf(query.state));
  if(priorDifferent){
    records=[];selected.clear();reported=null;center=null;drawMap(false);
  }
  activeLocation=next;
}
$('api-btn').onclick=async()=>{
  const button=$('api-btn');let query,plans;
  try{
    query=queryFilters();
    if(mixedMode())plans=planMixedSearch(query,mixedTargets(),{
      imovelwebUrl:$('mixed-imovelweb-url').value.trim(),
      olxRegion:$('olx-region').value.trim(),
      olxCategory:$('olx-category').value.trim()
    });
  }catch(e){report(e.message,true);return;}
  if(!$('access').value){report('Informe o código de acesso do laboratório, não o token da GeckoAPI.',true);return;}
  const confirmation=plans?
    'Consultar '+plans.length+' fonte(s) em sequência (até '+plans.length+
    ' chamadas à GeckoAPI, uma página por fonte)? Cada chamada poderá consumir créditos. Fontes com falha não serão repetidas automaticamente.':
    'Esta consulta à GeckoAPI poderá consumir créditos. Deseja continuar?';
  if(!window.confirm(confirmation))return;
  button.disabled=true;
  if(plans){
    try{
      setActiveLocation(query);
      mirrorLocalFilters(query);
      displayAudit(null);
      reported=null;
      await performMixedSearch(plans);
    }catch(error){report(error.message||'Falha durante a pesquisa mista.',true);}
    finally{button.disabled=false;}
    return;
  }
  $('mixed-results').classList.add('hidden');
  report('Consultando '+query.target+'... Aguarde alguns segundos.');
  try {
    const body=await callApi(query);
    if(body?.notFound||body?.data===null){report('O provedor não retornou anúncios para essa consulta.',true);return;}
    const audit=query.type==='plp'?body?.data?.locationAudit:null;
    if(query.type==='plp') {
      setActiveLocation(query);
      mirrorLocalFilters(query);
      displayAudit(audit);
    }
    if(query.type==='plp'&&Array.isArray(body?.data?.items)&&body.data.items.length===0){
      refresh();
      const reason=audit?.providerItems>0?
        'A fonte retornou '+audit.providerItems+' anúncios nesta página, mas nenhum com cidade e UF confirmadas em '+query.city+'/'+query.state+'. Os anúncios de outros locais foram descartados.':
        'Nenhum anúncio retornou nesta página para '+query.city+'/'+query.state+'.';
      report(reason+' Na OLX, experimente informar a Região ou colar a URL da busca local feita no site.',true);
      return;
    }
    load(body);
    if(audit&&audit.discardedOtherCities+audit.discardedMissingLocation>0){
      report(audit.acceptedItems+' anúncios válidos em '+query.city+'/'+query.state+
        '; '+(audit.discardedOtherCities+audit.discardedMissingLocation)+' descartados por município diferente ou endereço não confirmado.');
    }
  }catch(e){report(e.message||'Falha de conexão',true);}
  finally{button.disabled=false;}
};
async function fetchDetails(p,button){
  if(!$('access').value){tab('api');report('Para consultar detalhes, informe primeiro seu código de acesso na aba Consultar GeckoAPI.',true);return;}
  if(!p.link){report('Este anúncio não possui URL pública de origem.',true);return;}
  if(!window.confirm('Consultar detalhes individuais (PDP) na GeckoAPI? A operação pode consumir créditos.'))return;
  button.disabled=true;report('Consultando detalhes do anúncio...');
  try{
    const data=await callApi({target:p.source,type:'pdp',url:p.link});
    if(data?.notFound||!data?.data){report('Anúncio não encontrado pelo provedor.',true);return;}
    const extracted=payload(data);
    if(!extracted.items.length)throw new Error('A API não forneceu informações do anúncio.');
    const detail=extracted.items[0];
    // A PDP de alguns portais retorna outro ID; o anúncio original é associado pela URL.
    const idx=records.findIndex(item=>item.key===p.key);
    if(idx<0)throw new Error('Anúncio original não encontrado no comparador.');
    // Entre o clique e a resposta assíncrona o operador pode ter conferido
    // dados: aplicar detalhes sobre a versão MAIS RECENTE da sessão.
    const current=records[idx];
    const merged={...current};
    for(const [key,val] of Object.entries(detail)) {
      if(['id','key','source','link'].includes(key))continue;
      if(val===null||val===undefined||val==='—'||(Array.isArray(val)&&!val.length))continue;
      if(key==='type'&&val==='unknown')continue;
      if(['reviewHistory','manualOverrides','providerSnapshot','reviewImported','providerConflicts'].includes(key))
        continue;
      if(current.manualOverrides?.[key]){
        if(val!==current[key])
          merged.providerConflicts={...(merged.providerConflicts||{}),
            [key]:{providerValue:val,reviewedValue:current[key]}};
        continue;
      }
      merged[key]=val;
    }
    merged.detailed=true;
    records[idx]=merged;
    drawMap(false);refresh();
    report('Consulta PDP concluída. Características disponíveis foram atualizadas. Confira os dados antes de comparar.');
  }catch(e){report(e.message||'Erro ao obter detalhes',true);}
  finally{button.disabled=false;}
}
$('radius').oninput=()=>{$('radius-label').textContent=$('radius').value+' km';if(ring)ring.setRadius(Number($('radius').value)*1000);refresh();};
for(const id of ['in-radius','min-beds','dedupe','result-type','quality-filter','reference-filter','reference-sort','filter-neighborhood','filter-price-min','filter-price-max','filter-area-min','filter-area-max','filter-bathrooms-min','filter-parking-min']){
  $(id).addEventListener('input',refresh);
  $(id).addEventListener('change',refresh);
}
$('export-btn').onclick=()=>{
  const picked=records.filter(p=>selected.has(p.key));if(picked.length<2)return;
  const fields=['source','id','type','offerPurpose','collectedAt','requestId','executionId','searchCriteria','textEvidence','reviewHistory','title','link','price','usable','total','beds','suites','baths','spaces','floors','neighborhood','city','state','lat','lng','approx','advertiser',
    'ref_name','ref_type','ref_city','ref_state','ref_area_used','ref_area_m2','ref_area_tolerance_percent','ref_status','ref_reasons'];
  const derived=p=>{
    const r=referenceProfile,m=assessReference(r,p),land=r&&['land','farm'].includes(r.type);
    return {
      ref_name:r?.name??'',ref_type:r?(r.type==='other'?r.customType:r.type):'',
      ref_city:r?.city??'',ref_state:r?.state??'',
      ref_area_used:r?(land?'total':'usable'):'',
      ref_area_m2:r?(land?r.total:r.usable)??'':'',
      ref_area_tolerance_percent:r?.tolerance??'',ref_status:m?.status??'',
      ref_reasons:m?.issues.join(' | ')??'',
      textEvidence:JSON.stringify(p.textEvidence??[]),
      reviewHistory:JSON.stringify((p.reviewHistory||[]).slice(-60))
    };
  };
  const formulaSensitive=new Set(['source','id','type','offerPurpose','collectedAt','requestId','executionId','searchCriteria','textEvidence','reviewHistory','title','link','neighborhood','city','state','advertiser','ref_name','ref_type','ref_city','ref_state','ref_area_used','ref_status','ref_reasons']);
  const csvValue=(key,value)=>{
    const raw=String(value??'');
    // Protege a abertura do CSV em planilhas contra fórmulas injetadas em
    // títulos, nomes de anunciantes e outros textos vindos dos portais.
    const safeRaw=formulaSensitive.has(key)&&/^[\s]*[=+@-]/.test(raw)?"'"+raw:raw;
    return '"'+safeRaw.replace(/"/g,'""')+'"';
  };
  const cells=fields.join(';')+'\r\n'+picked.map(p=>{const record={...p,...derived(p)};return fields.map(k=>csvValue(k,record[k])).join(';');}).join('\r\n');
  const object=URL.createObjectURL(new Blob(['\ufeff'+cells],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=object;a.download='comparaveis-imovel-busca.csv';a.click();setTimeout(()=>URL.revokeObjectURL(object),1200);
};
$('map-extra').addEventListener('toggle',()=>{
  if(map&&$('map-extra').open){
    // A camada MapLibre inicia enquanto o painel opcional está recolhido.
    map.invalidateSize();
    vectorBasemap?.getMaplibreMap?.()?.resize?.();
    drawMap(false);
  }
});
refresh();
