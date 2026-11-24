const crypto=require('node:crypto');
const repo=process.env.GITHUB_REPO||'';
const branch=process.env.GITHUB_BRANCH||'main';
const key=process.env.SESSION_SECRET;
const adminEmail=(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
const passwordHash=process.env.ADMIN_PASSWORD_HASH||'';
// Alternativa sem terminal: senha mantida apenas em variável protegida da Vercel.
const adminPassword=process.env.ADMIN_PASSWORD||'';
const githubToken=process.env.GITHUB_WRITE_TOKEN;
const base='/api';
// Bloqueio básico por instância, sem banco de dados. Rate limit global exige firewall.
const attempts=new Map();
const ATTEMPT_WINDOW=10*60*1000;
const MAX_FAILURES=6;
function loginKey(req){
 const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
 return String(req.headers['x-real-ip']||forwarded||req.socket?.remoteAddress||'unknown').slice(0,128);
}
function throttle(req){
 const ip=loginKey(req),now=Date.now();
 if(attempts.size>500){for(const [k,v] of attempts)if(v.reset<=now)attempts.delete(k)}
 const state=attempts.get(ip);
 return state&&state.reset>now&&state.failures>=MAX_FAILURES?Math.ceil((state.reset-now)/1000):0;
}
function failedLogin(req){
 const ip=loginKey(req),now=Date.now();let state=attempts.get(ip);
 if(!state||state.reset<=now)state={failures:0,reset:now+ATTEMPT_WINDOW};
 state.failures++;attempts.set(ip,state);
}
function clearLoginAttempts(req){attempts.delete(loginKey(req))}

function cookie(name,val,max=43200){return `${name}=${val}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${max}`}
function seal(obj){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',crypto.createHash('sha256').update(key).digest(),iv);const b=Buffer.concat([c.update(JSON.stringify(obj)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]).toString('base64url')}
function unseal(s){try{const b=Buffer.from(s,'base64url'),d=crypto.createDecipheriv('aes-256-gcm',crypto.createHash('sha256').update(key).digest(),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString())}catch{return null}}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split(/=(.*)/s).slice(0,2)).filter(x=>x[0]))}
function send(res,status,data){res.status(status).setHeader('Cache-Control','no-store').json(data)}
async function gh(path,token,method='GET',body){const r=await fetch('https://api.github.com'+path,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'balada-forrozeira-admin',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(`GitHub ${r.status}: ${j.message||'Falha'}`);return j}
function verify(req){
 if(!key||!adminEmail||(!passwordHash&&!adminPassword)||!githubToken||!repo)throw Error('Configuração de autenticação incompleta');
 const session=unseal(cookies(req).bf_session||'');
 if(!session||session.exp<Date.now()||session.login!==adminEmail)throw Error('Sessão inválida. Entre novamente.');
 return session;
}
function verifyPassword(password){
 if(typeof password!=='string'||password.length>256)return false;
 if(passwordHash){
  const [algorithm,salt,expected]=passwordHash.split(':');
  if(algorithm!=='scrypt'||!salt||!expected)return false;
  const computed=crypto.scryptSync(password,Buffer.from(salt,'hex'),64);
  const original=Buffer.from(expected,'hex');
  return original.length===computed.length&&crypto.timingSafeEqual(computed,original);
 }
 if(adminPassword.length<8)return false;
 const entered=crypto.createHash('sha256').update(password).digest();
 const stored=crypto.createHash('sha256').update(adminPassword).digest();
 return crypto.timingSafeEqual(entered,stored);
}
function sameOrigin(req){try{const origin=req.headers.origin;const host=req.headers['x-forwarded-host']||req.headers.host;return !!origin&&new URL(origin).host===host&&new URL(origin).protocol==='https:'}catch{return false}}
function validUrl(v){return typeof v==='string'&&(!v||/^https:\/\//i.test(v))&&v.length<2000}
function validate(d){if(!d||typeof d!=='object'||Array.isArray(d))throw Error('JSON inválido');const fields=['biografia','agenda','plataformas','links','midia'];if(Object.keys(d).some(k=>!fields.includes(k)))throw Error('Campo não permitido');if(!d.biografia||!Array.isArray(d.agenda)||!Array.isArray(d.plataformas)||!d.links||!d.midia)throw Error('Estrutura incompleta');if(d.agenda.length>100||d.plataformas.length>30||d.midia.galeria?.length>100)throw Error('Quantidade acima do limite');
 if(!Array.isArray(d.midia.playlist)||d.midia.playlist.length!==2)throw Error('A playlist deve conter exatamente duas músicas');
 for(const x of d.midia.playlist){
  if(!x||typeof x.titulo!=='string'||!x.titulo.trim()||x.titulo.length>150)throw Error('Título da música inválido');
  if(typeof x.arquivo!=='string'||x.arquivo.length>2000||!(/^assets\/[a-zA-Z0-9_.-]+\.mp3$/i.test(x.arquivo)||(/^https:\/\//i.test(x.arquivo)&&/\.mp3$/i.test(new URL(x.arquivo).pathname))))throw Error('Informe um arquivo MP3 ou link HTTPS direto para MP3');
 }
 if(d.midia.galeria!=null){
  if(!Array.isArray(d.midia.galeria))throw Error('Galeria inválida');
  let videos=0;
  for(const item of d.midia.galeria){
   if(typeof item==='string'){
    if(!item.startsWith('assets/')||!/^[-a-zA-Z0-9_.]+$/.test(item.slice(7)))throw Error('Caminho da foto inválido');
   }else if(item&&typeof item==='object'&&!Array.isArray(item)&&item.tipo==='video'){
    videos++;
    if(typeof item.arquivo!=='string'||!item.arquivo.startsWith('assets/')||!/^[-a-zA-Z0-9_.]+[.]mp4$/i.test(item.arquivo.slice(7)))throw Error('Caminho do MP4 inválido');
   }else throw Error('Tipo de mídia da galeria não permitido');
  }
  if(videos>3)throw Error('Máximo de 3 vídeos MP4 na galeria');
 }
if(d.agenda.some(x=>!/^\d{4}-\d{2}-\d{2}$/.test(x.data||'')||!x.cidade))throw Error('Preencha data e cidade de cada show');for(const x of d.plataformas){if(!validUrl(x.url))throw Error('Link de plataforma inválido')}for(const [k,v] of Object.entries(d.links)){if(!validUrl(v))throw Error('Link inválido: '+k)}if(!['arquivo','youtube'].includes(d.midia.youtube_destaque?.tipo))throw Error('Tipo de destaque inválido');if(d.midia.youtube_destaque.tipo==='youtube'&&!validUrl(d.midia.youtube_destaque.url))throw Error('Link YouTube inválido');const size=Buffer.byteLength(JSON.stringify(d));if(size>150000)throw Error('Conteúdo muito grande');return d}
module.exports=async(req,res)=>{try{
const route=(req.query.route||'').toString();
if(route==='login'&&req.method==='POST'){
 if(!sameOrigin(req))return send(res,403,{erro:'Origem inválida'});
 if(!key||!adminEmail||(!passwordHash&&adminPassword.length<8)||!githubToken||!repo)return send(res,503,{erro:'Configure as variáveis de ambiente primeiro. A senha precisa ter pelo menos 8 caracteres.'});
 const waiting=throttle(req);
 if(waiting){res.setHeader('Retry-After',String(waiting));return send(res,429,{erro:'Muitas tentativas. Aguarde alguns minutos e tente novamente.'});}
 const email=String(req.body?.email||'').trim().toLowerCase().slice(0,254);
 const pass=String(req.body?.password||'');
 const equalEmail=crypto.timingSafeEqual(crypto.createHash('sha256').update(email).digest(),crypto.createHash('sha256').update(adminEmail).digest());
 const equalPass=verifyPassword(pass);
 if(!(equalEmail&&equalPass)){failedLogin(req);return send(res,401,{erro:'E-mail ou senha incorretos.'});}
 clearLoginAttempts(req);
 res.setHeader('Set-Cookie',cookie('bf_session',seal({login:adminEmail,exp:Date.now()+8*3600000}),28800));
 return send(res,200,{ok:true});
}
if(route==='logout'&&req.method==='POST'){if(!sameOrigin(req))return send(res,403,{erro:'Origem inválida'});res.setHeader('Set-Cookie',cookie('bf_session','',0));return send(res,200,{ok:true})}
const session=verify(req);
if(route==='session'&&req.method==='GET')return send(res,200,{login:session.login});
if(route==='content'&&req.method==='GET'){
 const file=await gh(`/repos/${repo}/contents/conteudo.json?ref=${encodeURIComponent(branch)}`,githubToken);return send(res,200,{conteudo:JSON.parse(Buffer.from(file.content,'base64').toString('utf8')),sha:file.sha});
}
if(route==='save'&&req.method==='POST'){
 if(!sameOrigin(req))return send(res,403,{erro:'Origem inválida'});
 const d=validate(req.body?.conteudo),sha=req.body?.sha;if(!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Versão de conteúdo inválida');
 const result=await gh(`/repos/${repo}/contents/conteudo.json`,githubToken,'PUT',{message:'Atualizar conteúdo pelo painel Balada Forrozeira',content:Buffer.from(JSON.stringify(d,null,2)).toString('base64'),sha,branch});return send(res,200,{ok:true,sha:result.content.sha});
}
if(route==='upload-video'&&req.method==='POST'){
 if(!sameOrigin(req))return send(res,403,{erro:'Origem inválida'});
 const {name,content,mime}=req.body||{};
 if(mime!=='video/mp4'||typeof name!=='string'||!/^bf-video-[a-z0-9-]+[.]mp4$/.test(name))throw Error('Apenas vídeos MP4 com nome seguro são aceitos');
 if(typeof content!=='string'||content.length>4.1e6||!/^[A-Za-z0-9+/=]+$/.test(content))throw Error('Vídeo maior que o limite de 3 MB. Otimize o MP4 ou adicione-o manualmente ao GitHub.');
 const bytes=Buffer.from(content,'base64');
 if(bytes.length>3*1024*1024||bytes.length<12||bytes.toString('ascii',4,8)!=='ftyp')throw Error('MP4 inválido ou acima do limite de 3 MB');
 const path='assets/'+name;
 await gh(`/repos/${repo}/contents/${path}`,githubToken,'PUT',{message:'Adicionar vídeo MP4 otimizado '+name,content,branch});
 return send(res,200,{ok:true,path});
}
if(route==='upload'&&req.method==='POST'){
 if(!sameOrigin(req))return send(res,403,{erro:'Origem inválida'});
 const {name,content,mime}=req.body||{};
 if(typeof content!=='string'||content.length>5.6e6||!/^[A-Za-z0-9+/=]+$/.test(content))throw Error('Imagem muito grande ou inválida');
 if(mime!=='image/webp'||!/^bf-[a-z0-9-]+\.webp$/.test(name||''))throw Error('Apenas WebP otimizado é aceito');
 const bytes=Buffer.from(content,'base64');if(bytes.length>4*1024*1024||bytes.toString('hex',0,4)!=='52494646'||bytes.toString('ascii',8,12)!=='WEBP')throw Error('Arquivo WebP inválido');
 const path='assets/'+name;await gh(`/repos/${repo}/contents/${path}`,githubToken,'PUT',{message:'Adicionar imagem otimizada '+name,content,branch});return send(res,200,{ok:true,path});
}
return send(res,404,{erro:'Rota não encontrada'});
}catch(e){const message=e.message||'Erro';const status=/Sessão inválida/.test(message)?401:/não autorizado|Origem inválida|OAuth inválido/.test(message)?403:/GitHub 409|GitHub 422/.test(message)?409:400;return send(res,status,{erro:message})}}
