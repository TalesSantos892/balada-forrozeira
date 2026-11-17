
const tabs=[
 ['agenda','Agenda de shows','Gerencie as datas. Sem eventos, o site exibe a mensagem “EM BREVE NOVAS DATAS E EVENTOS”.'],
 ['biografia','Biografia','Edite o texto mantendo o destaque O RECOMEÇO.'],
 ['galeria','Galeria','Gerencie os caminhos das fotos existentes.'],
 ['videos','Vídeos e fotos','Atualize os caminhos dos arquivos de mídia, sem alterar o layout.'],
 ['plataformas','Nossa Música','Organize os cartões das plataformas de música.'],
 ['destaque','Vídeo do YouTube','Escolha a miniatura de um link do YouTube ou um vídeo MP4 otimizado.'],
 ['links','Redes e Press Kit','Atualize apenas os links oficiais.'],
 ['playlist','Playlist','Confira os arquivos das duas músicas da V20.']
];
let data,original,active='agenda',sha=null,authenticated=false;
const $=s=>document.querySelector(s);
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field=(label,value,path,type='text')=>`<label class="field"><span>${esc(label)}</span>${type==='textarea'?`<textarea data-path="${esc(path)}">${esc(value)}</textarea>`:`<input type="${type}" data-path="${esc(path)}" value="${esc(value)}">`}</label>`;
const check=(label,value,path)=>`<label class="field check"><input type="checkbox" data-path="${esc(path)}" ${value?'checked':''}><span>${esc(label)}</span></label>`;
const card=(title,inner,remove)=>`<div class="entry"><div class="entry-head"><h3>${esc(title)}</h3>${remove?`<button class="remove" data-remove="${esc(remove)}">Excluir</button>`:''}</div>${inner}</div>`;
const list=(items,render)=>items.length?items.map(render).join(''):'<p class="empty">Nenhum item cadastrado.</p>';
const add=label=>`<button class="add" id="add">+ ${label}</button>`;
function getAt(path){return path.split('.').reduce((x,k)=>x?.[k],data)}
function setAt(path,value){let a=path.split('.'),o=data;for(let i=0;i<a.length-1;i++)o=o[a[i]];o[a.at(-1)]=value}
function render(){
 const tab=tabs.find(t=>t[0]===active);
 $('#heading').textContent=tab[1];$('#description').textContent=tab[2];
 $('#menu').innerHTML=tabs.map(t=>`<button data-tab="${t[0]}" class="${active===t[0]?'active':''}">${t[1]}</button>`).join('');
 const m=data.midia||{};let h='';
 if(active==='agenda'){
 h='<h2>Próximas apresentações</h2>'+list(data.agenda,(x,i)=>card(`${x.data||'Sem data'} · ${x.cidade||'Sem cidade'}`,field('Data',x.data,`agenda.${i}.data`,'date')+field('Cidade',x.cidade,`agenda.${i}.cidade`)+field('Estado',x.estado,`agenda.${i}.estado`)+field('Evento',x.evento,`agenda.${i}.evento`)+field('Local',x.local,`agenda.${i}.local`),`agenda.${i}`))+add('Adicionar apresentação');
 }else if(active==='biografia'){
 h='<h2>Introdução</h2>'+data.biografia.introducao.map((x,i)=>field(`Parágrafo ${i+1}`,x,`biografia.introducao.${i}`,'textarea')).join('')+field('Trajetória',data.biografia.trajetoria,'biografia.trajetoria','textarea')+'<h2>O RECOMEÇO</h2>'+data.biografia.recomeco.map((x,i)=>field(`Parágrafo ${i+1}`,x,`biografia.recomeco.${i}`,'textarea')).join('');
 }else if(active==='galeria'){
 h='<h2>Fotos da galeria</h2><p class="help">Informe o caminho da imagem na pasta assets. Nesta etapa ainda não há envio automático de arquivos.</p>'+list(m.galeria,(x,i)=>card(`Foto ${i+1}`,field('Caminho da imagem',x,`midia.galeria.${i}`)+`<label class='field'><span>Selecionar imagem (converter em WebP)</span><input type='file' accept='image/*' data-image-upload='midia.galeria.${i}'></label>`+(x?`<img class="preview" src="../${esc(x)}" alt="Prévia">`:''),`midia.galeria.${i}`))+add('Adicionar foto');
 }else if(active==='videos'){
 h='<h2>Imagens e vídeos</h2>'+[['foto_abertura','Foto de abertura'],['foto_biografia','Foto da biografia'],['foto_presskit','Foto do Press Kit'],['video_fundo','Vídeo de fundo'],['video_youtube','Vídeo de destaque']].map(([key,label])=>field(label,m[key],`midia.${key}`)+(key.startsWith('foto_')?`<label class='field'><span>Converter nova foto para WebP</span><input type='file' accept='image/*' data-image-upload='midia.${key}'></label>`:'')).join('')+'<p class="help">Para substituir arquivos de mídia, eles também precisam ser incluídos na pasta assets na etapa de publicação.</p>';
 }else if(active==='plataformas'){
 h='<h2>Plataformas de música</h2>'+list(data.plataformas,(x,i)=>card(x.nome||`Cartão ${i+1}`,field('Nome',x.nome,`plataformas.${i}.nome`)+field('Descrição',x.descricao,`plataformas.${i}.descricao`,'textarea')+field('Link',x.url,`plataformas.${i}.url`,'url')+field('Imagem',x.imagem,`plataformas.${i}.imagem`)+`<label class='field'><span>Converter capa para WebP</span><input type='file' accept='image/*' data-image-upload='plataformas.${i}.imagem'></label>`+field('Texto do botão',x.chamada,`plataformas.${i}.chamada`)+check('Mostrar no site',x.ativo,`plataformas.${i}.ativo`),`plataformas.${i}`))+add('Adicionar plataforma');
 }else if(active==='destaque'){
 const v=data.midia.youtube_destaque||(data.midia.youtube_destaque={tipo:'arquivo',url:'',arquivo:data.midia.video_youtube||'assets/palco.mp4'});
 h='<h2>Vídeo em destaque</h2><p class="help">Escolha apenas uma opção. A miniatura do YouTube abre o videoclipe ao clicar; o MP4 roda automaticamente, sem som, em loop.</p>'
 +`<label class="field"><span>Tipo de destaque</span><select data-path="midia.youtube_destaque.tipo"><option value="arquivo" ${v.tipo==='arquivo'?'selected':''}>Vídeo MP4 enviado</option><option value="youtube" ${v.tipo==='youtube'?'selected':''}>Miniatura do YouTube</option></select></label>`
 +(v.tipo==='youtube'?field('Link do videoclipe no YouTube',v.url,'midia.youtube_destaque.url','url'):'<p class="help">Envie um MP4 já otimizado. A conversão de vídeo continua manual.</p>'+field('Caminho do arquivo MP4',v.arquivo,'midia.youtube_destaque.arquivo')+`<label class="field"><span>Selecionar MP4 para preparar o envio</span><input type="file" accept="video/mp4" data-video-upload="midia.youtube_destaque.arquivo"></label>`);
 }else if(active==='links'){
 h='<h2>Links oficiais</h2>'+[['instagram','Instagram'],['tiktok','TikTok'],['youtube','YouTube'],['suamusica','Sua Música'],['whatsapp','WhatsApp'],['presskit','Press Kit']].map(([key,label])=>field(label,data.links[key],`links.${key}`,'url')).join('');
 }else if(active==='playlist'){
 h='<h2>Músicas da V20</h2><p class="help">A playlist atual permanece intacta e toca as duas faixas em sequência. A edição das músicas será habilitada quando o player estiver integrado ao salvamento seguro.</p>'+data.midia.playlist.map((x,i)=>card(`Faixa ${i+1}`,`<p>${esc(x.titulo)}</p><p class="help">${esc(x.arquivo)}</p>`)).join('');
 }
 $('#editor').innerHTML=h;
}
function sync(e){
 if(!authenticated)return;
 const el=e.target;if(!el.matches('[data-path]'))return;
 const path=el.dataset.path;setAt(path,el.type==='checkbox'?el.checked:el.value);if(path==='midia.youtube_destaque.tipo'){render();}
 $('#notice').textContent='Alterações em preparação. Baixe o JSON para guardar.';
}
function remove(path){const bits=path.split('.');let i=Number(bits.pop());getAt(bits.join('.')).splice(i,1);render()}
document.addEventListener('input',sync);document.addEventListener('change',sync);
document.addEventListener('click',e=>{
 if(!authenticated)return;
 const t=e.target.closest('[data-tab]');if(t){active=t.dataset.tab;render();return}
 const r=e.target.closest('[data-remove]');if(r){remove(r.dataset.remove);return}
 if(e.target.id==='add'){
 if(active==='agenda')data.agenda.push({data:'',cidade:'',estado:'BA',evento:'',local:''});
 if(active==='galeria')data.midia.galeria.push('');
 if(active==='plataformas')data.plataformas.push({nome:'',descricao:'',url:'',imagem:'',chamada:'Ouvir agora',ativo:true});
 render();
 }
});
// Conversão WebP local e envio autenticado para o GitHub.
async function optimizeImage(file){
 if(!file.type.startsWith('image/'))throw Error('Selecione uma imagem válida.');
 if(file.size>35*1024*1024)throw Error('Imagem acima de 35 MB.');
 const bmp=await createImageBitmap(file);
 const scale=Math.min(1,1920/Math.max(bmp.width,bmp.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bmp.width*scale));canvas.height=Math.max(1,Math.round(bmp.height*scale));
 canvas.getContext('2d').drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close();
 const blob=await new Promise(r=>canvas.toBlob(r,'image/webp',0.82));
 if(!blob)throw Error('Seu navegador não conseguiu converter para WebP.');
 const name='bf-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)+'.webp';
 if(!authenticated)throw Error('Faça login antes de enviar imagens.');
 const b64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(blob)});
 const result=await api('/api/upload',{name,content:b64,mime:'image/webp'});
 return result.path;
}
document.addEventListener('change',async e=>{
 const input=e.target;
 if(input.matches('[data-image-upload]')){
  const file=input.files?.[0];if(!file)return;
  try{const path=await optimizeImage(file);setAt(input.dataset.imageUpload,path);render();$('#notice').textContent='Imagem convertida para WebP e enviada ao GitHub. Clique em Salvar e publicar para atualizar a referência.';}
  catch(err){$('#notice').textContent='Erro: '+err.message;}
 }
 if(input.matches('[data-video-upload]')){
  const file=input.files?.[0];if(!file)return;
  if(file.size>80*1024*1024){$('#notice').textContent='Vídeo muito grande para esta etapa (limite de 80 MB). Otimize manualmente.';return}
  $('#notice').textContent='Vídeos MP4 devem ser adicionados manualmente ao repositório GitHub. Nenhum vídeo foi enviado.';
 }
});
$('#reset').onclick=()=>{if(confirm('Descartar todas as alterações desta sessão?')){data=clone(original);render();$('#notice').textContent='Alterações descartadas.'}};
$('#export').onclick=()=>{
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='conteudo.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);
 $('#notice').textContent='Arquivo conteudo.json exportado. Ainda não foi publicado.';
};
async function api(path,body){const res=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const j=await res.json().catch(()=>({}));if(!res.ok)throw Error(j.erro||`Erro HTTP ${res.status}`);return j}
$('#save').onclick=async()=>{
 if(!authenticated)return;
 const button=$('#save');button.disabled=true;$('#notice').textContent='Salvando no GitHub…';
 try{const result=await api('/api/save',{conteudo:data,sha});sha=result.sha;original=clone(data);$('#notice').textContent='Conteúdo salvo no GitHub. A publicação depende da integração GitHub → Vercel.'}
 catch(e){$('#notice').textContent='Não foi possível salvar: '+e.message}
 finally{button.disabled=false}
};
(async()=>{
 try{
  const session=await api('/api/session');authenticated=true;
  $('#auth-status').innerHTML=`Conectado como <b>${esc(session.login)}</b> · <a href="#" id="logout">Sair</a>`;
  $('#logout').onclick=async e=>{e.preventDefault();await api('/api/logout',{});location.reload()};
  const current=await api('/api/content');data=current.conteudo;sha=current.sha;original=clone(data);$('#save').disabled=false;render();
 }catch(e){
  $('#auth-status').innerHTML='<form id="login-form" class="login-form"><h2>Entrar no painel</h2><label class="field"><span>E-mail</span><input type="email" name="email" autocomplete="username" required></label><label class="field"><span>Senha</span><input type="password" name="password" autocomplete="current-password" required></label><button type="submit" class="add">Entrar</button><p id="login-error" role="alert"></p></form>';
  $('#login-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;try{await api('/api/login',{email:form.email.value,password:form.password.value});location.reload()}catch(error){$('#login-error').textContent=error.message;button.disabled=false}};
  $('#editor').innerHTML='<p class="empty">Faça login para carregar e editar o conteúdo do repositório.</p>';
  $('#export').disabled=true;$('#reset').disabled=true;$('#save').disabled=true;
  $('#menu').style.pointerEvents='none';
 }
})();
