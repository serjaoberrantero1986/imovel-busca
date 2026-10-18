import { timingSafeEqual } from 'node:crypto';
const TARGETS = new Set(['zapimoveis.com.br','olx.com.br','imovelweb.com.br','vivareal.com.br','chavesnamao.com.br']);
const buckets=new Map();
function reply(res,status,data){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.status(status).json(data);}
function validUrl(value,target){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname===target||u.hostname==='www.'+target);}catch{return false;}}
function sameSecret(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
export default async function handler(req,res){
  if(req.method!=='POST')return reply(res,405,{error:'Método não permitido.'});
  const token=process.env.GECKO_API_TOKEN, code=process.env.LAB_ACCESS_CODE;
  if(!token||!code)return reply(res,503,{error:'A integração ainda não foi habilitada. Configure GECKO_API_TOKEN e LAB_ACCESS_CODE nas variáveis secretas da Vercel.'});
  if(!sameSecret(req.headers['x-lab-code'],code))return reply(res,401,{error:'Código de acesso incorreto.'});
  // Defesa básica adicional. Em produção de alto volume, substituir por rate limit persistente.
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].slice(0,80);
  const now=Date.now(),bucket=buckets.get(ip)||{start:now,count:0};
  if(now-bucket.start>60000){bucket.start=now;bucket.count=0;}
  bucket.count++;buckets.set(ip,bucket);
  if(bucket.count>6)return reply(res,429,{error:'Aguarde um minuto antes de fazer outra consulta.'});
  if(buckets.size>5000)buckets.clear();
  const p=req.body;
  if(!p||typeof p!=='object'||Array.isArray(p)||!TARGETS.has(p.target)||!['plp','pdp'].includes(p.type))return reply(res,400,{error:'Portal ou operação inválida.'});
  let payload={target:p.target,type:p.type};
  if(p.type==='pdp'){
    if(typeof p.url!=='string'||p.url.length>2000||!validUrl(p.url,p.target))return reply(res,400,{error:'Informe uma URL HTTPS de anúncio do portal selecionado.'});
    payload.url=p.url;
  }else{
    const city=typeof p.city==='string'?p.city.trim():'',state=typeof p.state==='string'?p.state.trim().toUpperCase():'';
    if(city.length<2||city.length>90||!/^[A-Z]{2}$/.test(state))return reply(res,400,{error:'Preencha cidade e UF válidas.'});
    const page=Number(p.page)||1;
    if(!Number.isInteger(page)||page<1||page>10)return reply(res,400,{error:'A página deve estar entre 1 e 10.'});
    payload={...payload,city,state,businessType:'sale',page};
    if(p.keyword&&typeof p.keyword==='string')payload.keyword=p.keyword.trim().slice(0,100);
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),26000);
  try{
    const upstream=await fetch('https://api.geckoapi.com.br/v1/extract',{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:controller.signal
    });
    const raw=await upstream.text();let parsed;
    try{parsed=JSON.parse(raw);}catch{parsed=null;}
    if(!upstream.ok)return reply(res,upstream.status===429?429:502,{
      error:'A GeckoAPI não concluiu a consulta. Verifique créditos, portal e parâmetros.',
      providerStatus:upstream.status
    });
    if(!parsed||typeof parsed!=='object')return reply(res,502,{error:'Resposta da GeckoAPI fora do formato JSON esperado.'});
    return reply(res,200,parsed);
  }catch(e){return reply(res,502,{error:e?.name==='AbortError'?'A consulta ultrapassou o tempo limite.':'Falha ao consultar a GeckoAPI.'});}
  finally{clearTimeout(timer);}
}
