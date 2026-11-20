import test from "node:test";
import assert from "node:assert/strict";
import {fillMissingCinematicFootage} from "../src/motion/stock-footage-source.mjs";

const sample=()=>({height:1920,width:1080,scenes:[
{id:"a",type:"footage",media:"assets/a.mp4",stockQuery:"couple talking in kitchen"},
{id:"b",type:"photo",media:"assets/b.jpg"}]});
const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from("ftypisom"),Buffer.alloc(60)]);
const canned=async (url,options)=>{
 if(url.includes("api.pexels.com"))return {ok:true,json:async()=>({videos:[{id:20031,video_files:[{width:1080,height:1920,file_type:"video/mp4",link:"https://videos.pexels.com/video-files/20031/20031.mp4"}]}]})};
 return {ok:true,headers:{get:()=>String(mp4.length)},body:(async function*(){yield mp4;})()};
};
test("stock sourcing is explicitly opt-in and fail-closed without key",async()=>{
 const p=sample(),assets=[{path:"assets/b.jpg",contentBase64:"abcd"}];
 await assert.rejects(fillMissingCinematicFootage(p,assets,{enabled:false,apiKey:"k",fetchImpl:canned}),/supply asset files/);
 await assert.rejects(fillMissingCinematicFootage(p,assets,{enabled:true,apiKey:"",fetchImpl:canned}),/PEXELS_API_KEY/);
});
test("authorized clip search produces a real local MP4 with source and license provenance",async()=>{
 const p=sample(),assets=[{path:"assets/b.jpg",contentBase64:"abcd"}];
 const result=await fillMissingCinematicFootage(p,assets,{enabled:true,apiKey:"EXAMPLE_KEY",fetchImpl:canned});
 assert.equal(result.sourcedCount,1);
 assert.equal(result.plan.scenes[0].mediaRights,"stock-licensed");
 assert.equal(result.provenance[0].provider,"Pexels");
 assert.equal(Buffer.from(result.assets.at(-1).contentBase64,"base64").toString("ascii",4,8),"ftyp");
 assert.equal(p.scenes[0].mediaRights,undefined,"input remains untouched");
});
test("rejects ambiguous query and refuses to replace missing scene with flat vectors",async()=>{
 const p=sample();delete p.scenes[0].stockQuery;
 await assert.rejects(fillMissingCinematicFootage(p,[],{enabled:true,apiKey:"k",fetchImpl:canned}),/stockQuery/);
});
