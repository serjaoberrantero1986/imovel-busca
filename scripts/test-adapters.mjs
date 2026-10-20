import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const els=new Map();
function el(id){
  if(!els.has(id))els.set(id,{value:id==='radius'?'5':'',checked:false,disabled:false,innerHTML:'',textContent:'',classList:{toggle(){},add(){},remove(){}},children:[],addEventListener(){},replaceChildren(){this.children=[];},appendChild(item){this.children.push(item);},querySelector(){return {}}});
  return els.get(id);
}
const doc={getElementById:el,createElement(){return {value:'',textContent:'',innerHTML:'',classList:{toggle(){}},querySelector(){return {}},appendChild(){}}}};
const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ctx=runInNewContext(src+';({normalized,payload,classify,canon,uf,parseExportCsv,reviewComparable,duplicate,loadNormalized,records,makeReference,assessReference,referenceTypeFamilies,referenceLabels,visibleRecords,guideAdvice,renderGuidedSummary,selected,computeOfferIndicator,renderOfferIndicator,inferOfferPurpose,setReferenceForTest:reference=>{referenceProfile=reference},planMixedSearch,mixedTargets,executeMixedSearch,performMixedSearch,suspectedCrossPortalRepeat})',{document:doc,window:{},console,URL});
test('VivaReal PLP: preços em array e coordenadas aninhadas',()=>{
  const x=ctx.payload({data:{source:'vivareal.com.br',items:[{
    id:'100',title:'Casa à venda',unitTypes:['HOME'],
    prices:[{businessType:'SALE',value:560000}],
    attributes:{usableAreas:[125],totalAreas:[200],bedrooms:[3],suites:[1],bathrooms:[2],parkingSpaces:[2]},
    address:{city:'Salto de Pirapora',state:'São Paulo',stateAcronym:'SP',coordinates:{latitude:-23.62,longitude:-47.57},approximate:true}
  }]}});
  const p=x.items[0];
  assert.equal(p.price,560000);assert.equal(p.usable,125);assert.equal(p.total,200);
  assert.equal(p.beds,3);assert.equal(p.suites,1);assert.equal(p.type,'house');
  assert.equal(p.lat,-23.62);assert.equal(p.state,'SP');assert.equal(p.approx,true);
});
test('Chaves na Mão PLP: preços, área, contagens e tipo',()=>{
  const x=ctx.payload({source:'chavesnamao.com.br',type:'plp',items:[{
    id:'200',title:'Casa no interior',realtyType:{name:'Casa'},
    prices:{rawPrice:345000},area:{useful:90,total:250},
    counts:{bedrooms:{count:3},bathrooms:{count:2},suites:{count:1},garages:{count:2}},
    address:{city:'Salto de Pirapora',state:'SP',latitude:-23.65,longitude:-47.58,publicAddress:false}
  }]});
  const p=x.items[0];assert.equal(p.price,345000);assert.equal(p.usable,90);
  assert.equal(p.total,250);assert.equal(p.beds,3);assert.equal(p.spaces,2);
  assert.equal(p.type,'house');assert.equal(p.approx,true);
});
test('VivaReal PDP: data.listing com preços em array',()=>{
  const x=ctx.payload({data:{source:'vivareal.com.br',type:'pdp',listing:{
    id:'300',title:'Apartamento',unitTypes:['APARTMENT'],prices:[{value:420000}],
    attributes:{bedrooms:[2],usableAreas:[70]},
    address:{city:'Salto de Pirapora',stateAcronym:'SP'}
  }}});
  assert.equal(x.items[0].price,420000);assert.equal(x.items[0].type,'apartment');
});
test('OLX PDP: atributos em array e localização sem coordenada',()=>{
  const x=ctx.payload({data:{source:'olx.com.br',type:'pdp',data:{
    listingId:'400',title:'Casa com quintal',price:250000,category:'Imóveis',
    attributes:[{name:'quartos',label:'Quartos',value:'3'},{name:'area_total',label:'Área total',value:'175'}],
    location:{city:'Salto de Pirapora',state:'SP',neighborhood:'Centro'}
  }}});
  assert.equal(x.items[0].price,250000);assert.equal(x.items[0].beds,3);
  assert.equal(x.items[0].total,175);assert.equal(x.items[0].lat,null);
});


test('Imovelweb PLP: preço objeto, property e UF via stateCode',()=>{
  const x=ctx.payload({source:'imovelweb.com.br',type:'plp',total:18,items:[{
    id:'500',generatedTitle:'Casa com 2 quartos',price:{amount:298000},
    property:{type:'Casa',totalArea:175,usableArea:93,bedrooms:2,bathrooms:1,suites:0,parkingSpaces:1},
    address:{city:'Salto de Pirapora',state:'São Paulo',stateCode:'SP',latitude:-23.65,longitude:-47.58},
    publisher:{name:'Imobiliária de teste'}
  }]});
  const p=x.items[0];assert.equal(p.price,298000);assert.equal(p.type,'house');
  assert.equal(p.total,175);assert.equal(p.usable,93);assert.equal(p.beds,2);
  assert.equal(p.state,'SP');assert.equal(p.advertiser,'Imobiliária de teste');
  assert.equal(x.total,18);
});
test('Imovelweb PDP: data dentro de envelope, com campos reais do portal',()=>{
  const x=ctx.payload({data:{source:'imovelweb.com.br',type:'pdp',data:{
    id:'600',title:'Apartamento com varanda',price:{amount:450000},
    property:{type:'Apartamento',totalArea:95,usableArea:80,bedrooms:3},
    address:{city:'Salto de Pirapora',state:'SP'}
  }}});
  assert.equal(x.items[0].price,450000);assert.equal(x.items[0].type,'apartment');
  assert.equal(x.items[0].beds,3);
});

test('VivaReal: anúncio sem título usa tipologia e bairro sem inventar detalhes',()=>{
 const x=ctx.payload({data:{source:'vivareal.com.br',items:[{
  id:'2917562934',unitTypes:['HOME'],prices:[{businessType:'SALE',value:385000}],
  attributes:{usableAreas:[120],totalAreas:[125],bedrooms:[3]},
  address:{city:'Salto de Pirapora',stateAcronym:'SP',neighborhood:'São Lucas'}
 }]}});
 assert.equal(x.items[0].title,'Casa • São Lucas');
 assert.equal(x.items[0].usable,120);
 assert.equal(x.items[0].total,125);
});
test('Área construída não deve ser atribuída automaticamente à área útil',()=>{
 const p=ctx.normalized({id:'sem-util',title:'Casa',builtArea:90,landArea:200,address:{city:'Salto de Pirapora',stateCode:'SP'}},'teste');
 assert.equal(p.usable,null);
 assert.equal(p.total,200);
 assert.equal(p.state,'SP');
});

test('Classificação: tipo estruturado e prefixo da URL precedem nome de bairro',()=>{
 const p=ctx.normalized({id:'casa-1',unitTypes:['HOME'],title:'Casa em Chácaras Parque Pirapora',address:{city:'Salto de Pirapora',state:'SP'}},'vivareal.com.br');
 assert.equal(p.type,'house');
 const csv=ctx.parseExportCsv([
  'source;id;title;link;price;usable;total;beds;suites;baths;spaces;floors;neighborhood;city;state;lat;lng;approx;advertiser',
  '"vivareal.com.br";"A1";"Imóvel sem título";"https://www.vivareal.com.br/imovel/casa-2-quartos-chacaras-parque-pirapora-id-A1/";"240000";"119";"155";"2";"1";"2";"2";"0";"Chácaras Parque Pirapora";"Salto de Pirapora";"SP";"";"";"false";"Anunciante"'
 ].join('\r\n'));
 assert.equal(csv.length,1);assert.equal(csv[0].type,'house');
 assert.equal(csv[0].title,'Casa • Chácaras Parque Pirapora');
 assert.equal(csv[0].lat,null);
 assert.equal(ctx.reviewComparable(csv[0]).status,'review');
 assert.equal(ctx.reviewComparable(csv[0]).unitPrice,240000/119);
});
test('CSV legado: aspas e ponto-e-vírgula em campos preservados',()=>{
 const csv=ctx.parseExportCsv([
  'source;id;title;link;price;usable;total;city;state',
  '"vivareal.com.br";"100";"Casa ""ampla""; reformada";"https://www.vivareal.com.br/imovel/casa-id-100/";"300000";"100";"150";"Sorocaba";"SP"'
 ].join('\n'));
 assert.equal(csv[0].title,'Casa "ampla"; reformada');
 assert.equal(csv[0].usable,100);
 assert.equal(csv[0].state,'SP');
});
test('CSV inválido não é aceito silenciosamente',()=>{
 assert.throws(()=>ctx.parseExportCsv('source;id;price\n"vivareal.com.br";"123";"250000"'),/incompatível/);
 assert.throws(()=>ctx.parseExportCsv('source;id;price;usable;total;city;state;link\n"a";"1";"2";"3";"4";"X";"SP";"sem fechar'),/aspas/);
});
test('Triagem: preço e metragem ausentes impedem status de dados completos',()=>{
 const p=ctx.normalized({id:'2',title:'Casa',unitTypes:['HOME'],address:{city:'Salto de Pirapora',state:'SP'}},'olx.com.br');
 const review=ctx.reviewComparable(p);
 assert.equal(review.status,'insufficient');
 assert.ok(review.issues.some(x=>x.includes('Preço pedido')));
 assert.ok(review.issues.some(x=>x.includes('Área útil')));
});
test('Possíveis duplicidades exigem mesmo município, tipologia, bairro, preço e área próximos',()=>{
 ctx.records.length=0;
 const base={id:'1',key:'vivareal.com.br:1',source:'vivareal.com.br',type:'house',price:300000,
   usable:100,beds:3,city:'Salto de Pirapora',state:'SP',neighborhood:'Centro'};
 ctx.records.push({...base});
 const same={...base,key:'zapimoveis.com.br:2',source:'zapimoveis.com.br',price:302000,usable:101};
 assert.equal(ctx.duplicate(same),true);
 assert.equal(ctx.duplicate({...same,city:'Sorocaba'}),false);
 assert.equal(ctx.duplicate({...same,type:'land'}),false);
 assert.equal(ctx.duplicate({...same,neighborhood:'Jardim Alegre'}),false);
 assert.equal(ctx.duplicate({...same,price:350000}),false);
 ctx.records.length=0;
});

test('Normalização: address vazio não esconde localização e coordenadas válidas em location',()=>{
 const p=ctx.normalized({
  id:'local-1',unitTypes:['HOME'],address:{},location:{
   city:'Salto de Pirapora',stateCode:'SP',neighborhood:'Centro',latitude:-23.61,longitude:-47.58,approximate:true
  },prices:{mainValue:300000},attributes:{usableAreas:[100]}
 },'zapimoveis.com.br');
 assert.equal(p.city,'Salto de Pirapora');
 assert.equal(p.state,'SP');
 assert.equal(p.neighborhood,'Centro');
 assert.equal(p.lat,-23.61);
 assert.equal(p.approx,true);
 assert.equal(ctx.reviewComparable(p).status,'review');
});
test('Possível duplicidade de terrenos usa área total, sem criar área útil fictícia',()=>{
 ctx.records.length=0;
 ctx.records.push({
  key:'origem:1',type:'land',price:200000,usable:null,total:250,beds:null,
  city:'Salto de Pirapora',state:'SP',neighborhood:'Centro'
 });
 const maybe={key:'outra:2',type:'land',price:201000,usable:null,total:251,beds:null,
  city:'Salto de Pirapora',state:'SP',neighborhood:'Centro'};
 assert.equal(ctx.duplicate(maybe),true);
 assert.equal(ctx.reviewComparable({...maybe,link:'https://example.com/imovel'}).unitPrice,201000/251);
 ctx.records.length=0;
});

test('Referência: cadastro aceita tipologias residenciais, rurais, comerciais e outras',()=>{
 const base={city:'Salto de Pirapora',state:'SP',usable:120,total:450,tolerance:20};
 const types=['house','two_story_house','condominium','apartment','flat','kitnet','penthouse',
   'land','farm','commercial_room','warehouse','commercial_point'];
 for(const type of types){
   const r=ctx.makeReference({...base,type});
   assert.equal(r.type,type);
   assert.equal(r.city,'Salto de Pirapora');
   assert.equal(r.state,'SP');
 }
 const other=ctx.makeReference({...base,type:'other',customType:'Pousada com lojas'});
 assert.equal(other.customType,'Pousada com lojas');
});
test('Referência: exige município e UF e rejeita números / coordenadas inválidas',()=>{
 const base={price:300000,type:'house',city:'Salto de Pirapora',state:'SP',usable:120,tolerance:20};
 assert.throws(()=>ctx.makeReference({...base,city:''}),/município/i);
 assert.throws(()=>ctx.makeReference({...base,state:'ZZ'}),/município/i);
 assert.throws(()=>ctx.makeReference({...base,type:'other',customType:'X'}),/Descreva/);
 assert.throws(()=>ctx.makeReference({...base,usable:-100}),/Área útil/);
 assert.throws(()=>ctx.makeReference({...base,beds:2.5}),/Dormitórios/);
 assert.throws(()=>ctx.makeReference({...base,tolerance:4}),/tolerância/i);
 assert.throws(()=>ctx.makeReference({...base,tolerance:''}),/tolerância/i);
 assert.throws(()=>ctx.makeReference({...base,lat:-23.5}),/latitude e longitude/i);
 assert.throws(()=>ctx.makeReference({...base,lat:-96,lng:-47}),/coordenadas/i);
 assert.throws(()=>ctx.makeReference({...base,radius:2}),/coordenadas conhecidas/i);
});
test('Comparação preliminar: casa com tipo, área e município aderentes, sem preço calculado',()=>{
 const r=ctx.makeReference({type:'house',city:'Salto de Pirapora',state:'SP',usable:120,
   neighborhood:'São Lucas',beds:3,tolerance:20});
 const ad={price:300000,type:'house',city:'SALTO DE PIRAPÓRA',state:'SP',usable:130,
   neighborhood:'São Lucas',beds:3,suites:null,baths:null,spaces:null,lat:null,lng:null};
 const match=ctx.assessReference(r,ad);
 assert.equal(match.status,'compatible');
 assert.ok(match.positive.some(v=>v.includes('Metragem')));
 assert.ok(!Object.hasOwn(match,'estimatedPrice'));
 assert.ok(match.areaDeviation<9);
 assert.equal(match.distanceKm,null);
});
test('Comparação preliminar: cidade ou tipologia divergente são incompatíveis',()=>{
 const r=ctx.makeReference({type:'house',city:'Salto de Pirapora',state:'SP',usable:120});
 const base={price:300000,type:'house',city:'Salto de Pirapora',state:'SP',usable:120,lat:null,lng:null};
 assert.equal(ctx.assessReference(r,{...base,city:'Sorocaba'}).status,'incompatible');
 assert.equal(ctx.assessReference(r,{...base,state:'PR'}).status,'incompatible');
 assert.equal(ctx.assessReference(r,{...base,type:'land'}).status,'incompatible');
 assert.equal(ctx.assessReference(r,{...base,type:'unknown'}).status,'insufficient');
 assert.equal(ctx.assessReference(r,{...base,city:'—'}).status,'insufficient');
});
test('Comparação preliminar: área ausente não é inferida de área construída ou de terreno',()=>{
 const r=ctx.makeReference({type:'house',city:'Salto de Pirapora',state:'SP',built:160,total:300});
 const p={price:300000,type:'house',city:'Salto de Pirapora',state:'SP',usable:null,built:160,total:300};
 const match=ctx.assessReference(r,p);
 assert.equal(match.status,'insufficient');
 assert.ok(match.issues.some(v=>v.includes('Informe a área útil')));
 const provided=ctx.makeReference({type:'house',city:'Salto de Pirapora',state:'SP',usable:130});
 assert.equal(ctx.assessReference(provided,p).status,'insufficient');
});
test('Comparação preliminar: terrenos e imóveis rurais comparam terreno, não área útil',()=>{
 const ad={price:300000,type:'land',city:'Salto de Pirapora',state:'SP',total:990,usable:null,lat:null,lng:null};
 const r=ctx.makeReference({type:'land',city:'Salto de Pirapora',state:'SP',total:1000});
 assert.equal(ctx.assessReference(r,ad).status,'compatible');
 const farm=ctx.makeReference({type:'farm',city:'Salto de Pirapora',state:'SP',total:20000});
 assert.equal(ctx.assessReference(farm,{...ad,type:'farm',total:22000}).status,'compatible');
 assert.equal(ctx.assessReference(farm,{...ad,type:'farm',total:null}).status,'insufficient');
});
test('Comparação preliminar: diferenças de metragem e subtipo geram revisão, não nota fictícia',()=>{
 const r=ctx.makeReference({type:'kitnet',city:'Salto de Pirapora',state:'SP',usable:40});
 const ad={price:300000,type:'apartment',city:'Salto de Pirapora',state:'SP',usable:41,lat:null,lng:null};
 assert.equal(ctx.assessReference(r,ad).status,'review');
 assert.equal(ctx.assessReference(r,{...ad,usable:120}).status,'review');
 const condo=ctx.makeReference({type:'condominium',city:'Salto de Pirapora',state:'SP',usable:100});
 assert.equal(ctx.assessReference(condo,{...ad,type:'house',usable:105}).status,'review');
 const other=ctx.makeReference({type:'other',customType:'Pousada',city:'Salto de Pirapora',state:'SP',usable:100});
 assert.equal(ctx.assessReference(other,{...ad,usable:100}).status,'insufficient');
});
test('Comparação geográfica: distância só calculada com coordenadas e raio escolhido',()=>{
 const r=ctx.makeReference({type:'house',city:'Salto de Pirapora',state:'SP',usable:120,
   lat:-23.65,lng:-47.58,radius:3,tolerance:20});
 const ad={price:300000,type:'house',city:'Salto de Pirapora',state:'SP',usable:120,
   lat:-23.65,lng:-47.58,approx:false};
 const m=ctx.assessReference(r,ad);
 assert.equal(m.status,'compatible');assert.equal(m.distanceKm,0);
 assert.equal(ctx.assessReference(r,{...ad,lat:null,lng:null}).status,'insufficient');
 assert.equal(ctx.assessReference(r,{...ad,lat:-23.3,lng:-47.58}).status,'review');
 assert.equal(ctx.assessReference(r,{...ad,approx:true}).status,'review');
});
test('Classificação de fornecedores: não misturar flats, kitnets e sobrados com tipo principal',()=>{
 assert.equal(ctx.classify({unitTypes:['FLAT']}),'flat');
 assert.equal(ctx.classify({unitTypes:['KITNET']}),'kitnet');
 assert.equal(ctx.classify({unitTypes:['TWO_STORY_HOUSE']}),'two_story_house');
 assert.equal(ctx.classify({property:{type:'Ponto comercial'}}),'commercial_point');
 assert.equal(ctx.classify({title:'Casa em Chácaras Parque Pirapora'}),'house');
});

test('Interface: salvar referência reclassifica registros, filtra e limpa sem descartar anúncios',()=>{
 ctx.records.length=0;
 const source='vivareal.com.br';
 const same=ctx.normalized({
   id:'reference-ui-1',unitTypes:['HOME'],title:'Casa de teste',
   address:{city:'Salto de Pirapora',stateAcronym:'SP'},
   attributes:{usableAreas:[120]},prices:[{businessType:'SALE',value:300000}]
 },source);
 const other=ctx.normalized({
   id:'reference-ui-2',unitTypes:['HOME'],title:'Casa em outro município',
   address:{city:'Sorocaba',stateAcronym:'SP'},
   attributes:{usableAreas:[120]},prices:[{businessType:'SALE',value:300000}]
 },source);
 ctx.loadNormalized([same,other]);
 el('ref-name').value='Casa referencial';
 el('ref-type').value='house';
 el('ref-city').value='Salto de Pirapora';
 el('ref-state').value='SP';
 el('ref-usable').value='120';
 el('ref-tolerance').value='20';
 el('reference-save').onclick();
 assert.match(el('ref-summary').textContent,/Casa referencial/);
 assert.equal(el('reference-filter').disabled,false);
 el('reference-filter').value='compatible';
 assert.deepEqual(Array.from(ctx.visibleRecords(),p=>p.id),['reference-ui-1']);
 el('reference-filter').value='incompatible';
 assert.deepEqual(Array.from(ctx.visibleRecords(),p=>p.id),['reference-ui-2']);
 el('reference-clear').onclick();
 assert.equal(el('reference-filter').disabled,true);
 assert.equal(ctx.visibleRecords().length,2);
 ctx.records.length=0;
});

test('Comparação preliminar: anúncio sem preço não recebe status de aderente',()=>{
 const r=ctx.makeReference({type:'house',city:'Salto de Pirapora',state:'SP',usable:120});
 const m=ctx.assessReference(r,{
   type:'house',city:'Salto de Pirapora',state:'SP',usable:120,price:null,lat:null,lng:null
 });
 assert.equal(m.status,'insufficient');
 assert.ok(m.issues.some(v=>v.includes('preço pedido')));
});
test('Códigos estruturados de tipologia são respeitados',()=>{
 assert.equal(ctx.classify({propertyType:'commercial_point'}),'commercial_point');
 assert.equal(ctx.classify({propertyType:'two_story_house'}),'two_story_house');
 assert.equal(ctx.classify({propertyType:'condominium'}),'condominium');
});

test('Filtro local de área em terreno utiliza área total, nunca inventa área útil',()=>{
 ctx.records.length=0;
 const terrain=ctx.normalized({id:'area-land',unitTypes:['ALLOTMENT_LAND'],
  prices:{mainValue:200000},attributes:{totalAreas:[250]},
  address:{city:'Salto de Pirapora',state:'SP'}},'zapimoveis.com.br');
 const house=ctx.normalized({id:'area-house',unitTypes:['HOME'],
  prices:{mainValue:320000},attributes:{usableAreas:[90],totalAreas:[350]},
  address:{city:'Salto de Pirapora',state:'SP'}},'zapimoveis.com.br');
 ctx.loadNormalized([terrain,house]);
 el('filter-area-min').value='200';
 assert.deepEqual(Array.from(ctx.visibleRecords(),p=>p.id),['area-land']);
 el('filter-area-min').value='';
 ctx.records.length=0;
});

test('Orientação de avaliação: informa de modo simples que falta metragem da referência',()=>{
 const r=ctx.makeReference({name:'Casa Ana Guilherme',type:'house',city:'Salto de Pirapora',state:'SP',
  beds:3,suites:1,baths:2,spaces:2,tolerance:20});
 const ads=[{id:'1',title:'Casa no Parque Pirapora',type:'house',price:240000,usable:119,
   beds:2,suites:1,baths:2,spaces:2,city:'Salto de Pirapora',state:'SP',lat:null,lng:null}];
 const advice=ctx.guideAdvice(r,ads,ads);
 assert.equal(advice.level,'important');
 assert.match(advice.message,/área útil/);
 assert.match(advice.message,/Casa Ana Guilherme/);
 assert.match(advice.message,/Volte à etapa 1/);
});
test('Orientação: avança da referência para importação e escolha de dois anúncios',()=>{
 const r=ctx.makeReference({type:'land',city:'Salto de Pirapora',state:'SP',total:250});
 const ad={price:200000,type:'land',total:250,city:'Salto de Pirapora',state:'SP',lat:null,lng:null};
 assert.match(ctx.guideAdvice(r,[],[]).message,/CSV/);
 assert.match(ctx.guideAdvice(r,[ad],[]).message,/dois anúncios/);
 assert.match(ctx.guideAdvice(r,[ad],[ad]).message,/mais um/);
 assert.match(ctx.guideAdvice(r,[ad,ad],[ad,ad]).message,/Confira o indicativo preliminar/);
});
test('Resumo guiado: exibe motivos reais de anúncios selecionados sem gerar valor de mercado',()=>{
 ctx.records.length=0;ctx.selected.clear();
 const ad={id:'1',key:'viva:1',source:'vivareal.com.br',type:'house',title:'Casa · Jardim São Carlos',
  link:null,price:270000,usable:100,total:261,beds:2,suites:1,baths:2,spaces:4,
  city:'Salto de Pirapora',state:'SP',neighborhood:'Jardim São Carlos',lat:null,lng:null,
  approx:false,amenities:[],advertiser:'—',detailed:false};
 const ad2={...ad,id:'2',key:'viva:2',title:'Casa · São Lucas',price:385000,usable:120,beds:3,suites:3};
 ctx.records.push(ad,ad2);
 ctx.selected.add(ad.key);ctx.selected.add(ad2.key);
 el('ref-name').value='Casa Ana Guilherme';
 el('ref-type').value='house';
 el('ref-city').value='Salto de Pirapora';
 el('ref-state').value='SP';
 el('ref-usable').value='';
 el('ref-beds').value='3';
 el('ref-suites').value='1';
 el('ref-baths').value='2';
 el('ref-spaces').value='2';
 el('ref-tolerance').value='20';
 el('reference-save').onclick();
 ctx.renderGuidedSummary();
 assert.match(el('guided-summary').innerHTML,/Casa Ana Guilherme/);
 assert.match(el('guided-summary').innerHTML,/Falta um dado essencial/);
 assert.match(el('guided-summary').innerHTML,/270/);
 assert.match(el('guided-summary').innerHTML,/385/);
 assert.match(el('guided-summary').innerHTML,/dormitórios/);
 assert.doesNotMatch(el('guided-summary').innerHTML,/valor estimado: R\$/i);
 el('ref-usable').value='115';
 el('reference-save').onclick();
 ctx.renderGuidedSummary();
 assert.doesNotMatch(el('guided-summary').innerHTML,/Falta um dado essencial/);
 ctx.selected.clear();ctx.records.length=0;
 el('reference-clear').onclick();
});

test('Interface simplificada: referência, arquivo e resultado seguem três passos claros',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const pos=['id="reference-panel"','id="csv-file"','id="guided-summary"','id="results"'].map(value=>html.indexOf(value));
 assert.ok(pos.every(value=>value>=0), 'Todos os controles do fluxo devem existir');
 assert.ok(pos.every((value,i)=>i===0||value>pos[i-1]),'A referência precede a importação e o resultado');
 for(const id of ['map-extra','comparison-extra','technical-status','quality-filter','csv-import-btn','export-btn'])
   assert.match(html,new RegExp('id="'+id+'"'),'Controle '+id+' deve continuar disponível');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(ids.length,new Set(ids).size,'Elementos com id duplicado impediriam os controles de funcionar');
 assert.match(html,/<details[^>]*id="map-extra"/);
 assert.match(html,/<details[^>]*id="comparison-extra"/);
 assert.match(html,/1\. Descreva o imóvel/);
 assert.match(html,/2\. Adicione anúncios semelhantes/);
 assert.match(html,/3\. Veja seu indicativo de valor/);
});


test('Mapa: usa OpenFreeMap em vez de tiles OSM bloqueados e mantém integração Leaflet',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/maplibre-gl@5\.8\.0\/dist\/maplibre-gl\.js/);
  assert.match(html,/@maplibre\/maplibre-gl-leaflet@0\.0\.22\/leaflet-maplibre-gl\.js/);
  assert.match(html,/id="map-error"/);
  assert.doesNotMatch(html,/tile\.openstreetmap\.org/);
  assert.doesNotMatch(src,/tile\.openstreetmap\.org/);
  let style=null,credit='',events=[];
  const fakeMap={
    attributionControl:{addAttribution(v){credit=v;}},
    setView(){return this;},on(){return this;},invalidateSize(){},removeLayer(){},
    fitBounds(){return this;}
  };
  const L={
    map(){return fakeMap;},
    maplibreGL(config){style=config.style;return {
      addTo(){return this;},
      getMaplibreMap(){return {on(name,cb){events.push(name);}};}
    };},
    layerGroup(){return {addTo(){return this;},clearLayers(){}}}
  };
  const loaded=runInNewContext(src+';({map,BASEMAP_STYLE,layer,center})',{
    document:doc,L,window:{L,maplibregl:{}},console,URL,
    setTimeout(){},fetch(){}
  });
  assert.equal(loaded.map,fakeMap);
  assert.equal(loaded.BASEMAP_STYLE,'https://tiles.openfreemap.org/styles/positron');
  assert.equal(style,loaded.BASEMAP_STYLE);
  assert.match(credit,/OpenStreetMap contributors/);
  assert.match(credit,/OpenMapTiles/);
  assert.match(credit,/OpenFreeMap/);
  assert.ok(events.includes('error'));
  assert.ok(loaded.layer);
});

test('Mapa: falta do plugin não deve impedir a lista de comparáveis',()=>{
  let warned=false;
  const L={
    map(){return {setView(){return this;},attributionControl:{addAttribution(){}},on(){},invalidateSize(){}};},
    layerGroup(){return {addTo(){return this;},clearLayers(){}}}
  };
  const localEl=id=>({
    ...el(id),
    classList:{toggle(){},add(){},remove(){if(id==='map-error')warned=true;}},
    addEventListener(){},removeAttribute(){}
  });
  const elements=new Map();
  const localDoc={
    getElementById(id){if(!elements.has(id))elements.set(id,localEl(id));return elements.get(id);},
    createElement:doc.createElement
  };
  const app=runInNewContext(src+';({records,visibleRecords})',{
    document:localDoc,L,window:{L},console,URL,setTimeout(){}
  });
  assert.equal(app.visibleRecords().length,0);
  assert.equal(warned,true);
});


test('Estimativa instantânea: Casa Ana Guilherme e três anúncios reais do CSV',()=>{
 const r=ctx.makeReference({name:'Casa Ana Guilherme',type:'house',city:'Salto de Pirapora',
   state:'SP',usable:110,beds:3,suites:1,baths:2,spaces:2,tolerance:20});
 const source='vivareal.com.br';
 const rows=[
   ['2915563837','Casa • Chácaras Parque Pirapora',240000,119,2,1,2,2,'Chácaras Parque Pirapora'],
   ['2917942713','Casa • Jardim Sao Carlos',270000,100,2,1,2,4,'Jardim Sao Carlos'],
   ['2917562934','Casa • São Lucas',385000,120,3,3,3,1,'São Lucas']
 ].map(([id,title,price,usable,beds,suites,baths,spaces,neighborhood])=>({
   key:source+':'+id,id,source,title,type:'house',price,usable,
   city:'Salto de Pirapora',state:'SP',beds,suites,baths,spaces,neighborhood,lat:null,lng:null
 }));
 const indicator=ctx.computeOfferIndicator(r,rows);
 assert.equal(indicator.status,'ready');
 assert.equal(indicator.selectedCount,3);
 assert.equal(indicator.included.length,3);
 assert.equal(indicator.excluded.length,0);
 assert.equal(indicator.area,110);
 assert.equal(indicator.unitMedian,2700);
 assert.equal(indicator.value,297000);
 assert.ok(Math.abs(indicator.low-221848.73949)<0.01);
 assert.ok(Math.abs(indicator.high-352916.6667)<0.01);
 assert.match(indicator.reliability,/Baixa/);
 assert.ok(indicator.reasons.some(msg=>msg.includes('não foram ajustadas')));
 assert.ok(indicator.reasons.some(msg=>msg.includes('30%')));
 assert.ok(!Object.hasOwn(indicator,'ptam'));
 assert.ok(!Object.hasOwn(indicator,'marketValue'));
});
test('Estimativa instantânea: número não aparece sem referência, área ou duas amostras',()=>{
 const r=ctx.makeReference({type:'house',city:'Salto de Pirapora',state:'SP',usable:110});
 const ad={key:'test:1',source:'test',id:'1',type:'house',price:250000,usable:110,city:'Salto de Pirapora',state:'SP'};
 assert.equal(ctx.computeOfferIndicator(null,[ad,ad]).value,null);
 assert.equal(ctx.computeOfferIndicator({...r,usable:null},[ad,ad]).value,null);
 assert.equal(ctx.computeOfferIndicator(r,[ad]).value,null);
 assert.equal(ctx.computeOfferIndicator(r,[]).status,'unavailable');
});
test('Estimativa instantânea: exclui outro município, tipologia e áreas fora da faixa',()=>{
 const r=ctx.makeReference({type:'house',city:'Salto de Pirapora',state:'SP',usable:100,tolerance:20});
 const base={type:'house',city:'Salto de Pirapora',state:'SP',price:200000,usable:100,
   neighborhood:'Centro',lat:null,lng:null,source:'portal'};
 const rows=[
   {...base,id:'ok',key:'portal:ok'},
   {...base,id:'same',key:'portal:same',price:220000},
   {...base,id:'wrongcity',key:'portal:wrongcity',city:'Sorocaba'},
   {...base,id:'wrongtype',key:'portal:wrongtype',type:'land'},
   {...base,id:'badarea',key:'portal:badarea',usable:200},
   {...base,id:'missingprice',key:'portal:missingprice',price:null},
   {...base,id:'missingarea',key:'portal:missingarea',usable:null}
 ];
 const indicator=ctx.computeOfferIndicator(r,rows);
 assert.equal(indicator.included.length,2);
 assert.equal(indicator.excluded.length,5);
 assert.equal(indicator.value,210000);
 assert.equal(indicator.status,'ready');
});
test('Estimativa instantânea: ignora duplicidade exata e não duplica valores',()=>{
 const r=ctx.makeReference({type:'land',city:'Salto de Pirapora',state:'SP',total:250,tolerance:20});
 const source='portal';
 const rows=[
  {key:'portal:1',source,id:'1',type:'land',price:200000,total:250,city:'Salto de Pirapora',state:'SP'},
  {key:'portal:1-again',source,id:'1',type:'land',price:200000,total:250,city:'Salto de Pirapora',state:'SP'},
  {key:'portal:2',source,id:'2',type:'land',price:220000,total:250,city:'Salto de Pirapora',state:'SP'}
 ];
 const indicator=ctx.computeOfferIndicator(r,rows);
 assert.equal(indicator.included.length,2);
 assert.equal(indicator.excluded.length,1);
 assert.equal(indicator.value,210000);
 assert.equal(indicator.areaLabel,'área de terreno');
});
test('Estimativa instantânea: tipologia desconhecida não é presumida como equivalente',()=>{
 const r=ctx.makeReference({type:'other',customType:'Pousada',city:'Salto de Pirapora',state:'SP',usable:110});
 const p={type:'other',price:300000,usable:110,city:'Salto de Pirapora',state:'SP'};
 const estimate=ctx.computeOfferIndicator(r,[p,p]);
 assert.equal(estimate.status,'unavailable');
 assert.match(estimate.reasons.join(' '),/manualmente/);
});
test('Painel de valor responde à seleção sem exigir exportação CSV',()=>{
 ctx.records.length=0;ctx.selected.clear();
 const records=[
  {key:'viva:1',id:'1',source:'vivareal.com.br',title:'Casa 1',type:'house',
   price:240000,usable:100,city:'Salto de Pirapora',state:'SP',lat:null,lng:null,amenities:[],
   neighborhood:'Centro'},
  {key:'viva:2',id:'2',source:'vivareal.com.br',title:'Casa 2',type:'house',
   price:300000,usable:120,city:'Salto de Pirapora',state:'SP',lat:null,lng:null,amenities:[],
   neighborhood:'Centro'}
 ];
 ctx.records.push(...records);
 // Outros testes inicializam instâncias isoladas do app com o mesmo mock de DOM.
 // A referência é atribuída à própria instância sob teste, não a um onclick sobreposto.
 const ref=ctx.makeReference({name:'Casa Ana Guilherme',type:'house',
   city:'Salto de Pirapora',state:'SP',usable:110,tolerance:20});
 ctx.setReferenceForTest(ref);
 ctx.renderOfferIndicator();
 assert.match(el('offer-indicator').innerHTML,/Selecione pelo menos dois/);
 ctx.selected.add('viva:1');ctx.selected.add('viva:2');
 ctx.renderOfferIndicator();
 assert.match(el('offer-indicator').innerHTML,/R\$\s270\.000/);
 assert.match(el('offer-indicator').innerHTML,/Como este número foi calculado/);
 assert.match(el('offer-indicator').innerHTML,/não um valor de avaliação/);
 ctx.selected.clear();ctx.records.length=0;
 ctx.setReferenceForTest(null);
});


test('Indicativo de venda não confunde anúncio de aluguel com preço de comercialização',()=>{
 const ref=ctx.makeReference({type:'house',city:'Salto de Pirapora',state:'SP',usable:100});
 const ads=[
  {key:'sale:1',source:'vivareal.com.br',id:'s1',type:'house',price:250000,usable:100,
    link:'https://www.vivareal.com.br/imovel/casa-100m2-venda-RS250000-id-1/',
    city:'Salto de Pirapora',state:'SP'},
  {key:'sale:2',source:'vivareal.com.br',id:'s2',type:'house',price:300000,usable:100,
    link:'https://www.vivareal.com.br/imovel/casa-100m2-venda-RS300000-id-2/',
    city:'Salto de Pirapora',state:'SP'},
  {key:'rent:3',source:'vivareal.com.br',id:'r3',type:'house',price:1800,usable:100,
    link:'https://www.vivareal.com.br/imovel/casa-100m2-aluguel-RS1800-id-3/',
    city:'Salto de Pirapora',state:'SP'}
 ];
 assert.equal(ctx.inferOfferPurpose(ads[0]),'sale');
 assert.equal(ctx.inferOfferPurpose(ads[2]),'rent');
 const result=ctx.computeOfferIndicator(ref,ads);
 assert.equal(result.included.length,2);
 assert.equal(result.excluded.length,1);
 assert.match(result.excluded[0].reason,/locação/);
 assert.equal(result.value,275000);
 assert.equal(ctx.inferOfferPurpose({prices:[],offerPurpose:'rent'}),'rent');
 assert.equal(ctx.inferOfferPurpose({prices:[],businessType:'sale'}),'sale');
});
test('CSV de comparáveis mantém finalidade de venda quando disponível, sem inventar quando ausente',()=>{
 const cols='source;id;type;title;link;price;usable;total;city;state';
 const rows=[
  '"vivareal.com.br";"1";"house";"Casa 1";"https://www.vivareal.com.br/imovel/casa-100m2-venda-RS300000-id-1/";"300000";"100";"120";"Salto de Pirapora";"SP"',
  '"vivareal.com.br";"2";"house";"Casa 2";"https://www.vivareal.com.br/imovel/casa-100m2-aluguel-RS2000-id-2/";"2000";"100";"120";"Salto de Pirapora";"SP"',
  '"vivareal.com.br";"3";"house";"Casa 3";"";"310000";"100";"120";"Salto de Pirapora";"SP"'
 ];
 const parsed=ctx.parseExportCsv([cols,...rows].join('\n'));
 assert.equal(parsed[0].offerPurpose,'sale');
 assert.equal(parsed[1].offerPurpose,'rent');
 assert.equal(parsed[2].offerPurpose,'unknown');
});
test('Interface mostra indicativo como informação principal e CSV apenas opcional',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const indicative=html.indexOf('id="offer-indicator"');
 const guide=html.indexOf('id="guided-summary"');
 const exportButton=html.indexOf('id="export-btn"');
 assert.ok(indicative>0&&guide>indicative&&exportButton>guide);
 assert.match(html,/Exportar CSV \(opcional\)/);
 assert.match(html,/não precisa exportar um arquivo/i);
});


test('Pesquisa multifonte: uma, quatro ou cinco fontes; URLs e filtros respeitados por portal',()=>{
 const base={target:'zapimoveis.com.br',type:'plp',city:'Salto de Pirapora',state:'SP',
   page:1,propertyType:'house',businessType:'sale',keyword:'casa',
   areaMin:80,areaMax:160,priceMin:250000,sort:'relevance',
   searchNear:true,latitude:-23.65,longitude:-47.58,
   url:'https://www.vivareal.com.br/imoveis/'};
 const ordinary=['zapimoveis.com.br','vivareal.com.br','olx.com.br','chavesnamao.com.br'];
 const plans=ctx.planMixedSearch(base,ordinary,{olxRegion:'Regiao de Sorocaba',olxCategory:'imoveis/venda/casas'});
 assert.equal(plans.length,4);
 assert.equal(plans.every(p=>p.type==='plp'&&p.page===1&&p.city==='Salto de Pirapora'),true);
 assert.equal(plans.every(p=>p.url===undefined&&p.sort===undefined),true);
 assert.equal(plans[0].searchNear,true);
 assert.equal(plans[1].searchNear,true);
 assert.equal(plans[2].searchNear,undefined);
 assert.equal(plans[2].categoryPath,'imoveis/venda/casas');
 assert.equal(plans[2].region,'Regiao de Sorocaba');
 assert.equal(plans[3].searchNear,true);
 assert.equal(plans[0].priceMin,250000);
 assert.equal(ctx.planMixedSearch(base,['olx.com.br']).length,1);
 assert.throws(()=>ctx.planMixedSearch(base,[]),/Selecione/);
 assert.throws(()=>ctx.planMixedSearch({...base,type:'pdp'},ordinary),/listas de anúncios/);
 assert.throws(()=>ctx.planMixedSearch(base,['olx.com.br','olx.com.br']),/repetida/);
 assert.throws(()=>ctx.planMixedSearch(base,['olx.com.br','portal-falso']),/inválida/);
 assert.throws(()=>ctx.planMixedSearch(base,['imovelweb.com.br']),/URL pública/);
 assert.throws(()=>ctx.planMixedSearch(base,['imovelweb.com.br'],
   {imovelwebUrl:'https://www.zapimoveis.com.br/imoveis/casas.html'}),/Imovelweb exige/);
 assert.throws(()=>ctx.planMixedSearch(base,['imovelweb.com.br'],
   {imovelwebUrl:'http://www.imovelweb.com.br/casas.html'}),/Imovelweb exige/);
 assert.throws(()=>ctx.planMixedSearch(base,['imovelweb.com.br'],
   {imovelwebUrl:'https://www.imovelweb.com.br/imoveis/casas/'}),/Imovelweb exige/);
 const all=ctx.planMixedSearch(base,[...ordinary,'imovelweb.com.br'],
   {imovelwebUrl:'https://www.imovelweb.com.br/casas-venda-salto-de-pirapora-sp.html'});
 assert.equal(all.length,5);
 assert.equal(all[4].url,'https://www.imovelweb.com.br/casas-venda-salto-de-pirapora-sp.html');
 assert.equal(all[4].propertyType,'house');
 assert.equal(all[4].searchNear,undefined);
});

test('Interface multifonte seleciona quatro fontes sem URL ou todas com orientação de custo',()=>{
 el('operation').value='plp';
 el('portal').value='zapimoveis.com.br';
 el('mixed-enabled').checked=true;
 el('mixed-select-structured').onclick();
 assert.equal(ctx.mixedTargets().length,4);
 assert.equal(ctx.mixedTargets().includes('imovelweb.com.br'),false);
 assert.equal(el('mixed-picker').classList!==undefined,true);
 assert.match(el('mixed-cost').textContent,/4 consulta/);
 el('mixed-select-all').onclick();
 assert.equal(ctx.mixedTargets().length,5);
 assert.match(el('mixed-cost').textContent,/5 consulta/);
 el('mixed-select-none').onclick();
 assert.equal(ctx.mixedTargets().length,0);
 el('mixed-enabled').checked=false;
 el('operation').value='';
});

test('Execução multifonte mantém origem, cidade auditada, erros isolados e uma chamada por fonte',async()=>{
 const targets=['zapimoveis.com.br','olx.com.br','vivareal.com.br'];
 const plans=ctx.planMixedSearch({
   target:'zapimoveis.com.br',type:'plp',city:'Salto de Pirapora',state:'SP',page:1,businessType:'sale'
 },targets);
 const called=[],states=[];
 const res=await ctx.executeMixedSearch(plans,async query=>{
   called.push(query.target);
   if(query.target==='olx.com.br')throw new Error('Não foi possível consultar OLX');
   return {data:{source:'fonte-incorreta',items:[
     {id:query.target+'-ok',unitTypes:['HOME'],title:'Casa de teste',
       address:{city:'Salto de Pirapora',state:'SP'},prices:{mainValue:300000},attributes:{usableAreas:[110]}},
     {id:query.target+'-other',unitTypes:['HOME'],title:'Casa fora do município',
       address:{city:'Sorocaba',state:'SP'},prices:{mainValue:300000},attributes:{usableAreas:[110]}}
   ],locationAudit:{providerItems:2,acceptedItems:1,discardedOtherCities:1,requestId:'q-'+query.target}}};
 },updates=>states.push(Array.from(updates,r=>r.state).join(',')));
 assert.deepEqual(called,targets);
 assert.equal(states.at(-1),'done,error,done');
 assert.equal(res[0].items.length,1);
 assert.equal(res[0].items[0].source,targets[0]);
 assert.equal(res[0].items[0].requestId,'q-'+targets[0]);
 assert.equal(res[0].items[0].collectedAt.endsWith('Z'),true);
 assert.equal(res[0].discarded,1);
 assert.equal(res[1].state,'error');
 assert.match(res[1].error,/OLX/);
 assert.equal(res[2].items.length,1);
});
test('Execução multifonte interrompe próximas chamadas ao receber HTTP 429',async()=>{
 const plans=ctx.planMixedSearch({target:'zapimoveis.com.br',type:'plp',
   city:'Salto de Pirapora',state:'SP'},
   ['zapimoveis.com.br','vivareal.com.br','olx.com.br']);
 let calls=0;
 const results=await ctx.executeMixedSearch(plans,async()=>{
   calls++;
   const error=new Error('Limite atingido');error.httpStatus=429;throw error;
 });
 assert.equal(calls,1);
 assert.equal(results[0].state,'error');
 assert.equal(results[1].state,'skipped');
 assert.equal(results[2].state,'skipped');
});
test('Pesquisa multifonte agrega anúncios sem CSV e mantém um único total por sessão',async()=>{
 ctx.records.length=0;ctx.selected.clear();
 el('city').value='Salto de Pirapora';el('state').value='SP';
 el('result-type').value='';el('min-beds').value='';
 const plans=ctx.planMixedSearch({target:'zapimoveis.com.br',type:'plp',
   city:'Salto de Pirapora',state:'SP',page:1},
   ['zapimoveis.com.br','vivareal.com.br']);
 const answer=await ctx.performMixedSearch(plans,async q=>({
   data:{source:q.target,totalResults:195,locationAudit:{providerItems:1,acceptedItems:1,
     discardedOtherCities:0,discardedMissingLocation:0,requestId:'search-test'},
     items:[{id:'same-number-id',unitTypes:['HOME'],title:'Casa',address:{city:q.city,state:q.state},
       prices:{mainValue:300000},attributes:{usableAreas:[110]}}]}
 }));
 assert.equal(answer.length,2);
 assert.equal(ctx.records.length,2);
 assert.equal(new Set(ctx.records.map(p=>p.source)).size,2);
 assert.equal(el('mixed-results').children.length,3); // cabeçalho e duas fontes
 assert.match(el('status').textContent,/2\/2 fonte/);
 assert.match(el('status').textContent,/2 anúncio/);
 ctx.records.length=0;
});
test('Indicativo não duplica imóveis suspeitos entre portais sem apagar os registros',()=>{
 const ref=ctx.makeReference({type:'house',city:'Salto de Pirapora',state:'SP',usable:110});
 const base={type:'house',city:'Salto de Pirapora',state:'SP',price:300000,usable:110,
   neighborhood:'Centro',beds:3,suites:1,baths:2,spaces:2,lat:null,lng:null};
 const a={...base,key:'zap:1',source:'zapimoveis.com.br',id:'1'};
 const b={...base,key:'viva:2',source:'vivareal.com.br',id:'2',price:301500,usable:111};
 const c={...base,key:'olx:3',source:'olx.com.br',id:'3',price:350000,usable:112};
 assert.equal(ctx.suspectedCrossPortalRepeat(a,b),true);
 assert.equal(ctx.suspectedCrossPortalRepeat(a,{...b,neighborhood:'Outro'}),false);
 const indicator=ctx.computeOfferIndicator(ref,[a,b,c]);
 assert.equal(indicator.status,'ready');
 assert.equal(indicator.included.length,2);
 assert.equal(indicator.suspectedDuplicates.length,1);
 assert.equal(indicator.excluded.length,1);
 assert.match(indicator.excluded[0].reason,/Possível duplicidade/);
 assert.equal(indicator.selectedCount,3);
});
