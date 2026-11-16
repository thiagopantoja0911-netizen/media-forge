/* Secrets Behavioral Intelligence — private books. Node 22+, no dependencies.
 * IMPORTANT: text corpus is intentionally NOT committed or served as static files.
 */
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync,unlinkSync,renameSync,statSync,lstatSync,chmodSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {realpathSync} from 'node:fs';

const oauth=[{type:'oauth2',scopes:['browser:control']}];
const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const PUBLIC_URL=(process.env.BROWSER_MCP_BRIDGE_URL||'https://mcpbrowser.salevo.site').replace(/\/$/,'');
const MAX_DB_BYTES=50*1024*1024;
function result(value){return {content:[{type:'text',text:JSON.stringify(value)}]};}
function error(code){return result({status:'error',code});}
function digest(s){return createHash('sha256').update(String(s)).digest('hex');}
function secureHeaders(res,status,kind='application/json; charset=utf-8',extra={}){
 res.writeHead(status,{
 'content-type':kind,'cache-control':'no-store','referrer-policy':'no-referrer',
 'x-content-type-options':'nosniff','x-frame-options':'DENY',
 'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
 ...extra
 });
}
export function createBehavioralLibrary(root,{allowImport=Boolean(process.env.BROWSER_MCP_BRIDGE_DATA_DIR),onAuthorizedImportPage=null}={}){
 const rootInfo=lstatSync(root);
 if(rootInfo.isSymbolicLink()||!rootInfo.isDirectory())throw new Error('BROWSER_MCP_BRIDGE_DATA_DIR deve ser um diretorio real');
 const physicalRoot=realpathSync(root);
 chmodSync(physicalRoot,0o700);
 const isPublicPath=physicalRoot.split(sep).includes('public_html') || physicalRoot===resolve(process.cwd()) || physicalRoot.startsWith(resolve(process.cwd())+sep);
 if(isPublicPath)allowImport=false;
 const tickets=new Map();
 let uploadBusy=false;
 function dbPath(owner){
  return join(root,'behavioral-knowledge',digest(owner),'biblioteca.sqlite');
 }
 function withDb(owner,fn){
  if(typeof owner!=='string'||!owner) return {status:'unauthorized'};
  const path=dbPath(owner);
  if(!existsSync(path))return {status:'not_imported'};
  const db=new DatabaseSync(path,{readOnly:true});
  try{return fn(db);}finally{db.close();}
 }
 const toolSpecs={
  sbi_library_status:{name:'sbi_library_status',description:'Informa se a biblioteca privada do usuário OAuth foi importada e quantas fontes estão disponíveis.',inputSchema:schema(),securitySchemes:oauth},
  sbi_library_search:{name:'sbi_library_search',description:'Busca a biblioteca privada; devolve excertos breves com título e página PDF ou seção EPUB. Pode restringir por título da obra. Exige OAuth, sem compartilhamento entre usuários.',inputSchema:schema({query:{type:'string',minLength:2,maxLength:180},document:{type:'string',minLength:2,maxLength:140},limit:{type:'number',minimum:1,maximum:5}},['query']),securitySchemes:oauth},
  sbi_library_import_session:{name:'sbi_library_import_session',description:'Gera link temporário e privado para importar arquivo SQLite da biblioteca pelo navegador, sem colocar livros em public_html. Exige armazenamento persistente configurado.',inputSchema:schema(),securitySchemes:oauth},
  sbi_library_index_visual_pages:{name:'sbi_library_index_visual_pages',description:'Adiciona resumos visuais estruturados por página ao índice privado do PDF 108 Proven Split Test Winners. É indexação semântica por página, não transcrição OCR literal. Exige OAuth do proprietário.',inputSchema:schema({documentId:{type:'string'},payload:{type:'string',maxLength:42000}},['documentId','payload']),securitySchemes:oauth},
  sbi_library_index_ocr_pages:{name:'sbi_library_index_ocr_pages',description:'Indexa texto OCR literal por página do PDF 108 Proven Split Test Winners. Atualiza resumos visuais ou páginas sem texto, preserva texto substantivo já existente e não rotula OCR como resumo. Até 6 páginas e 6.000 caracteres por página. Exige OAuth do proprietário.',inputSchema:schema({documentId:{type:'string'},payload:{type:'string',maxLength:42000}},['documentId','payload']),securitySchemes:oauth}
 };
 function runTool(owner,name,args={}){
  try{
   if(name==='sbi_library_status')return result(withDb(owner,db=>{
    const documents=db.prepare('SELECT COUNT(*) AS n FROM documents').get()?.n??0;
    const totalUnits=db.prepare('SELECT COUNT(*) AS n FROM units').get()?.n??0;
    const contentQualityUnits=db.prepare('SELECT COUNT(*) AS n FROM units WHERE text_chars>39').get()?.n??0;
    const searchUnits=db.prepare('SELECT COUNT(*) AS n FROM search').get()?.n??0;
    const coverage=db.prepare("SELECT d.id,d.title,(SELECT COUNT(*) FROM units u WHERE u.doc_id=d.id) AS unitCount,(SELECT COUNT(*) FROM search s JOIN units u ON u.id=s.rowid WHERE u.doc_id=d.id) AS searchUnitCount,(SELECT COUNT(*) FROM units u WHERE u.doc_id=d.id AND u.text_chars>39) AS contentQualityUnitCount FROM documents d ORDER BY d.title").all();
    const pendingDocuments=coverage.filter(d=>d.unitCount===0||d.searchUnitCount<d.unitCount);
    const qualityReviewDocuments=coverage.filter(d=>d.contentQualityUnitCount<d.unitCount).map(d=>({id:d.id,title:d.title,contentQualityUnitCount:d.contentQualityUnitCount,unitCount:d.unitCount}));
    const indexedDocuments=coverage.length-pendingDocuments.length;
    return {
     status:pendingDocuments.length?'partial':'ready',
     qualityReviewStatus:qualityReviewDocuments.length?'review_needed':'ok',
     documents,indexedDocuments,pendingDocuments,qualityReviewDocuments,
     totalUnits,indexedUnits:searchUnits,searchUnits,contentQualityUnits,
     unitsNeedingContentReview:totalUnits-contentQualityUnits,
     libraryBytes:statSync(dbPath(owner)).size
    };
   }));
   if(name==='sbi_library_search'){
    const raw=String(args.query||'').slice(0,180).trim();
    const terms=(raw.match(/[\p{L}\p{N}]{2,40}/gu)||[]).slice(0,5);
    if(!terms.length)return error('invalid_query');
    const q=terms.map(t=>'"'+t+'"').join(' OR ');
    const limit=Math.max(1,Math.min(5,Math.floor(Number(args.limit)||3)));
    return result(withDb(owner,db=>{
     const document=String(args.document||'').trim().slice(0,140);
     const rows=document
      ?db.prepare('SELECT d.title,d.id AS document_id,u.unit_label,u.text FROM search s JOIN units u ON u.id=s.rowid JOIN documents d ON d.id=u.doc_id WHERE search MATCH ? AND d.title LIKE ? LIMIT ?').all(q,'%'+document+'%',limit)
      :db.prepare('SELECT d.title,d.id AS document_id,u.unit_label,u.text FROM search s JOIN units u ON u.id=s.rowid JOIN documents d ON d.id=u.doc_id WHERE search MATCH ? LIMIT ?').all(q,limit);
     return {status:'ready',results:rows.map(r=>{
      const lower=r.text.toLowerCase(),position=terms.map(t=>lower.indexOf(t.toLowerCase())).filter(x=>x>=0);
      const i=position.length?Math.min(...position):0;
      const start=Math.max(0,i-75);
      return {title:r.title,document_id:r.document_id,source:r.unit_label,excerpt:r.text.slice(start,start+320)};
     })};
    }));
   }
   if(name==='sbi_library_index_visual_pages'){
    const documentId=String(args.documentId||'');
    if(typeof args.payload!=='string'||args.payload.length>42000)return error('payload_too_large');
    let payload;
    try{payload=JSON.parse(args.payload)}catch{return error('invalid_payload');}
    if(!Array.isArray(payload.pages)||payload.pages.length<1||payload.pages.length>12)return error('invalid_page_batch');
    const path=dbPath(owner);
    if(!existsSync(path))return result({status:'not_imported'});
    const db=new DatabaseSync(path);
    try{
     const doc=db.prepare('SELECT id,title,indexed_units FROM documents WHERE id=?').get(documentId);
     if(!doc||!String(doc.title).includes('108 Proven Split Test Winners'))return error('document_not_allowed');
     const seen=new Set();
     for(const page of payload.pages){
      if(!page||typeof page!=='object'||Array.isArray(page))return error('invalid_ocr_page');
      if(!Number.isInteger(page.page)||page.page<1||page.page>144||seen.has(page.page))return error('invalid_page_number');
      seen.add(page.page);
      if(typeof page.text!=='string'||page.text.trim().length<40||page.text.length>3200)return error('invalid_page_text');
     }
     const existingRows=db.prepare('SELECT id,unit_label,text,text_chars FROM units WHERE doc_id=?').all(documentId);
     const byPage=new Map();
     for(const row of existingRows){
      const match=String(row.unit_label||'').match(/(?:p[aá]gina|page)\s*0*(\d+)/i);
      if(match&&!byPage.has(Number(match[1])))byPage.set(Number(match[1]),row);
     }
     db.exec('BEGIN IMMEDIATE');
     let inserted=0,updated=0,skipped=0;
     for(const page of payload.pages){
      const label='PDF página '+page.page+' — resumo visual';
      const textValue='RESUMO VISUAL (não é transcrição literal). '+page.text.trim();
      const prior=byPage.get(page.page)||db.prepare('SELECT id,unit_label,text,text_chars FROM units WHERE doc_id=? AND unit_label=?').get(documentId,label);
      if(prior){
       if(prior.text===textValue){skipped++;continue;}
       if(Number(prior.text_chars||0)>39&&!String(prior.text||'').startsWith('RESUMO VISUAL ')){
        db.exec('ROLLBACK');return error('page_has_existing_text');
       }
       const ftsRow=db.prepare('SELECT rowid FROM search WHERE rowid=?').get(prior.id);
       if(ftsRow)db.prepare("INSERT INTO search(search,rowid,title,text) VALUES('delete',?,?,?)").run(prior.id,doc.title,String(prior.text||''));
       db.prepare('UPDATE units SET unit_label=?,text=?,text_chars=? WHERE id=?').run(label,textValue,textValue.length,prior.id);
       db.prepare('INSERT INTO search(rowid,title,text) VALUES(?,?,?)').run(prior.id,doc.title,textValue);
       updated++;
      }else{
       const added=db.prepare('INSERT INTO units(doc_id,unit_label,text,text_chars) VALUES(?,?,?,?)').run(documentId,label,textValue,textValue.length);
       db.prepare('INSERT INTO search(rowid,title,text) VALUES(?,?,?)').run(Number(added.lastInsertRowid),doc.title,textValue);
       inserted++;
      }
     }
     const indexed=db.prepare('SELECT COUNT(*) AS n FROM units WHERE doc_id=? AND text_chars>39').get(documentId).n;
     db.prepare('UPDATE documents SET indexed_units=? WHERE id=?').run(indexed,documentId);
     const totalDocs=db.prepare('SELECT COUNT(*) AS n FROM documents').get().n;
     const pendingDocs=db.prepare('SELECT COUNT(*) AS n FROM documents d WHERE (SELECT COUNT(*) FROM units u WHERE u.doc_id=d.id)=0 OR d.indexed_units<(SELECT COUNT(*) FROM units u WHERE u.doc_id=d.id)').get().n;
     const indexedDocs=totalDocs-pendingDocs;
     db.exec('COMMIT');
     return result({status:pendingDocs===0?'ready':'partial',documentId,title:doc.title,inserted,updated,skipped,indexedPages:indexed,indexedDocuments:indexedDocs,documents:totalDocs});
    }catch(e){
     try{db.exec('ROLLBACK')}catch{}
     return error('index_write_failed');
    }finally{db.close();}
   }
   if(name==='sbi_library_index_ocr_pages'){
    const documentId=String(args.documentId||'');
    if(typeof args.payload!=='string'||args.payload.length>42000)return error('payload_too_large');
    let payload;
    try{payload=JSON.parse(args.payload)}catch{return error('invalid_payload');}
    if(!Array.isArray(payload.pages)||payload.pages.length<1||payload.pages.length>6)return error('invalid_page_batch');
    const path=dbPath(owner);
    if(!existsSync(path))return result({status:'not_imported'});
    const db=new DatabaseSync(path);
    try{
     const doc=db.prepare('SELECT id,title,indexed_units FROM documents WHERE id=?').get(documentId);
     if(!doc||!String(doc.title).includes('108 Proven Split Test Winners'))return error('document_not_allowed');
     const seen=new Set(),pages=[];
     for(const page of payload.pages){
      if(!Number.isInteger(page.page)||page.page<1||page.page>144||seen.has(page.page))return error('invalid_page_number');
      seen.add(page.page);
      if(typeof page.text!=='string')return error('invalid_ocr_text');
      const textValue=page.text.replace(/\u0000/g,'').replace(/\r\n?/g,'\n').trim();
      if(textValue.length<40||textValue.length>6000)return error('invalid_ocr_text');
      pages.push({page:page.page,text:textValue});
     }
     const existingRows=db.prepare('SELECT id,unit_label,text,text_chars FROM units WHERE doc_id=?').all(documentId);
     const byPage=new Map();
     for(const row of existingRows){
      const match=String(row.unit_label||'').match(/(?:p[aá]gina|page)\s*0*(\d+)/i);
      if(match&&!byPage.has(Number(match[1])))byPage.set(Number(match[1]),row);
     }
     db.exec('BEGIN IMMEDIATE');
     let inserted=0,updated=0,skipped=0;
     for(const page of pages){
      const label='PDF página '+page.page+' — OCR';
      const prior=byPage.get(page.page);
      if(prior){
       const priorText=String(prior.text||'');
       const priorLabel=String(prior.unit_label||'');
       if(priorText===page.text&&/OCR/i.test(priorLabel)){skipped++;continue;}
       const replaceable=Number(prior.text_chars||0)<=39||
        priorText.startsWith('RESUMO VISUAL ')||
        /resumo visual/i.test(priorLabel)||
        /— OCR$/i.test(priorLabel);
       if(!replaceable){
        db.exec('ROLLBACK');
        return error('page_has_existing_text');
       }
       const ftsRow=db.prepare('SELECT rowid FROM search WHERE rowid=?').get(prior.id);
       if(ftsRow)db.prepare("INSERT INTO search(search,rowid,title,text) VALUES('delete',?,?,?)").run(prior.id,doc.title,priorText);
       db.prepare('UPDATE units SET unit_label=?,text=?,text_chars=? WHERE id=?').run(label,page.text,page.text.length,prior.id);
       db.prepare('INSERT INTO search(rowid,title,text) VALUES(?,?,?)').run(prior.id,doc.title,page.text);
       updated++;
      }else{
       const added=db.prepare('INSERT INTO units(doc_id,unit_label,text,text_chars) VALUES(?,?,?,?)').run(documentId,label,page.text,page.text.length);
       db.prepare('INSERT INTO search(rowid,title,text) VALUES(?,?,?)').run(Number(added.lastInsertRowid),doc.title,page.text);
       inserted++;
      }
     }
     const qualityPages=db.prepare('SELECT COUNT(*) AS n FROM units WHERE doc_id=? AND text_chars>39').get(documentId).n;
     db.prepare('UPDATE documents SET indexed_units=? WHERE id=?').run(qualityPages,documentId);
     const totalUnits=db.prepare('SELECT COUNT(*) AS n FROM units').get().n;
     const searchUnits=db.prepare('SELECT COUNT(*) AS n FROM search').get().n;
     const contentQualityUnits=db.prepare('SELECT COUNT(*) AS n FROM units WHERE text_chars>39').get().n;
     const coverage=db.prepare("SELECT d.id,(SELECT COUNT(*) FROM units u WHERE u.doc_id=d.id) AS unitCount,(SELECT COUNT(*) FROM search s JOIN units u ON u.id=s.rowid WHERE u.doc_id=d.id) AS searchUnitCount FROM documents d").all();
     const pendingDocuments=coverage.filter(d=>d.unitCount===0||d.searchUnitCount<d.unitCount).length;
     const documents=coverage.length;
     db.exec('COMMIT');
     return result({
      status:pendingDocuments?'partial':'ready',
      documentId,title:doc.title,processedPages:pages.length,inserted,updated,skipped,
      documentQuality:{contentQualityPages:qualityPages,unitCount:db.prepare('SELECT COUNT(*) AS n FROM units WHERE doc_id=?').get(documentId).n},
      documents,indexedDocuments:documents-pendingDocuments,
      totalUnits,searchUnits,contentQualityUnits,
      unitsNeedingContentReview:totalUnits-contentQualityUnits
     });
    }catch(e){
     try{db.exec('ROLLBACK')}catch{}
     return error('ocr_index_write_failed');
    }finally{db.close();}
   }
   if(name==='sbi_library_import_session'){
    if(!allowImport)return error('persistent_storage_not_configured');
    if(existsSync(dbPath(owner)))return error('already_imported');
    const now=Date.now();
    for(const [key,val] of tickets)if(val.expires<now)tickets.delete(key);
    const t=randomBytes(24).toString('base64url');
    tickets.set(digest(t),{owner,expires:now+15*60*1000});
    return result({status:'ready',uploadUrl:PUBLIC_URL+'/sbi/import?ticket='+t,expiresMinutes:15,
      expectedFile:'biblioteca.sqlite',maxBytes:MAX_DB_BYTES});
   }
   return error('invalid_tool');
  }catch{
   return error('library_unavailable');
  }
 }
 function validTicket(t){
  if(typeof t!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(t))return null;
  const item=tickets.get(digest(t));
  return item&&item.expires>Date.now()?item:null;
 }
 function page(ticket){
  const nonce=randomBytes(18).toString('base64');
  const script='const ticket='+JSON.stringify(ticket)+';document.querySelector("form").addEventListener("submit",async(e)=>{e.preventDefault();const input=document.querySelector("input[type=file]"),out=document.querySelector("#out");if(!input.files.length)return;const f=input.files[0];if(f.size>52428800){out.textContent="Arquivo maior que 50 MiB.";return;}out.textContent="Enviando biblioteca privada...";try{const r=await fetch("/sbi/import",{method:"POST",headers:{"X-SBI-Ticket":ticket,"Content-Type":"application/octet-stream"},body:f});const j=await r.json();out.textContent=r.ok?"Importação concluída: "+j.documents+" fontes.":"Falha: "+(j.code||r.status);}catch{out.textContent="Falha de conexão."}});';
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Importar biblioteca privada</title></head><body style="font:17px system-ui;max-width:600px;margin:8vh auto;padding:20px"><h1>Secrets Behavioral Intelligence</h1><p>Selecione exclusivamente o arquivo <code>biblioteca.sqlite</code> (não o ZIP). Armazenamento privado protegido pelo MCP; o link expira em 15 minutos e só pode ser usado uma vez.</p><form><input type="file" accept=".sqlite,.db,application/octet-stream" required><button>Importar</button></form><p id="out" role="status"></p><script nonce="'+nonce+'">'+script+'</script></body></html>';
  return {html,nonce};
 }
 async function handleImportHttp(req,res,url){
  if(url.pathname!=='/sbi/import')return false;
  const fail=(code,httpStatus=403)=>{secureHeaders(res,httpStatus);res.end(JSON.stringify({status:'error',code}));};
  if(req.method==='GET'){
   const token=url.searchParams.get('ticket');
   const ticketInfo=validTicket(token);
   if(!ticketInfo){fail('invalid_or_expired_ticket');return true;}
   const {html,nonce}=page(token);
   // Set HttpOnly cookie for this OAuth owner only when a legitimate one-time
   // import ticket is opened in the linked Chrome. No OAuth token enters URL.
   const extra=typeof onAuthorizedImportPage==='function'?{'set-cookie':onAuthorizedImportPage(ticketInfo.owner)}:{};
   secureHeaders(res,200,'text/html; charset=utf-8',{...extra,'content-security-policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; form-action 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"});
   res.end(html);return true;
  }
  if(req.method!=='POST'){fail('method_not_allowed',405);return true;}
  const token=String(req.headers['x-sbi-ticket']||'');
  const item=validTicket(token);
  if(!item){fail('invalid_or_expired_ticket');return true;}
  const origin=req.headers.origin;
  if(origin&&origin!==PUBLIC_URL){fail('invalid_origin');return true;}
  const fetchSite=req.headers['sec-fetch-site'];
  if(fetchSite&&fetchSite!=='same-origin'&&fetchSite!=='none'){fail('invalid_fetch_site');return true;}
  if(!allowImport){fail('persistent_storage_not_configured',503);return true;}
  if(uploadBusy){fail('upload_in_progress',429);return true;}
  tickets.delete(digest(token));
  uploadBusy=true;
  let temp;
  try{
   const declared=Number(req.headers['content-length']||0);
   if(declared>MAX_DB_BYTES)throw Error('file_too_large');
   const chunks=[];let n=0;
   for await(const chunk of req){n+=chunk.length;if(n>MAX_DB_BYTES)throw Error('file_too_large');chunks.push(chunk);}
   const data=Buffer.concat(chunks);
   if(data.length<4096||data.subarray(0,16).toString('latin1')!=='SQLite format 3\u0000')throw Error('not_sqlite');
   const dest=dbPath(item.owner);
   if(existsSync(dest))throw Error('already_imported');
   const dir=join(root,'behavioral-knowledge',digest(item.owner));
   mkdirSync(dir,{recursive:true,mode:0o700});
   chmodSync(dir,0o700);
   temp=join(dir,'.upload-'+randomBytes(12).toString('hex'));
   writeFileSync(temp,data,{flag:'wx',mode:0o600});
   const db=new DatabaseSync(temp,{readOnly:true});
   let documents=0;
   try{
    if(db.prepare('PRAGMA quick_check').get()?.quick_check!=='ok')throw Error('corrupted_sqlite');
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all().map(x=>x.name));
    for(const name of ['documents','units','search'])if(!tables.has(name))throw Error('wrong_schema');
    documents=db.prepare('SELECT COUNT(*) AS n FROM documents').get()?.n??0;
    const units=db.prepare('SELECT COUNT(*) AS n FROM units').get()?.n??0;
    if(!documents||!units)throw Error('empty_library');
    db.prepare("SELECT rowid FROM search WHERE search MATCH ? LIMIT 1").all('"marketing"');
   }finally{db.close();}
   renameSync(temp,dest);chmodSync(dest,0o600);temp=null;
   secureHeaders(res,200);res.end(JSON.stringify({status:'ready',documents}));
  }catch(e){
   if(temp)try{unlinkSync(temp)}catch{}
   const known=new Set(['file_too_large','not_sqlite','already_imported','corrupted_sqlite','wrong_schema','empty_library']);
   fail(known.has(e.message)?e.message:'import_failed',400);
  }finally{uploadBusy=false;}
  return true;
 }
 return {toolSpecs,runTool,handleImportHttp};
}
