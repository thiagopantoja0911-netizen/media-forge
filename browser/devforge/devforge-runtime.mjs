import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {compress, compressDescriptionsInPlace}=require('./caveman-compress.cjs');

// Read-only, bounded tools hosted on the existing, OAuth-protected Browser MCP relay.
// The original Caveman Node compressor is used without modification.
// RTK's Rust binary is intentionally not embedded in the public HTTP server.
const MAX_TEXT=16000;
const MAX_CATALOG=40000;
const scopes=[{type:'oauth2',scopes:['browser:control']}];
const spec=(name,description,properties={},required=[])=>({
  name,description,securitySchemes:scopes,inputSchema:{
    type:'object',properties,required,additionalProperties:false
  }
});
export const toolSpecs={
  devforge_status:spec(
    'devforge_status',
    'Verifica as capacidades reais do DevForge no Browser MCP. Superpowers/RTK/Caveman são skills do plugin; o compressor Caveman JS está ativo; RTK nativo não é executado no servidor.'
  ),
  devforge_compact_text:spec(
    'devforge_compact_text',
    'Compacta com o compressor JS ORIGINAL do Caveman (Apache-2.0), preservando trechos de código, URLs, caminhos e identificadores. Indicada para prosa técnica; não use para dados que exijam fidelidade literal.',
    {text:{type:'string'}},['text']
  ),
  devforge_compact_catalog:spec(
    'devforge_compact_catalog',
    'Compacta somente descrições de um catálogo JSON de ferramentas MCP com o compressor ORIGINAL Caveman; preserva os campos estruturais e tipos.',
    {catalogJson:{type:'string'}},['catalogJson']
  )
};
const err=(code,message)=>({isError:true,content:[{type:'text',text:JSON.stringify({code,message})}]});
const result=(data)=>({content:[{type:'text',text:JSON.stringify(data)}]});
function checkSize(value,max){
  if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>max)throw Object.assign(new Error('Entrada fora do limite'),{code:'too_large'});
  return value;
}
export function runTool(_owner,action,args={}){
  try{
    if(action==='devforge_status'){
      return result({
        status:'ready',
        browserMcpIntegration:true,
        liveNativeTools:['caveman_js_shrink'],
        pluginSkills:{superpowers:15,rtk:12,caveman:22,devforge:5},
        nativeRtkCompiled:false,
        nativeCavemanGoCompiled:false,
        commandInterception:false,
        chatgptModelRouting:false,
        notes:'Este servidor não executa comandos locais ou modelos e não intercepta tokens da interface ChatGPT.'
      });
    }
    if(action==='devforge_compact_text'){
      const original=checkSize(args.text,MAX_TEXT);
      const x=compress(original);
      return result({status:'ok',engine:'original-caveman-js',original:x.before,compressed:x.after,text:x.compressed});
    }
    if(action==='devforge_compact_catalog'){
      const raw=checkSize(args.catalogJson,MAX_CATALOG);
      let catalog;try{catalog=JSON.parse(raw);}catch{return err('invalid_json','O catálogo deve ser JSON válido');}
      if(!catalog||typeof catalog!=='object')return err('invalid_json','O catálogo deve ser objeto ou lista');
      const before=Buffer.byteLength(raw,'utf8');
      compressDescriptionsInPlace(catalog);
      const text=JSON.stringify(catalog);
      return result({status:'ok',engine:'original-caveman-js',inputBytes:before,outputBytes:Buffer.byteLength(text,'utf8'),catalog:catalog});
    }
    return err('unknown_tool','Ferramenta DevForge desconhecida');
  }catch(e){return err(e.code||'invalid_arguments',e.message||'Erro ao processar entrada');}
}
