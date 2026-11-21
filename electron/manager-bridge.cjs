const net=require('node:net'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
function createManagerBridge(directory,onMessage){
 const token=crypto.randomBytes(32).toString('hex'),pipe='\\\\.\\pipe\\CreativeFlow-Manager-'+crypto.randomUUID();
 const server=net.createServer(socket=>{let input='',handled=false;socket.setTimeout(5000,()=>socket.destroy());socket.on('data',chunk=>{if(handled)return;input+=chunk.toString('utf8');if(input.length>16384){socket.destroy();return;}if(!input.includes('\n'))return;handled=true;try{const data=JSON.parse(input.split('\n')[0]);if(data.token!==token||!['ready','activate','open-client','preferences'].includes(data.type))throw Error();Promise.resolve(onMessage(data)).then(()=>socket.end('{"ok":true}\n')).catch(()=>socket.destroy());}catch{socket.destroy();}});socket.on('error',()=>{});});
 const ready=new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
 fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,crypto.randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify({pipe,token}),{mode:0o600});
 return {ready,file,close(){server.close();try{fs.unlinkSync(file);}catch{}}};
}
async function sendManagerEvent(file,message){
 if(!file)return false;let info;try{info=JSON.parse(fs.readFileSync(file,'utf8'));if(!/^\\\\\.\\pipe\\CreativeFlow-Manager-[a-f0-9-]+$/.test(info.pipe)||!/^[a-f0-9]{64}$/.test(info.token))return false;}catch{return false;}
 return new Promise(resolve=>{let done=false,reply='';const socket=net.connect(info.pipe),finish=ok=>{if(done)return;done=true;socket.destroy();resolve(ok);};socket.setTimeout(4000,()=>finish(false));socket.on('error',()=>finish(false));socket.on('close',()=>finish(false));socket.on('connect',()=>socket.write(JSON.stringify({...message,token:info.token})+'\n'));socket.on('data',chunk=>{reply+=chunk.toString('utf8');if(reply.length>1024){finish(false);return;}if(reply.includes('\n')){try{finish(JSON.parse(reply.split('\n')[0]).ok===true);}catch{finish(false);}}});});
}
module.exports={createManagerBridge,sendManagerEvent};
