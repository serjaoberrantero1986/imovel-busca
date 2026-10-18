const $ = id => document.getElementById(id);
const number = value => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const first = value => Array.isArray(value) ? (value.length ? value[0] : null) : value;
const money = value => value === null ? 'Preço não informado' : value.toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const url = value => { try {const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : null} catch {return null;} };
const text = value => value === null || value === undefined || value === '' ? '—' : String(value);
let records = [], selected = new Set(), reported = null, center = null, map = null, ring = null, anchor = null, layer = null;

function canon(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function classify(item) {
  const units=(Array.isArray(item.unitTypes)?item.unitTypes:[]).map(x=>canon(x)),raw=canon([item.category,item.propertyType,item.typeLabel,item.title].filter(Boolean).join(' '));
  const match=t=>units.some(u=>t.some(k=>u.includes(k)));
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
function propValue(item, keys) {
  if(!Array.isArray(item.properties))return null;
  const k=keys.map(canon);
  const found=item.properties.find(p=>k.some(t=>canon([p.name,p.label].join(' ')).includes(t)));
  const v=found?.value;
  if(v===null||v===undefined)return null;
  const m=String(v).match(/[\d.]+(?:,\d+)?/);
  return m?number(m[0].replace(/\./g,'').replace(',','.')):null;
}
function normalized(item,source) {
  const a=item.attributes||{},p=item.prices||{},address=item.address||item.location||{},geo=item.coordinates||{};
  const lat=number(address.latitude??geo.latitude??item.latitude);
  const lng=number(address.longitude??geo.longitude??item.longitude);
  const valid=lat!==null&&lng!==null&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&(lat!==0||lng!==0);
  const listingId=text(item.id||item.listingId||item.externalId||item.listingExternalId||item.url);
  const type=classify(item);
  return {
    id:listingId,key:source+':'+listingId,source,type,
    title:text(item.title||item.name||item.metaTitle||'Imóvel sem título'),
    link:url(item.url||item.listingUrl),
    price:number(p.mainValue??p.price??item.askingPrice??item.price),
    usable:number(first(a.usableAreas)??item.usableArea??item.builtArea??propValue(item,['area util','area privativa','area construida'])),
    total:number(first(a.totalAreas)??item.totalArea??item.landArea??propValue(item,['area total','terreno'])),
    beds:number(first(a.bedrooms)??item.bedrooms??propValue(item,['quartos','dormitorios'])),
    suites:number(first(a.suites)??item.suites??propValue(item,['suites'])),
    baths:number(first(a.bathrooms)??item.bathrooms??propValue(item,['banheiros'])),
    spaces:number(first(a.parkingSpaces)??item.parkingSpaces??propValue(item,['vagas','garagem'])),
    floors:number(first(a.floors)??item.floors),
    neighborhood:text(address.neighborhood||item.neighborhood),
    city:text(address.city||item.city),
    lat:valid?lat:null,lng:valid?lng:null,approx:address.isApproximateLocation!==false,
    amenities:Array.isArray(item.amenities)?item.amenities:[],
    advertiser:text(item.advertiser?.name),description:text(item.description),
    detailed:false
  };
}
function payload(input) {
  const d=input?.data??input;
  const leaf=d?.data&&typeof d.data==='object'&&!Array.isArray(d.data)?d.data:d;
  const arr=Array.isArray(d?.items)?d.items:Array.isArray(d?.results)?d.results:
    d?.item?[d.item]:d?.listing?[d.listing]:d?.property?[d.property]:
    leaf&&(leaf.id||leaf.listingId||leaf.title)?[leaf]:[];
  if(!arr.length)throw new Error(input?.notFound?'Anúncio não encontrado na fonte.':'A consulta não retornou anúncios. Altere os filtros ou o portal.');
  const source=d?.source||d?.target||'Fonte externa';
  return {items:arr.map(x=>normalized(x,source)),total:typeof d?.totalResults==='number'?d.totalResults:null};
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
  const onlyRadius=$('in-radius').checked,km=Number($('radius').value);
  return records.filter(p=>{
    if(type&&p.type!==type)return false;
    if(neigh&&!canon(p.neighborhood).includes(neigh))return false;
    if(minBeds&&(p.beds===null||p.beds<minBeds))return false;
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
  $('filter-status').textContent = visible.length + ' de ' + records.length + ' anúncios visíveis com os filtros atuais.';
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
  const attrs=[['Fonte','source'],['Preço pedido','price'],['Área útil','usable'],['Área total','total'],['Dormitórios','beds'],['Suítes','suites'],['Banheiros','baths'],['Vagas','spaces'],['Pavimentos','floors'],['Bairro','neighborhood'],['Anunciante','advertiser'],['Comodidades','amenities']];
  let html='<table><thead><tr><th>Característica</th>'+arr.map(p=>'<th>'+safe(p.title.slice(0,70))+'</th>').join('')+'</tr></thead><tbody>';
  for (const [label,key] of attrs) html+='<tr><th>'+safe(label)+'</th>'+arr.map(p=>'<td>'+safe(key==='price'?money(p.price):key==='amenities'?(p.amenities.join(', ')||'—'):text(p[key]))+'</td>').join('')+'</tr>';
  container.innerHTML=html+'</tbody></table>';
}
function refresh(){renderCards();renderComparison();}
function load(input) {
  const data=payload(input), known=new Map(records.map((x,i)=>[x.key,i]));
  for (const p of data.items){const idx=known.get(p.key);if(idx!==undefined)records[idx]=p;else{known.set(p.key,records.length);records.push(p);}}
  reported=data.total;drawMap(true);refresh();
  report('Consulta importada: '+data.items.length+' anúncios no lote; '+records.length+' registros nesta sessão. Dados ainda não conferidos.');
}
$('import-btn').onclick=()=>{try{load(JSON.parse($('json-input').value));}catch(e){report(e.message||'JSON inválido',true);}};
$('clear-btn').onclick=()=>{records=[];selected.clear();reported=null;drawMap(true);refresh();report('Sessão limpa. Nenhum dado foi enviado ao servidor.');};
function tab(which){const api=which==='api';$('import-panel').classList.toggle('hidden',api);$('api-panel').classList.toggle('hidden',!api);$('tab-api').classList.toggle('active',api);$('tab-import').classList.toggle('active',!api);}
$('tab-import').onclick=()=>tab('import');$('tab-api').onclick=()=>tab('api');
$('operation').onchange=()=>{const pdp=$('operation').value==='pdp';$('pdp-wrap').classList.toggle('hidden',!pdp);for(const id of ['city','state','page','keyword'])$(id).disabled=pdp;};
$('api-btn').onclick=async()=>{
  const type=$('operation').value, query={target:$('portal').value,type};
  if(type==='pdp')query.url=$('pdp-url').value.trim();
  else {query.city=$('city').value.trim();query.state=$('state').value.trim();query.page=Number($('page').value);query.keyword=$('keyword').value.trim();}
  const button=$('api-btn'); button.disabled=true;report('Consultando a GeckoAPI. Esta operação pode consumir créditos...');
  try{
    const response=await fetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json','x-lab-code':$('access').value},body:JSON.stringify(query)});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error || 'Falha na GeckoAPI (HTTP '+response.status+')');
    load(body);
  }catch(e){report(e.message||'Falha de conexão',true);}finally{button.disabled=false;}
};
$('radius').oninput=()=>{$('radius-label').textContent=$('radius').value+' km';if(ring)ring.setRadius(Number($('radius').value)*1000);renderCards();};
$('in-radius').onchange=renderCards;$('min-beds').oninput=renderCards;$('dedupe').onchange=renderCards;
$('export-btn').onclick=()=>{
  const picked=records.filter(p=>selected.has(p.key));if(picked.length<2)return;
  const fields=['source','id','title','link','price','usable','total','beds','suites','baths','spaces','floors','neighborhood','city','lat','lng','approx','advertiser'];
  const cells=fields.join(';')+'\r\n'+picked.map(p=>fields.map(k=>'"'+String(p[k]??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const object=URL.createObjectURL(new Blob(['\ufeff'+cells],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=object;a.download='comparaveis-imovel-busca.csv';a.click();setTimeout(()=>URL.revokeObjectURL(object),1200);
};
refresh();
