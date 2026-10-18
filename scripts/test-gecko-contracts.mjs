import assert from 'node:assert/strict';
import test from 'node:test';
import {buildGeckoPayload,auditLocation,responseEnvelope} from '../lib/geckoContracts.mjs';
const city='Salto de Pirapora',state='SP';
test('OLX: cURL oficial com cidade, região, categoria e ordenação',()=>{
  const p=buildGeckoPayload({
    target:'olx.com.br',type:'plp',page:1,keyword:'notebook',state:'SP',city:'Bauru',
    region:'Regiao de Bauru e Marilia',categoryPath:'informatica/notebooks',sort:'date',
    priceMin:1000,priceMax:3000
  });
  assert.deepEqual(p,{
    target:'olx.com.br',type:'plp',city:'Bauru',state:'SP',page:1,priceMin:1000,priceMax:3000,
    categoryPath:'informatica/notebooks',region:'Regiao de Bauru e Marilia',
    keyword:'notebook',sort:'date'
  });
});
test('OLX imóveis: categoria nativa e tipologia aproximada por keyword',()=>{
  const p=buildGeckoPayload({target:'olx.com.br',type:'plp',city,state,propertyType:'house'});
  assert.equal(p.categoryPath,'imoveis/venda/casas');
  assert.equal(p.keyword,'casa');
  assert.equal(p.propertyTypes,undefined);
  assert.equal(p.latitude,undefined);
});
test('OLX URL se torna a fonte de verdade; sem página adicional',()=>{
  const link='https://www.olx.com.br/imoveis/estado-sp?q=casa&o=2';
  const p=buildGeckoPayload({target:'olx.com.br',type:'plp',url:link,city,state,page:3});
  assert.deepEqual(p,{target:'olx.com.br',type:'plp',url:link});
});
test('ZAP: filtros estruturados e sem URL PLP',()=>{
  const p=buildGeckoPayload({target:'zapimoveis.com.br',type:'plp',city,state,propertyType:'house',
    areaMin:80,areaMax:130,bedrooms:3,latitude:-23.65,longitude:-47.57,searchNear:true});
  assert.deepEqual(p.propertyTypes,['house']);
  assert.equal(p.businessType,'sale');
  assert.equal(p.areaMin,80);
  assert.equal(p.bedrooms,undefined); // mínimos aplicados apenas após a consulta
  assert.equal(p.latitude,-23.65);
  assert.throws(()=>buildGeckoPayload({target:'zapimoveis.com.br',type:'plp',city,state,url:'https://www.zapimoveis.com.br/venda/sp'}));
});
test('VivaReal: tipos, amenidades, ordenação e arrays de quantidade exata',()=>{
  const p=buildGeckoPayload({target:'vivareal.com.br',type:'plp',city,state,propertyType:'apartment',
    bedrooms:3,parkingSpots:2,exactCounts:true,sort:'biggest_area',amenities:['pool','balcony'],
    directOwner:true,businessType:'rent'});
  assert.deepEqual(p.propertyTypes,['apartment']);
  assert.deepEqual(p.bedrooms,[3]);
  assert.deepEqual(p.parkingSpots,[2]);
  assert.deepEqual(p.amenities,['pool','balcony']);
  assert.equal(p.sort,'biggest_area');
  assert.equal(p.businessType,'rent');
  assert.equal(p.directOwner,true);
});
test('Chaves na Mão: filtros documentados e URL de pesquisa opcional',()=>{
  const p=buildGeckoPayload({target:'chavesnamao.com.br',type:'plp',city,state,propertyType:'land',
    bathrooms:2,exactCounts:true,sort:'price',directOwner:true});
  assert.deepEqual(p.propertyTypes,['land']);
  assert.deepEqual(p.bathrooms,[2]);
  assert.equal(p.sort,'price');
  assert.equal(p.directOwner,true);
  const link='https://www.chavesnamao.com.br/casas-a-venda/sp-salto-de-pirapora/';
  const q=buildGeckoPayload({target:'chavesnamao.com.br',type:'plp',city,state,page:2,url:link});
  assert.equal(q.url,link);
  assert.equal(q.page,2);
});
test('Imovelweb: somente URL pública .html para PLP',()=>{
  const link='https://www.imovelweb.com.br/casas-venda-salto-de-pirapora-sp.html';
  const p=buildGeckoPayload({target:'imovelweb.com.br',type:'plp',city,state,url:link});
  assert.equal(p.url,link);
  assert.throws(()=>buildGeckoPayload({target:'imovelweb.com.br',type:'plp',city,state}));
  assert.throws(()=>buildGeckoPayload({target:'imovelweb.com.br',type:'plp',city,state,url:'https://www.imovelweb.com.br/casas'}));
});
test('PDP: URL de subdomínio OLX e domínio Chaves; bloqueia URL de outro portal',()=>{
  assert.equal(buildGeckoPayload({target:'olx.com.br',type:'pdp',url:'https://sp.olx.com.br/imoveis/casa-123'}).type,'pdp');
  assert.equal(buildGeckoPayload({target:'chavesnamao.com.br',type:'pdp',url:'https://www.chavesnamao.com.br/imovel/casa/id-123/'}).type,'pdp');
  assert.throws(()=>buildGeckoPayload({target:'olx.com.br',type:'pdp',url:'https://example.com/anuncio'}));
});
test('Auditoria: reconhece UF por sigla e nome, mantém apenas município exigido',()=>{
  const d={totalResults:191,items:[
    {id:'1',address:{city:'Salto de Pirapora',state:'SP'}},
    {id:'2',address:{city:'SALTO DE PIRAPÓRA',state:'São Paulo'}},
    {id:'3',location:{city:'Sorocaba',state:'SP'}},
    {id:'4',location:{city:'Salto de Pirapora',state:null}}
  ]};
  const r=auditLocation(d,city,state);
  assert.deepEqual(r.items.map(x=>x.id),['1','2']);
  assert.equal(r.audit.discardedOtherCities,1);
  assert.equal(r.audit.discardedMissingLocation,1);
  assert.equal(r.audit.sourceTotalResults,191);
});
test('Formatação Chaves: resposta direta normalizada para envelope',()=>{
  const direct={source:'chavesnamao.com.br',type:'plp',items:[{id:'1',address:{city,state}}]};
  const e=responseEnvelope(direct);
  assert.equal(e.data.source,'chavesnamao.com.br');
  assert.equal(e.data.items.length,1);
});
