import {timingSafeEqual} from 'node:crypto';
import {buildGeckoPayload,auditLocation,responseEnvelope} from '../lib/geckoContracts.mjs';

const buckets=new Map();
function send(res,status,data){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(status).json(data);
}
function sameSecret(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&timingSafeEqual(x,y);
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
  if(bucket.count>6)return send(res,429,{error:'Limite de consultas: aguarde um minuto.'});
  if(buckets.size>5000)buckets.clear();
  let payload;
  try{payload=buildGeckoPayload(req.body);}catch(e){return send(res,400,{error:e.message});}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),26000);
  try{
    const upstream=await fetch('https://api.geckoapi.com.br/v1/extract',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:controller.signal
    });
    const raw=await upstream.text();let json;
    try{json=JSON.parse(raw);}catch{json=null;}
    if(!upstream.ok)return send(res,upstream.status===429?429:502,{
      error:'A GeckoAPI não concluiu a consulta. Confira créditos, endereço e filtros.',
      providerStatus:upstream.status
    });
    if(!json||typeof json!=='object')return send(res,502,{error:'A GeckoAPI retornou conteúdo inesperado.'});
    json=responseEnvelope(json);
    if(payload.type==='plp'&&json.data&&typeof json.data==='object') {
      const check=auditLocation(json.data,req.body.city,req.body.state);
      json.data.items=check.items;
      json.data.locationAudit=check.audit;
    }
    return send(res,200,json);
  }catch(e){return send(res,502,{error:e?.name==='AbortError'?'Tempo limite excedido.':'Não foi possível conectar à GeckoAPI.'});}
  finally{clearTimeout(timer);}
}
