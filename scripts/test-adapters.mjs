import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const els=new Map();
function el(id){
  if(!els.has(id))els.set(id,{value:id==='radius'?'5':'',checked:false,disabled:false,innerHTML:'',textContent:'',classList:{toggle(){},add(){}},children:[],addEventListener(){},replaceChildren(){},appendChild(){},querySelector(){return {}}});
  return els.get(id);
}
const doc={getElementById:el,createElement(){return {value:'',textContent:'',innerHTML:'',classList:{toggle(){}},querySelector(){return {}},appendChild(){}}}};
const src=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ctx=runInNewContext(src+';({normalized,payload,classify,canon,uf,parseExportCsv,reviewComparable,duplicate,loadNormalized,records,makeReference,assessReference,referenceTypeFamilies,referenceLabels,visibleRecords})',{document:doc,window:{},console,URL});
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
