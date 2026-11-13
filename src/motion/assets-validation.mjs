// Defensive media headers for the cinematic path.
// Full decoding and synchronization are verified by HyperFrames/FFmpeg later.
const imageTypes=new Set(["jpg","jpeg","png","webp"]);
const videoTypes=new Set(["mp4","webm"]);
const audioTypes=new Set(["mp3","wav","m4a","aac","ogg","opus","webm"]);
const bytes=(buffer,...prefix)=>prefix.every((part,i)=>buffer[i]===part);
export function validateCinematicMediaAssets(plan,files){
  if(plan?.productionMode!=="cinematic")return;
  const media=new Map((files||[]).map(f=>[f.path,f]));
  const sources=[
    ...plan.scenes.filter(s=>s?.media).map(s=>({path:s.media,role:"visual"})),
    ...(plan.audioCues||[]).filter(c=>c?.src).map(c=>({path:c.src,role:"audio"}))
  ];
  for(const {path,role} of sources){
    const file=media.get(path);
    if(!file||typeof file.contentBase64!=="string")throw new Error("Cinematic asset must be packaged in base64: "+path);
    const buf=Buffer.from(file.contentBase64,"base64");
    if(buf.length<16)throw new Error("Cinematic asset too small: "+path);
    const ext=String(path).toLowerCase().split(".").pop();
    if(role==="visual"&&!imageTypes.has(ext)&&!videoTypes.has(ext))throw new Error("Cinematic visual must use photo or video, not vector/HTML: "+path);
    if(role==="audio"&&!audioTypes.has(ext))throw new Error("Cinematic soundtrack must be an audio file: "+path);
    const signatures={
      jpg:b=>bytes(b,0xff,0xd8,0xff),
      jpeg:b=>bytes(b,0xff,0xd8,0xff),
      png:b=>bytes(b,0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a),
      webp:b=>b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WEBP",
      mp4:b=>b.toString("ascii",4,8)==="ftyp",
      webm:b=>bytes(b,0x1a,0x45,0xdf,0xa3),
      wav:b=>b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WAVE",
      mp3:b=>b.toString("ascii",0,3)==="ID3"||(b[0]===0xff&&(b[1]&0xe0)===0xe0),
      m4a:b=>b.toString("ascii",4,8)==="ftyp",
      aac:b=>b[0]===0xff&&(b[1]&0xf0)===0xf0,
      ogg:b=>b.toString("ascii",0,4)==="OggS",
      opus:b=>b.toString("ascii",0,4)==="OggS"
    };
    if(!signatures[ext]?.(buf))throw new Error("Invalid cinematic media header: "+path);
  }
}
