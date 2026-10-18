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
  const raw=canon([item.realtyType?.name,item.property?.type,item.category,item.propertyType,item.typeLabel,item.title].filter(Boolean).join(' '));
  const match=words=>units.some(u=>words.some(w=>u.includes(w)));
  if(match(['allotment','land','lot'])||/\b(terreno|terrenos|lote|lotes)\b/.test(raw))return 'land';
  if(match(['farm','rural'])||/\b(chacara|chacaras|sitio|sitios|fazenda|fazendas)\b/.test(raw))return 'farm';
  if(match(['penthouse'])||/\b(cobertura|coberturas)\b/.test(raw))return 'penthouse';
  if(match(['warehouse'])||/\b(galpao|galpoes)\b/.test(raw))return 'warehouse';
  if(match(['commercial_room'])||/\b(sala comercial|salas comerciais)\b/.test(raw))return 'commercial_room';
  if(match(['apartment','flat','kitnet'])||/\b(apartamento|apartamentos|studio|kitnet)\b/.test(raw))return 'apartment';
  if(match(['home','house'])||/\b(casa|casas|sobrado|sobrados)\b/.test(raw))return 'house';
  return 'unknown';
}
const typeLabel={house:'Casa',apartment:'Apartamento',land:'Terreno',farm:'Chácara/sítio',penthouse:'Cobertura',warehouse:'Galpão',commercial_room:'Sala comercial',unknown:'A classificar'};
function propValue(item,keys) {
  const all=[...(Array.isArray(item.properties)?item.properties:[]),...(Array.isArray(item.attributes)?item.attributes:[])];
  const matched=all.find(p=>keys.some(t=>canon([p.name,p.label].join(' ')).includes(canon(t))));
  const value=matched?.value;
  if(value===null||value===undefined)return null;
  const cleaned=String(value).replace(/[^\d,.]/g,'').replace(/\./g,'').replace(',','.');
  return cleaned&&Number.isFinite(Number(cleaned))?Number(cleaned):null;
}
const BR_STATES={AC:'acre',AL:'alagoas',AP:'amapa',AM:'amazonas',BA:'bahia',CE:'ceara',DF:'distrito federal',ES:'espirito santo',GO:'goias',MA:'maranhao',MT:'mato grosso',MS:'mato grosso do sul',MG:'minas gerais',PA:'para',PB:'paraiba',PR:'parana',PE:'pernambuco',PI:'piaui',RJ:'rio de janeiro',RN:'rio grande do norte',RS:'rio grande do sul',RO:'rondonia',RR:'roraima',SC:'santa catarina',SP:'sao paulo',SE:'sergipe',TO:'tocantins'};
function uf(v) {const x=canon(v);return Object.keys(BR_STATES).find(k=>canon(k)===x||BR_STATES[k]===x)||'';}
function normalized(item,source) {
  const attr=(!Array.isArray(item.attributes)&&item.attributes)||{};
  const prices=Array.isArray(item.prices)?item.prices.find(p=>p.businessType==='SALE')||item.prices[0]||{}:item.prices||{};
  const area=item.area||{},counts=item.counts||{};
  const address=item.address||item.location||{},geo=item.coordinates||address.coordinates||{};
  const lat=number(address.latitude??geo.latitude??item.latitude);
  const lng=number(address.longitude??geo.longitude??item.longitude);
  const valid=lat!==null&&lng!==null&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&(lat!==0||lng!==0);
  const id=text(item.id||item.listingId||item.externalId||item.listingExternalId||item.adId||item.url);
  const take=(key,fallback)=>number(first(attr[key])??fallback);
  const count=(key,fallback)=>number(counts[key]?.count??fallback);
  const type=classify(item);
  return {
    id,key:source+':'+id,source,type,
    title:text(item.title||item.generatedTitle||item.name||item.metaTitle||'Imóvel sem título'),
    link:url(item.url||item.listingUrl),
    price:number(prices.mainValue??prices.value??prices.rawPrice??prices.price??item.askingPrice??item.price?.amount??item.price),
    usable:take('usableAreas',area.useful??item.property?.usableArea??item.usableArea??item.builtArea??propValue(item,['area util','area privativa','area construida'])),
    total:take('totalAreas',area.total??item.property?.totalArea??item.totalArea??item.landArea??propValue(item,['area total','terreno'])),
    beds:take('bedrooms',count('bedrooms',item.property?.bedrooms??item.bedrooms??propValue(item,['quartos','dormitorios']))),
    suites:take('suites',count('suites',item.property?.suites??item.suites??propValue(item,['suites']))),
    baths:take('bathrooms',count('bathrooms',item.property?.bathrooms??item.bathrooms??propValue(item,['banheiros']))),
    spaces:take('parkingSpaces',count('garages',item.property?.parkingSpaces??item.parkingSpaces??propValue(item,['vagas','garagem']))),
    floors:take('floors',item.floors),
    neighborhood:text(address.neighborhood||item.neighborhood),
    city:text(address.city||item.city),state:uf(address.stateAcronym||address.stateCode||address.state||item.state)||text(address.state||item.state),
    lat:valid?lat:null,lng:valid?lng:null,
    approx:address.isApproximateLocation===true||address.approximate===true||address.publicAddress===false,
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
const validPoint = p => p.lat !== null && p.lng !== null;
function distance(a,b) { if (!a || !validPoint(b)) return null; const rad = Math.PI/180, dLat=(b.lat-a.lat)*rad, dLon=(b.lng-a.lng)*rad; const z = Math.sin(dLat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2; return 12742.018*Math.asin(Math.min(1,Math.sqrt(z))); }
const hasMap = typeof window.L !== 'undefined';
if (hasMap) {
  map = L.map('map', {zoomControl:true}).setView([-23.65,-47.58],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
  layer = L.layerGroup().addTo(map);
  setTimeout(() => map.invalidateSize(),200);
} else {report('Não foi possível carregar o mapa. Confira a conexão e tente novamente.',true);}
function duplicate(p) {
  return records.some(q => q.key !== p.key && p.price !== null && q.price === p.price && p.usable !== null && q.usable === p.usable && p.neighborhood !== '—' && q.neighborhood.toLowerCase() === p.neighborhood.toLowerCase());
}
const valueOf = id => {const v=$(id).value.trim();return v===''?null:Number(v);};
function visibleRecords(){
  const minBeds=Number($('min-beds').value)||0;
  const type=$('result-type').value,neigh=canon($('filter-neighborhood').value.trim());
  const pMin=valueOf('filter-price-min'),pMax=valueOf('filter-price-max');
  const aMin=valueOf('filter-area-min'),aMax=valueOf('filter-area-max');
  const minBaths=valueOf('filter-bathrooms-min'),minSpaces=valueOf('filter-parking-min');
  const onlyRadius=$('in-radius').checked,km=Number($('radius').value);
  return records.filter(p=>{
    if(activeLocation&&(canon(p.city)!==activeLocation.city||canon(p.state)!==activeLocation.state))return false;
    if(type&&p.type!==type)return false;
    if(neigh&&!canon(p.neighborhood).includes(neigh))return false;
    if(minBeds&&(p.beds===null||p.beds<minBeds))return false;
    if(minBaths!==null&&(p.baths===null||p.baths<minBaths))return false;
    if(minSpaces!==null&&(p.spaces===null||p.spaces<minSpaces))return false;
    if(pMin!==null&&(p.price===null||p.price<pMin))return false;
    if(pMax!==null&&(p.price===null||p.price>pMax))return false;
    if(aMin!==null&&(p.usable===null||p.usable<aMin))return false;
    if(aMax!==null&&(p.usable===null||p.usable>aMax))return false;
    if(onlyRadius&&(!validPoint(p)||distance(center,p)>km))return false;
    return true;
  });
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
function renderCards() {
  const box = $('results'); box.replaceChildren();
  const visible = visibleRecords();
  $('filter-status').textContent = visible.length + ' de ' + records.length + ' anúncios visíveis com os filtros atuais.'+(activeLocation?' Município: '+activeLocation.label+'.':'');
  if (!visible.length) {const el=document.createElement('p');el.className='muted';el.textContent='Nenhum anúncio corresponde aos filtros.';box.appendChild(el);}
  for (const p of visible) {
    const card=document.createElement('article'); card.className='listing'+(selected.has(p.key)?' selected':'');
    const dis=distance(center,p), flag=$('dedupe').checked&&duplicate(p);
    card.innerHTML =
      '<div class="row between"><span class="pill">'+safe(p.source)+'</span><span class="muted">'+(validPoint(p)?(p.approx?'📍 Aproximada':'📍 Não certificada'):'Sem coordenadas')+'</span></div>'+
      '<h3>'+safe(p.title)+'</h3><div class="row"><span class="pill orange">'+safe(typeLabel[p.type]||'A classificar')+'</span></div><div class="price">'+safe(money(p.price))+'</div>'+
      '<div class="row"><span class="pill">'+safe(text(p.usable))+' m² úteis</span><span class="pill">'+safe(text(p.beds))+' dorm.</span><span class="pill">'+safe(text(p.suites))+' suítes</span><span class="pill">'+safe(text(p.baths))+' banh.</span><span class="pill">'+safe(text(p.spaces))+' vagas</span></div>'+
      '<div class="muted">'+safe(p.neighborhood)+' · '+safe(p.city)+(dis!==null?' · '+dis.toFixed(1)+' km do centro':'')+'</div>'+
      (flag?'<span class="pill orange">Possível duplicidade — revisar</span>':'')+
      '<div class="row between"><label class="check"><input class="pick" type="checkbox" '+(selected.has(p.key)?'checked':'')+'> Comparar</label>'+(p.link?'<a class="link" target="_blank" rel="noopener noreferrer" href="'+safe(p.link)+'">Ver anúncio ↗</a>':'')+'</div>'+
      (p.link&&['zapimoveis.com.br','olx.com.br','imovelweb.com.br','vivareal.com.br','chavesnamao.com.br'].includes(p.source)?'<button class="detail" type="button">Buscar detalhes (PDP) · pode consumir créditos</button>':'')+
      (p.detailed?'<div class="pill orange">Dados adicionais consultados</div>':'');
    card.querySelector('.pick').onchange = event=>{if(event.target.checked)selected.add(p.key);else selected.delete(p.key);refresh();};
    const details=card.querySelector('.detail');
    if(details)details.onclick=()=>fetchDetails(p,details);
    box.appendChild(card);
  }
  $('loaded').textContent=records.length;$('total').textContent=reported??'—';$('mapped').textContent=records.filter(validPoint).length;$('picked').textContent=selected.size;
  renderMarkers();
}
function renderComparison() {
  const arr=records.filter(p=>selected.has(p.key)), container=$('comparison');$('export-btn').disabled=arr.length<2;
  if(!arr.length){container.textContent='Selecione os anúncios na lista para comparar suas características.';return;}
  const attrs=[['Fonte','source'],['Tipo de imóvel','type'],['Preço pedido','price'],['Área útil','usable'],['Área total','total'],['Dormitórios','beds'],['Suítes','suites'],['Banheiros','baths'],['Vagas','spaces'],['Pavimentos','floors'],['Bairro','neighborhood'],['Anunciante','advertiser'],['Comodidades','amenities']];
  let html='<table><thead><tr><th>Característica</th>'+arr.map(p=>'<th>'+safe(p.title.slice(0,70))+'</th>').join('')+'</tr></thead><tbody>';
  for (const [label,key] of attrs) html+='<tr><th>'+safe(label)+'</th>'+arr.map(p=>'<td>'+safe(key==='price'?money(p.price):key==='type'?(typeLabel[p.type]||'A classificar'):key==='amenities'?(p.amenities.join(', ')||'—'):text(p[key]))+'</td>').join('')+'</tr>';
  container.innerHTML=html+'</tbody></table>';
}
function refresh(){renderCards();renderComparison();}
function load(input) {
  const data=payload(input), known=new Map(records.map((x,i)=>[x.key,i]));
  for (const p of data.items) {
    const idx=known.get(p.key);
    if(idx!==undefined) {
      const prior=records[idx], update={...prior};
      for(const [key,val] of Object.entries(p)) {
        if(val===null||val===undefined||val==='—'||(Array.isArray(val)&&val.length===0))continue;
        if(key==='type'&&val==='unknown'&&prior.type!=='unknown')continue;
        update[key]=val;
      }
      if(input?.data?.type==='pdp')update.detailed=true;
      records[idx]=update;
    } else {
      known.set(p.key,records.length);
      records.push({...p,detailed:input?.data?.type==='pdp'});
    }
  }
  if(data.total!==null)reported=data.total;
  drawMap(true);refresh();
  report('Importação concluída: '+data.items.length+' anúncios nesta consulta e '+records.length+' únicos por ID/fonte na sessão. Dados sujeitos a revisão.');
}
$('import-btn').onclick=()=>{try{activeLocation=null;displayAudit(null);load(JSON.parse($('json-input').value));}catch(e){report(e.message||'JSON inválido',true);}};
$('clear-btn').onclick=()=>{records=[];selected.clear();reported=null;center=null;activeLocation=null;$('location-audit').classList.add('hidden');drawMap(false);refresh();report('Sessão limpa. Nenhum dado foi enviado ao servidor.');};
function tab(which){const api=which==='api';$('import-panel').classList.toggle('hidden',api);$('api-panel').classList.toggle('hidden',!api);$('tab-api').classList.toggle('active',api);$('tab-import').classList.toggle('active',!api);}
$('tab-import').onclick=()=>tab('import');$('tab-api').onclick=()=>tab('api');
const GEO_PORTALS=new Set(['zapimoveis.com.br','vivareal.com.br','chavesnamao.com.br']);
const SORT_OPTIONS={
 'olx.com.br':[['relevance','Relevância'],['date','Mais recentes'],['price','Menor preço'],['biggest_price','Maior preço'],['price_relevance','Preço relevante']],
 'vivareal.com.br':[['relevance','Relevância'],['date','Mais recentes'],['price','Menor preço'],['biggest_price','Maior preço'],['biggest_area','Maior área']],
 'chavesnamao.com.br':[['relevance','Relevância'],['price','Menor preço'],['biggest_price','Maior preço']]
};
function syncForm(){
  const portal=$('portal').value,pdp=$('operation').value==='pdp';
  $('pdp-wrap').classList.toggle('hidden',!pdp);
  const urlEnabled=['olx.com.br','imovelweb.com.br','vivareal.com.br','chavesnamao.com.br'].includes(portal);
  $('search-url-wrap').classList.toggle('hidden',pdp||!urlEnabled);
  $('olx-region-wrap').classList.toggle('hidden',pdp||portal!=='olx.com.br');
  $('olx-category-wrap').classList.toggle('hidden',pdp||portal!=='olx.com.br');
  $('olx-region').disabled=pdp||portal!=='olx.com.br';
  $('olx-category').disabled=pdp||portal!=='olx.com.br';
  for(const id of ['city','state','page','keyword','property-type','neighborhood','price-min','price-max','area-min','area-max','bedrooms-min','bathrooms-min','parking-min','search-near','search-url','business-type','sort']){
    $(id).disabled=pdp;
  }
  $('search-near').disabled=pdp||!GEO_PORTALS.has(portal);
  if(!GEO_PORTALS.has(portal))$('search-near').checked=false;
  const select=$('sort'),prior=select.value;
  select.replaceChildren();
  for(const [value,label] of [['','Padrão do portal'],...(SORT_OPTIONS[portal]||[])]){
    const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);
  }
  select.value=(SORT_OPTIONS[portal]||[]).some(([value])=>value===prior)?prior:'';
  $('provider-hint').textContent=pdp?'Detalhamento de uma URL por vez.':
    portal==='olx.com.br'?'OLX: categoria e região são nativas; cidade e UF também serão conferidas em cada anúncio.':
    portal==='imovelweb.com.br'?'Imovelweb: forneça uma URL de resultados terminada em .html.':
    portal==='zapimoveis.com.br'?'ZAP: tipo, preço, área útil e bairro. Não aceita URL de busca nessa API.':
    'Tipo, preço, área, bairro e URL pública de busca; cidade/UF são auditadas em cada anúncio.';
  $('url-help').textContent=portal==='imovelweb.com.br'?
    'Imovelweb: cole a URL de resultados .html. O site não aceita filtros estruturados nesta API.':
    portal==='olx.com.br'?'OLX: ao usar URL, os filtros e paginação contidos nela prevalecem. Para mudar a página, altere a própria URL.':
    'VivaReal/Chaves: URL opcional; pode preservar os filtros do portal. Cidade/UF continuam verificadas na resposta.';
}
$('operation').onchange=syncForm;
$('portal').onchange=syncForm;
syncForm();
async function callApi(query){
  const response=await fetch('/api/extract',{
    method:'POST',headers:{'Content-Type':'application/json','x-lab-code':$('access').value},
    body:JSON.stringify(query)
  });
  const body=await response.json();
  if(!response.ok)throw new Error(body.error||'Falha na GeckoAPI (HTTP '+response.status+')');
  return body;
}
function validatedNum(id){
  const raw=$(id).value.trim();
  return raw===''?null:Number(raw);
}
function queryFilters(){
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
  const el=$('location-audit');
  if(!a){el.classList.add('hidden');el.textContent='';return;}
  el.classList.remove('hidden');
  el.classList.toggle('error',a.acceptedItems===0);
  el.textContent='Cidade conferida: '+a.requestedCity+'/'+a.requestedState+'. '+
    a.acceptedItems+' de '+a.providerItems+' anúncios desta página pertencem ao município informado. '+
    a.discardedOtherCities+' de outras cidades e '+a.discardedMissingLocation+
    ' sem localização verificável foram descartados. '+
    'Total geral informado pelo portal não significa total válido para esta cidade.';
}
function setActiveLocation(query) {
  const next={city:canon(query.city),state:canon(query.state),label:query.city+'/'+query.state};
  if(!activeLocation||activeLocation.city!==next.city||activeLocation.state!==next.state) {
    records=[];selected.clear();reported=null;center=null;drawMap(false);
  }
  activeLocation=next;
}
$('api-btn').onclick=async()=>{
  const button=$('api-btn');let query;
  try{query=queryFilters();}catch(e){report(e.message,true);return;}
  if(!$('access').value){report('Informe o código de acesso do laboratório, não o token da GeckoAPI.',true);return;}
  if(!window.confirm('Esta consulta à GeckoAPI poderá consumir créditos. Deseja continuar?'))return;
  button.disabled=true;report('Consultando '+query.target+'... Aguarde alguns segundos.');
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
    const merged={...p};
    for(const [key,val] of Object.entries(detail)) {
      if(['id','key','source','link'].includes(key))continue;
      if(val===null||val===undefined||val==='—'||(Array.isArray(val)&&!val.length))continue;
      if(key==='type'&&val==='unknown')continue;
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
for(const id of ['in-radius','min-beds','dedupe','result-type','filter-neighborhood','filter-price-min','filter-price-max','filter-area-min','filter-area-max','filter-bathrooms-min','filter-parking-min']){
  $(id).addEventListener('input',refresh);
  $(id).addEventListener('change',refresh);
}
$('export-btn').onclick=()=>{
  const picked=records.filter(p=>selected.has(p.key));if(picked.length<2)return;
  const fields=['source','id','title','link','price','usable','total','beds','suites','baths','spaces','floors','neighborhood','city','state','lat','lng','approx','advertiser'];
  const cells=fields.join(';')+'\r\n'+picked.map(p=>fields.map(k=>'"'+String(p[k]??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const object=URL.createObjectURL(new Blob(['\ufeff'+cells],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=object;a.download='comparaveis-imovel-busca.csv';a.click();setTimeout(()=>URL.revokeObjectURL(object),1200);
};
refresh();
