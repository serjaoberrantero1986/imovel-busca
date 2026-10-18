import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import handler from '../api/extract.js';

function node(id) {
  return {value:id==='radius'?'5':'',checked:false,disabled:false,textContent:'',innerHTML:'',
    className:'',classList:{toggle(){}},children:[],addEventListener(){},replaceChildren(){this.children=[]},
    appendChild(item){this.children.push(item)},querySelector(selector){return selector==='.pick'?{}:null;}};
}
const elements=new Map();
const get=id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id);};
const context={
  document:{getElementById:get,createElement(){return node('new');}},
  window:{},console
};
const script=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const app=runInNewContext(script+';({load,visibleRecords,classify,records,payload})',context);
assert.equal(app.classify({unitTypes:['HOME'],title:'Casa'}),'house');
assert.equal(app.classify({unitTypes:['RESIDENTIAL_ALLOTMENT_LAND'],title:'Terreno'}),'land');
assert.equal(app.classify({title:'Chácara no interior'}),'farm');
assert.equal(app.classify({title:'Apartamento no Centro'}),'apartment');
app.load({data:{source:'zapimoveis.com.br',totalResults:2,items:[
  {id:'casa-1',title:'Casa',unitTypes:['HOME'],prices:{mainValue:380000},attributes:{usableAreas:[120],bedrooms:[3],suites:[1]},address:{city:'Salto de Pirapora',latitude:-23.62,longitude:-47.57,isApproximateLocation:true}},
  {id:'terreno-1',title:'Terreno',unitTypes:['ALLOTMENT_LAND'],prices:{mainValue:250000},address:{city:'Salto de Pirapora',latitude:-23.61,longitude:-47.58}}
]}});
assert.equal(app.records.length,2);
get('result-type').value='house';
assert.equal(app.visibleRecords().length,1);
assert.equal(app.visibleRecords()[0].id,'casa-1');
get('result-type').value='';
get('min-beds').value='3';
assert.equal(app.visibleRecords().length,1);
get('min-beds').value='';
app.load({data:{source:'olx.com.br',type:'plp',items:[
  {id:'olx-1',title:'Casa na OLX',category:'Imóveis',price:295000,location:{city:'Salto de Pirapora'},properties:[{label:'Quartos',value:'2'}]}
]}});
assert.equal(app.records.length,3);
assert.equal(app.records[2].type,'house');
assert.equal(app.records[2].beds,2);
assert.equal(app.records[2].lat,null);
const pdp=app.payload({data:{source:'zapimoveis.com.br',type:'pdp',data:{listingId:'casa-1',title:'Casa',prices:{price:390000},attributes:{totalAreas:[180]}}}});
assert.equal(pdp.items[0].total,180);
assert.equal(pdp.items[0].price,390000);

process.env.GECKO_API_TOKEN='fake-test-token';
process.env.LAB_ACCESS_CODE='isolated-test-password';
let captured;
const priorFetch=global.fetch;
global.fetch=async (_url,options)=>{
  captured=JSON.parse(options.body);
  return {ok:true,status:200,text:async()=>JSON.stringify({data:{source:captured.target,items:[]}})};
};
function response() {
  return {statusCode:200,body:null,setHeader(){return this;},status(code){this.statusCode=code;return this;},json(data){this.body=data;return this;}};
}
async function request(body,code='isolated-test-password') {
  const res=response();
  await handler({method:'POST',headers:{'x-lab-code':code,'x-forwarded-for':'198.51.100.10'},body},res);
  return res;
}
try {
  let res=await request({target:'zapimoveis.com.br',type:'plp',city:'Salto de Pirapora',state:'SP',propertyType:'house',areaMin:90,bedrooms:3});
  assert.equal(res.statusCode,200);
  assert.deepEqual(captured.propertyTypes,['house']);
  assert.equal(captured.areaMin,90);
  assert.equal(captured.bedrooms,undefined); // minimum locally, not mistaken for exact values
  res=await request({target:'olx.com.br',type:'plp',city:'Salto de Pirapora',state:'SP',propertyType:'house'});
  assert.equal(res.statusCode,200);
  assert.equal(captured.keyword,'casa');
  assert.equal(captured.categoryPath,'imoveis/venda/casas');
  assert.equal(captured.propertyTypes,undefined);
  res=await request({target:'imovelweb.com.br',type:'plp',city:'Salto de Pirapora',state:'SP'});
  assert.equal(res.statusCode,400);
  res=await request({target:'olx.com.br',type:'pdp',url:'https://sp.olx.com.br/imoveis/anuncio'});
  assert.equal(res.statusCode,200);
  assert.equal(captured.type,'pdp');
  res=await request({target:'zapimoveis.com.br',type:'plp',city:'Salto de Pirapora',state:'SP'},'incorrect');
  assert.equal(res.statusCode,401);
} finally {
  global.fetch=priorFetch;
  delete process.env.GECKO_API_TOKEN;
  delete process.env.LAB_ACCESS_CODE;
}
console.log('Laboratório: testes locais de classificação, importação e validação de consultas OK.');
