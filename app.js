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
  if(match(['commercial_room']))return 'commercial_room';
  if(match(['apartment','flat','kitnet']))return 'apartment';
  if(match(['home','house']))return 'house';
  const identify=raw=>{
    if(!raw)return 'unknown';
    if(/^(casa|casas|sobrado|sobrados)\b/.test(raw))return 'house';
    if(/^(apartamento|apartamentos|studio|kitnet|flat)\b/.test(raw))return 'apartment';
    if(/^(terreno|terrenos|lote|lotes)\b/.test(raw))return 'land';
    if(/^(chacara|chacaras|sitio|sitios|fazenda|fazendas)\b/.test(raw))return 'farm';
    if(/^(cobertura|coberturas)\b/.test(raw))return 'penthouse';
    if(/\b(terreno|terrenos|lote|lotes)\b/.test(raw))return 'land';
    if(/\b(chacara|chacaras|sitio|sitios|fazenda|fazendas)\b/.test(raw))return 'farm';
    if(/\b(cobertura|coberturas)\b/.test(raw))return 'penthouse';
    if(/\b(galpao|galpoes)\b/.test(raw))return 'warehouse';
    if(/\b(sala comercial|salas comerciais)\b/.test(raw))return 'commercial_room';
    if(/\b(apartamento|apartamentos|studio|kitnet)\b/.test(raw))return 'apartment';
    if(/\b(casa|casas|sobrado|sobrados)\b/.test(raw))return 'house';
    return 'unknown';
  };
  const structured=identify(canon([item.realtyType?.name,item.property?.type,item.propertyType,item.typeLabel].filter(Boolean).join(' ')));
  if(structured!=='unknown')return structured;
  // O CSV exportado não tinha coluna de tipo. Quando o próprio link VivaReal
  // informa explicitamente a tipologia, aproveitamos somente esse prefixo.
  const link=url(item.url||item.link||item.listingUrl);
  if(link) {
    const parsed=new URL(link);
    if(/(^|\.)vivareal\.com\.br$/.test(parsed.hostname)) {
      const slug=parsed.pathname.match(/\/imovel\/(casa|sobrado|apartamento|terreno|lote|chacara|sitio|cobertura|galpao|kitnet|flat)(?:-|\/|$)/i)?.[1];
      if(slug) {
        const fromLink=identify(canon(slug));
        if(fromLink!=='unknown')return fromLink;
      }
    }
  }
  return identify(canon([item.category,item.title].filter(Boolean).join(' ')));
}
const typeLabel={house:'Casa',apartment:'Apartamento',land:'Terreno',farm:'Chácara/sítio',penthouse:'Cobertura',warehouse:'Galpão',commercial_room:'Sala comercial',unknown:'A classificar'};
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
    title:bestTitle(item,type,address),
    link:url(item.url||item.listingUrl),
    price:number(prices.mainValue??prices.value??prices.rawPrice??prices.price??item.askingPrice??item.price?.amount??item.price),
    usable:take('usableAreas',area.useful??item.property?.usableArea??item.usableArea??propValue(item,['area util','area privativa'])),
    total:take('totalAreas',area.total??item.property?.totalArea??item.totalArea??item.landArea??propValue(item,['area total','terreno'])),
    beds:take('bedrooms',count('bedrooms',item.property?.bedrooms??item.bedrooms??propValue(item,['quartos','dormitorios']))),
    suites:take('suites',count('suites',item.property?.suites??item.suites??propValue(item,['suites']))),
    baths:take('bathrooms',count('bathrooms',item.property?.bathrooms??item.bathrooms??propValue(item,['banheiros']))),
    spaces:take('parkingSpaces',count('garages',item.property?.parkingSpaces??item.parkingSpaces??propValue(item,['vagas','garagem']))),
    floors:take('floors',item.floors),
    neighborhood:text(address.neighborhood||item.neighborhood),
    city:text(address.city||item.city),state:uf(address.stateAcronym||address.stateCode||address.state||item.stateCode||item.state)||text(address.stateCode||address.state||item.stateCode||item.state),
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
function reviewComparable(p) {
  const missing=[],warnings=[];
  if(p.price===null||!Number.isFinite(p.price)||p.price<=0)missing.push('Preço pedido não informado ou inválido');
  if(p.type==='unknown')missing.push('Tipo de imóvel não identificado');
  const area=p.type==='land'?p.total:p.usable;
  if(area===null||!Number.isFinite(area)||area<=0)
    missing.push(p.type==='land'?'Área do terreno ausente':'Área útil não informada');
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
    unitAreaLabel:p.type==='land'?'m² de terreno':'m² úteis'
  };
}
const qualityLabels={complete:'Dados essenciais completos',review:'Requer conferência',insufficient:'Dados insuficientes'};
function duplicate(p) {
  if(p.type==='unknown'||!p.price||!p.usable||!p.city||!uf(p.state)||!p.neighborhood||p.neighborhood==='—')return false;
  return records.some(q => {
    if(q.key===p.key||q.type!==p.type||!q.price||!q.usable)return false;
    if(canon(q.city)!==canon(p.city)||uf(q.state)!==uf(p.state))return false;
    if(canon(q.neighborhood)!==canon(p.neighborhood)||p.neighborhood==='—')return false;
    if(q.beds!==null&&p.beds!==null&&q.beds!==p.beds)return false;
    const priceDiff=Math.abs(q.price-p.price)/Math.max(q.price,p.price);
    const areaDiff=Math.abs(q.usable-p.usable)/Math.max(q.usable,p.usable);
    return priceDiff<=0.02&&areaDiff<=0.03;
  });
}
const valueOf = id => {const v=$(id).value.trim();return v===''?null:Number(v);};
function visibleRecords(){
  const minBeds=Number($('min-beds').value)||0;
  const type=$('result-type').value,neigh=canon($('filter-neighborhood').value.trim());
  const pMin=valueOf('filter-price-min'),pMax=valueOf('filter-price-max');
  const aMin=valueOf('filter-area-min'),aMax=valueOf('filter-area-max');
  const minBaths=valueOf('filter-bathrooms-min'),minSpaces=valueOf('filter-parking-min');
  const onlyRadius=$('in-radius').checked,km=Number($('radius').value);
  const qualityFilter=$('quality-filter').value;
  return records.filter(p=>{
    if(activeLocation&&(canon(p.city)!==activeLocation.city||canon(p.state)!==activeLocation.state))return false;
    if(type&&p.type!==type)return false;
    if(qualityFilter&&reviewComparable(p).status!==qualityFilter)return false;
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
    const review=reviewComparable(p);
    const reviewClass=review.status==='complete'?'quality-ok':review.status==='review'?'quality-warn':'quality-missing';
    card.innerHTML =
      '<div class="row between"><span class="pill">'+safe(p.source)+'</span><span class="muted">'+(validPoint(p)?(p.approx?'📍 Aproximada':'📍 Não certificada'):'Sem coordenadas')+'</span></div>'+
      '<h3>'+safe(p.title)+'</h3><div class="row"><span class="pill orange">'+safe(typeLabel[p.type]||'A classificar')+'</span><span class="pill '+reviewClass+'">'+safe(qualityLabels[review.status])+'</span></div><div class="price">'+safe(money(p.price))+'</div>'+
      (review.unitPrice!==null?'<div class="muted">'+safe(money(review.unitPrice))+' / '+safe(review.unitAreaLabel)+' (preço pedido)</div>':'')+
      (review.issues.length?'<div class="quality-reasons">'+review.issues.map(x=>'<span>'+safe(x)+'</span>').join('')+'</div>':'')+
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
  $('complete').textContent=records.filter(p=>reviewComparable(p).status==='complete').length;
  $('needs-review').textContent=records.filter(p=>reviewComparable(p).status!=='complete').length;
  renderMarkers();
}
function renderComparison() {
  const arr=records.filter(p=>selected.has(p.key)), container=$('comparison');$('export-btn').disabled=arr.length<2;
  if(!arr.length){container.textContent='Selecione os anúncios na lista para comparar suas características.';return;}
  const attrs=[['Fonte','source'],['Tipo de imóvel','type'],['Triagem dos dados','quality'],['Preço pedido','price'],['R$/m² da área de referência','unitPrice'],['Área útil','usable'],['Área total','total'],['Dormitórios','beds'],['Suítes','suites'],['Banheiros','baths'],['Vagas','spaces'],['Pavimentos','floors'],['Bairro','neighborhood'],['Anunciante','advertiser'],['Comodidades','amenities']];
  let html='<table><thead><tr><th>Característica</th>'+arr.map(p=>'<th>'+safe(p.title.slice(0,70))+'</th>').join('')+'</tr></thead><tbody>';
  for (const [label,key] of attrs) html+='<tr><th>'+safe(label)+'</th>'+arr.map(p=>'<td>'+safe(key==='quality'?qualityLabels[reviewComparable(p).status]:key==='unitPrice'?(reviewComparable(p).unitPrice===null?'—':money(reviewComparable(p).unitPrice)+' / '+reviewComparable(p).unitAreaLabel):key==='price'?money(p.price):key==='type'?(typeLabel[p.type]||'A classificar'):key==='amenities'?(p.amenities.join(', ')||'—'):text(p[key]))+'</td>').join('')+'</tr>';
  const locations=new Set(arr.map(p=>canon(p.city)+'/'+canon(uf(p.state))));
  const types=new Set(arr.map(p=>p.type));
  const cautions=[];
  if(arr.some(p=>reviewComparable(p).status==='insufficient'))cautions.push('Há anúncios sem dados essenciais.');
  if(arr.some(p=>reviewComparable(p).status==='review'))cautions.push('Há atributos que precisam ser conferidos.');
  if(locations.size>1)cautions.push('A seleção contém municípios diferentes.');
  if(types.size>1)cautions.push('A seleção mistura tipos de imóvel.');
  if(arr.some(p=>duplicate(p)))cautions.push('Há possíveis duplicidades na sessão.');
  container.innerHTML=html+'</tbody></table>'+
    '<p class="hint">Triagem preliminar: '+safe(cautions.join(' ')||'Campos essenciais presentes; confirme os anúncios, localização e homogeneidade.')+
    ' Preços anunciados não representam preços efetivos de venda. Nenhuma avaliação ou PTAM é calculado.</p>';
}
function refresh(){renderCards();renderComparison();}
function loadNormalized(items,total=null,detailed=false){
  const known=new Map(records.map((x,i)=>[x.key,i]));
  for (const p of items) {
    const idx=known.get(p.key);
    if(idx!==undefined) {
      const prior=records[idx], update={...prior};
      for(const [key,val] of Object.entries(p)) {
        if(val===null||val===undefined||val==='—'||(Array.isArray(val)&&val.length===0))continue;
        if(key==='type'&&val==='unknown'&&prior.type!=='unknown')continue;
        update[key]=val;
      }
      if(detailed)update.detailed=true;
      records[idx]=update;
    } else {
      known.set(p.key,records.length);
      records.push({...p,detailed});
    }
  }
  if(total!==null)reported=total;
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
    const record={
      source,id:id||link,key:source+':'+(id||link),type,
      title:bestTitle({title:row.title,neighborhood},type,{neighborhood:neighborhood==='—'?'':neighborhood}),
      link,price:number(row.price),usable:number(row.usable),total:number(row.total),
      beds:number(row.beds),suites:number(row.suites),baths:number(row.baths),
      spaces:number(row.spaces),floors:number(row.floors),
      neighborhood,city:row.city?.trim()||'—',
      state:uf(row.state)||row.state?.trim()||'—',
      lat:valid?latitude:null,lng:valid?longitude:null,approx:row.approx?.trim().toLowerCase()==='true',
      advertiser:row.advertiser?.trim()||'—',description:'—',amenities:[],detailed:false
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
$('clear-btn').onclick=()=>{records=[];selected.clear();reported=null;center=null;activeLocation=null;displayAudit(null);drawMap(false);refresh();report('Sessão limpa. Nenhum dado foi enviado ao servidor.');};
function tab(which){const api=which==='api';$('import-panel').classList.toggle('hidden',api);$('api-panel').classList.toggle('hidden',!api);$('tab-api').classList.toggle('active',api);$('tab-import').classList.toggle('active',!api);}
$('tab-import').onclick=()=>tab('import');$('tab-api').onclick=()=>tab('api');
const GEO_PORTALS=new Set(['zapimoveis.com.br','vivareal.com.br','chavesnamao.com.br']);
const SORT_OPTIONS={
 'olx.com.br':[['relevance','Relevância'],['date','Mais recentes'],['price','Menor preço'],['biggest_price','Maior preço'],['price_relevance','Preço relevante']],
 'vivareal.com.br':[['relevance','Relevância'],['date','Mais recentes'],['price','Menor preço'],['biggest_price','Maior preço'],['biggest_area','Maior área']],
 'chavesnamao.com.br':[['relevance','Relevância'],['price','Menor preço'],['biggest_price','Maior preço']]
};
function syncOlxPilotLocation(){
  const isOlx=$('portal').value==='olx.com.br';
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
  $('pdp-wrap').classList.toggle('hidden',!pdp);
  const urlEnabled=['olx.com.br','imovelweb.com.br','vivareal.com.br','chavesnamao.com.br'].includes(portal);
  $('search-url-wrap').classList.toggle('hidden',pdp||!urlEnabled);
  $('olx-region-wrap').classList.toggle('hidden',pdp||portal!=='olx.com.br');
  $('olx-category-wrap').classList.toggle('hidden',pdp||portal!=='olx.com.br');
  $('olx-region').disabled=pdp||portal!=='olx.com.br';
  $('olx-category').disabled=pdp||portal!=='olx.com.br';
  syncOlxPilotLocation();
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
  if(!response.ok)throw new Error(body.error||'Falha na GeckoAPI (HTTP '+response.status+')');
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
for(const id of ['in-radius','min-beds','dedupe','result-type','quality-filter','filter-neighborhood','filter-price-min','filter-price-max','filter-area-min','filter-area-max','filter-bathrooms-min','filter-parking-min']){
  $(id).addEventListener('input',refresh);
  $(id).addEventListener('change',refresh);
}
$('export-btn').onclick=()=>{
  const picked=records.filter(p=>selected.has(p.key));if(picked.length<2)return;
  const fields=['source','id','type','title','link','price','usable','total','beds','suites','baths','spaces','floors','neighborhood','city','state','lat','lng','approx','advertiser'];
  const cells=fields.join(';')+'\r\n'+picked.map(p=>fields.map(k=>'"'+String(p[k]??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const object=URL.createObjectURL(new Blob(['\ufeff'+cells],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=object;a.download='comparaveis-imovel-busca.csv';a.click();setTimeout(()=>URL.revokeObjectURL(object),1200);
};
refresh();
