'use strict';
(function(){
  var STORAGE='mediaforge_creator_studio_v1',VERSION=1;
  var ids=['title','topic','intent','duration','audience','tone','style','cta','hookA','hookB','hookC'];
  var names=['Gancho','Contexto','Prova visual','Revelação','Fechamento'];
  var fields=['spoken','onscreen','action','sound'];
  var project={version:VERSION,updatedAt:'',title:'',topic:'',intent:'curiosidade',duration:'45',audience:'',tone:'investigativo',style:'',cta:'',hookA:'',hookB:'',hookC:'',selectedHook:'hookA',scenes:[]};
  var active=0;
  var audioFiles={voiceover:null,music:null};
  function el(id){return document.getElementById(id);}
  function clean(s,max){return String(s==null?'':s).slice(0,max||2000);}
  function timestamp(s){var n=Math.max(0,Math.round(s));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function safeFilename(s){return String(s||'projeto-reel').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'projeto-reel';}
  function message(text){el('notice').textContent=text;el('save-state').textContent='Rascunho local';}
  function sanitizedProject(raw){
    var v={version:VERSION,updatedAt:'',selectedHook:'hookA',scenes:[]};
    ids.forEach(function(id){v[id]=clean(raw&&raw[id],id==='topic'?1500:1100);});
    if(!['15','30','45','60'].includes(v.duration))v.duration='45';
    if(!['hookA','hookB','hookC'].includes(raw&&raw.selectedHook))v.selectedHook='hookA';else v.selectedHook=raw.selectedHook;
    if(!['curiosidade','demonstracao','produto','engajamento','venda-indireta'].includes(v.intent))v.intent='curiosidade';
    if(!['investigativo','cinematografico','direto','leve','educativo'].includes(v.tone))v.tone='investigativo';
    if(raw&&Array.isArray(raw.scenes)){
      v.scenes=raw.scenes.slice(0,5).map(function(s,i){
        var item={name:names[i],start:0,end:0};
        fields.forEach(function(f){item[f]=clean(s&&s[f],2000);});
        return item;
      });
      if(v.scenes.length!==5)v.scenes=[];
    }
    return v;
  }
  function persist(){project.updatedAt=new Date().toISOString();try{localStorage.setItem(STORAGE,JSON.stringify(project));el('save-state').textContent='Salvo neste navegador';}catch(e){el('save-state').textContent='Armazenamento indisponível';}}
  function load(){try{var raw=localStorage.getItem(STORAGE);if(raw)project=sanitizedProject(JSON.parse(raw));}catch(e){message('Não foi possível ler o rascunho anterior.');}}
  function formToProject(){
    ids.forEach(function(id){project[id]=el(id).value;});
    var chosen=document.querySelector('input[name=selectedHook]:checked');project.selectedHook=chosen?chosen.value:'hookA';
    if(project.scenes.length)retime();
    persist();updatePreview();updateProgress();
  }
  function projectToForm(){
    ids.forEach(function(id){el(id).value=clean(project[id]);});
    var chosen=document.querySelector('input[name=selectedHook][value='+project.selectedHook+']');
    if(chosen)chosen.checked=true;
    renderScenes();updatePreview();updateProgress();
  }
  function bounds(){var total=Number(project.duration)||45;var rem=total-3;var a=[0,3,Math.round(3+rem*.22),Math.round(3+rem*.5),Math.round(3+rem*.80),total];return a;}
  function retime(){var a=bounds();project.scenes.forEach(function(s,i){s.start=a[i];s.end=a[i+1];});document.querySelectorAll('.scene-head span').forEach(function(e,i){e.textContent=timestamp(a[i])+' — '+timestamp(a[i+1]);});}
  function chooseHook(){return clean(project[project.selectedHook]).trim()||clean(project.topic).trim()||'Seu gancho aqui';}
  function generate(){
    if(project.scenes.some(function(s){return fields.some(function(f){return !!s[f].trim();});})&&!confirm('Substituir as cenas atuais pela estrutura inicial?'))return;
    var topic=project.topic.trim()||'sua ideia central',hook=chooseHook(),cta=project.cta.trim();
    var a=bounds();
    var starters=[
      {spoken:hook,onscreen:hook,action:'Abrir com uma ação física específica no PRIMEIRO FRAME. Qual elemento aparece? O que muda?',sound:'Impacto curto na ação inicial; definir arquivo de som.'},
      {spoken:'Explique o contexto em poucas frases: '+topic,onscreen:'O contexto em poucas palavras',action:'Mostrar o objeto ou cenário principal com continuidade de câmera e luz. Descrever estado inicial e movimento.',sound:'Ambiente discreto sem competir com a narração.'},
      {spoken:'Mostre a evidência ou demonstração central de: '+topic,onscreen:'A evidência visual',action:'Executar uma transformação observável do mesmo objeto. Marcar a palavra da narração que aciona o movimento.',sound:'Microsons verificados para cada contato ou transformação.'},
      {spoken:'Entregue a descoberta principal e explique por que ela importa.',onscreen:'A revelação',action:'Provar visualmente a descoberta, mudando escala, cenário ou perspectiva com transição causal.',sound:'Acento sonoro na revelação; continuidade musical.'},
      {spoken:cta||'Conclua com uma frase curta e memorável.',onscreen:cta||'A conclusão',action:'Encerrar com payoff visual e quadro final legível. Evitar segundo silencioso sem intenção.',sound:'Manter leito de som até o final; fade controlado.'}
    ];
    project.scenes=starters.map(function(item,i){return Object.assign({name:names[i],start:a[i],end:a[i+1]},item);});
    active=0;persist();renderScenes();updatePreview();updateProgress();message('Estrutura criada. Personalize as cinco cenas antes de produzir.');
  }
  function make(tag,classname,text){var item=document.createElement(tag);if(classname)item.className=classname;if(text!=null)item.textContent=text;return item;}
  function renderScenes(){
    var list=el('scene-list');list.replaceChildren();el('scene-empty').hidden=project.scenes.length>0;
    project.scenes.forEach(function(scene,i){
      var card=make('article','scene-card'+(i===active?' selected':''));var head=make('div','scene-head');
      var btn=make('button','scene-title-button','CENA '+String(i+1).padStart(2,'0')+' · '+scene.name);btn.type='button';
      btn.addEventListener('click',function(){active=i;renderScenes();updatePreview();});
      head.append(btn,make('span','',timestamp(scene.start)+' — '+timestamp(scene.end)));card.append(head);
      var grid=make('div','scene-grid');
      [['spoken','Fala / narração'],['onscreen','Texto na tela'],['action','Transformação, câmera e ação física'],['sound','Microsons, música e marca verbal']].forEach(function(pair){
        var label=make('label','',pair[1]);var input=make('textarea');input.rows=3;input.maxLength=2000;input.value=scene[pair[0]];input.setAttribute('aria-label',pair[1]+' da cena '+(i+1));
        input.addEventListener('input',function(){project.scenes[i][pair[0]]=input.value;persist();updatePreview();updateProgress();});
        label.appendChild(input);grid.appendChild(label);
      });
      card.appendChild(grid);list.appendChild(card);
    });
  }
  function updatePreview(){
    var s=project.scenes[active];el('preview-scene').textContent=s?'CENA '+String(active+1).padStart(2,'0')+' / '+s.name.toUpperCase():'CENA 01 / ABERTURA';
    var txt=s&&s.onscreen? s.onscreen: chooseHook();
    el('preview-text').textContent=clean(txt,130)||'Seu gancho aparece aqui.';
    el('preview-action').textContent=s&&s.action?clean(s.action,125):'Descreva aqui uma ação visual observável.';
    el('preview-time').textContent=s?timestamp(s.start)+' — '+timestamp(s.end):'00:00 — 00:03';
  }
  function updateProgress(){
    var count=project.scenes.length;
    el('timeline-label').textContent=count+' de 5 cenas estruturadas · revisar antes de renderizar';el('timeline-bar').style.width=(count*20)+'%';
  }
  function exportText(){
    var lines=['PROJETO MEDIAFORGE CREATOR STUDIO — BRIEFING E STORYBOARD','Versão de briefing: 1','',
      'TÍTULO: '+(project.title||'(não definido)'),'OBJETIVO: '+project.intent,'PÚBLICO: '+project.audience,
      'IDEIA: '+project.topic,'DURAÇÃO ESTIMADA: '+project.duration+'s','TOM: '+project.tone,'DIREÇÃO VISUAL: '+project.style,
      'ENCERRAMENTO / CTA: '+project.cta,'','TRÊS GANCHOS:','A: '+project.hookA,'B: '+project.hookB,'C: '+project.hookC,
      'GANCHO ESCOLHIDO: '+(project.selectedHook==='hookA'?'A':project.selectedHook==='hookB'?'B':'C'),'',
      'STORYBOARD / TEMPOS ESTIMADOS'];
    if(!project.scenes.length)lines.push('Cenas ainda não definidas.');
    project.scenes.forEach(function(s,i){lines.push('','CENA '+(i+1)+' — '+s.name+' ['+timestamp(s.start)+'–'+timestamp(s.end)+']',
      'FALA: '+s.spoken,'TEXTO DE TELA: '+s.onscreen,'AÇÃO/CÂMERA: '+s.action,'ÁUDIO/SFX: '+s.sound);});
    lines.push('','INSTRUÇÕES DE PRODUÇÃO:',
      'Este arquivo contém briefing e storyboard; ainda não é uma composição HyperFrames renderizável.',
      'Os tempos são estimativas; medir sincronismo após a locução definitiva. Revise a direção visual e o áudio antes de qualquer renderização.',
      'Nenhuma publicação é automática. Renderização técnica não substitui a revisão artística do vídeo.');
    return lines.join('\n');
  }
  function audioDuration(file){
    return new Promise(function(resolve,reject){
      var url=URL.createObjectURL(file),audio=new Audio();audio.preload='metadata';
      audio.onloadedmetadata=function(){var duration=audio.duration;URL.revokeObjectURL(url);if(Number.isFinite(duration)&&duration>0)resolve(duration);else reject(new Error('Não consegui ler a duração deste áudio.'));};
      audio.onerror=function(){URL.revokeObjectURL(url);reject(new Error('Formato de áudio não reconhecido pelo navegador.'));};
      audio.src=url;
    });
  }
  function clearAudio(kind){
    var current=audioFiles[kind];
    if(current&&current.previewUrl)URL.revokeObjectURL(current.previewUrl);
    audioFiles[kind]=null;
    var preview=el(kind+'-preview');
    preview.pause();preview.removeAttribute('src');preview.load();preview.hidden=true;
  }
  async function selectAudio(kind,file){
    if(!file){clearAudio(kind);return;}
    if(file.size>12*1024*1024){clearAudio(kind);message('Cada arquivo de áudio pode ter no máximo 12 MB.');return;}
    if(!/\.(wav|mp3|m4a|aac|ogg|opus|webm)$/i.test(file.name)){clearAudio(kind);message('Use WAV, MP3, M4A, AAC, OGG, OPUS ou WEBM.');return;}
    try{
      var duration=await audioDuration(file);
      clearAudio(kind);
      var previewUrl=URL.createObjectURL(file);
      audioFiles[kind]={file:file,durationSeconds:duration,previewUrl:previewUrl};
      var preview=el(kind+'-preview');preview.src=previewUrl;preview.hidden=false;preview.load();
      message((kind==='voiceover'?'Locução':'Trilha')+' anexada · '+duration.toFixed(1)+' s · '+(file.size/1048576).toFixed(1)+' MB. Ouça antes de gerar o pacote.');
    }catch(error){clearAudio(kind);message(error.message);}
  }
  function fileBase64(file){
    return new Promise(function(resolve,reject){
      var reader=new FileReader();
      reader.onload=function(){var value=String(reader.result||'');var comma=value.indexOf(',');if(comma<0){reject(new Error('Falha ao ler áudio.'));return;}resolve(value.slice(comma+1));};
      reader.onerror=function(){reject(new Error('Falha ao ler áudio.'));};
      reader.readAsDataURL(file);
    });
  }
  async function serializeAudio(entry){
    if(!entry)return null;
    return {filename:entry.file.name,mimeType:entry.file.type||'application/octet-stream',sizeBytes:entry.file.size,durationSeconds:entry.durationSeconds,contentBase64:await fileBase64(entry.file)};
  }
  function download(data,name,type){var blob=new Blob([data],{type:type});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
  function suggest(){
    var topic=project.topic.trim()||project.title.trim();
    if(!topic){message('Preencha a ideia central para sugerir aberturas.');el('topic').focus();return;}
    el('hookA').value='O detalhe mais surpreendente sobre '+topic+' começa aqui.';
    el('hookB').value='Você sabe o que realmente acontece com '+topic+'?';
    el('hookC').value='Parece simples, mas '+topic+' tem uma explicação inesperada.';
    formToProject();message('Três modelos de gancho criados. Ajuste a linguagem ao seu público.');
  }
  async function copy(){
    var data=exportText();try{await navigator.clipboard.writeText(data);message('Plano copiado. Cole o briefing no ChatGPT para continuar a criação.');}
    catch(e){download(data,safeFilename(project.title)+'.txt','text/plain;charset=utf-8');message('Cópia pelo navegador indisponível. Baixei o arquivo .txt.');}
  }
  function importData(file){
    if(!file)return;
    if(file.size>100000){message('JSON muito grande. Limite de 100 KB.');return;}
    var reader=new FileReader();reader.onload=function(){
      try{var raw=JSON.parse(reader.result);if(raw.version!==1||typeof raw.title!=='string'||!Array.isArray(raw.scenes))throw new Error('invalid');
        if(project.title&&!confirm('Substituir o rascunho atual pelo JSON importado?'))return;
        project=sanitizedProject(raw);active=0;persist();projectToForm();message('Projeto importado. Confira as cenas e informações.');}
      catch(e){message('Arquivo inválido ou versão não suportada.');}};
    reader.onerror=function(){message('Erro ao ler o arquivo.');};reader.readAsText(file);
  }
  document.addEventListener('DOMContentLoaded',function(){
    load();projectToForm();
    el('brief-form').addEventListener('input',formToProject);
    el('brief-form').addEventListener('change',formToProject);
    el('suggest-hooks').addEventListener('click',suggest);
    el('generate-scenes').addEventListener('click',generate);
    el('copy-brief').addEventListener('click',copy);
    el('download-json').addEventListener('click',function(){persist();download(JSON.stringify(project,null,2),safeFilename(project.title)+'.json','application/json;charset=utf-8');message('JSON exportado para o seu dispositivo.');});
    el('download-txt').addEventListener('click',function(){download(exportText(),safeFilename(project.title)+'.txt','text/plain;charset=utf-8');message('Roteiro exportado.');});
    el('voiceover-file').addEventListener('change',function(e){selectAudio('voiceover',e.target.files&&e.target.files[0]);});
    el('music-file').addEventListener('change',function(e){selectAudio('music',e.target.files&&e.target.files[0]);});
    el('build-composition').addEventListener('click',async function(){
      formToProject();
      if(project.scenes.length!==5){message('Monte e revise as cinco cenas antes de gerar a composição.');return;}
      message('Gerando pacote HyperFrames. Nenhum job será criado...');
      try{
        var voiceover=await serializeAudio(audioFiles.voiceover);
        var music=await serializeAudio(audioFiles.music);
        var totalAudio=(audioFiles.voiceover?audioFiles.voiceover.file.size:0)+(audioFiles.music?audioFiles.music.file.size:0);
        if(totalAudio>18*1024*1024)throw new Error('A soma dos áudios deve ter no máximo 18 MB.');
        var payload=Object.assign({},project,{mediaAssets:{voiceover:voiceover,music:music}});
        var response=await fetch('/api/studio/compose',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
        var data=await response.json().catch(function(){return {};});
        if(!response.ok)throw new Error(data.error||'Não foi possível gerar a composição.');
        download(JSON.stringify(data,null,2),safeFilename(project.title)+'-hyperframes-package.json','application/json;charset=utf-8');
        message('Pacote gerado e baixado. Não foi enviado à fila. Bloqueios: '+data.readiness.blockers.join(' '));
      }catch(error){message(error.message);}
    });

    el('new-project').addEventListener('click',function(){if(!confirm('Criar um novo projeto? Exporte o atual antes de substituí-lo.'))return;try{localStorage.removeItem(STORAGE);}catch(e){}clearAudio('voiceover');clearAudio('music');el('voiceover-file').value='';el('music-file').value='';project=sanitizedProject({duration:'45',intent:'curiosidade',tone:'investigativo',scenes:[]});active=0;projectToForm();persist();message('Novo rascunho criado.');});
    el('import-json').addEventListener('click',function(){el('import-file').click();});
    el('import-file').addEventListener('change',function(e){importData(e.target.files&&e.target.files[0]);e.target.value='';});
  });
})();
