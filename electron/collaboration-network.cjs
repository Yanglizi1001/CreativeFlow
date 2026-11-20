const PARTITION='creativeflow-lan-collaboration-v1';
function createCollaborationNetwork(electron=require('electron')) {
  // Company traffic has its own in-memory session. Do not change the UI session,
  // Windows proxy settings or another app's traffic. Only approved company
  // certificates can extend verification within this collaboration session.
  let channel,ready;
  const failures=new Map();
  const companyCertificates=new Map();
  const verifyCertificate=(request,callback)=>{
    const profiles=companyCertificates.get(request.hostname.toLowerCase());if(!profiles)return callback(-3);
    try {
      const cert=new (require('node:crypto').X509Certificate)(request.certificate.data),now=Date.now();
      const match=profiles.some(profile=>profile.fingerprintSha256===cert.fingerprint256.replaceAll(':',''));
      if(!match||now<Date.parse(cert.validFrom)||now>=Date.parse(cert.validTo)||!cert.checkHost(request.hostname,{subject:'never'})||!cert.verify(cert.publicKey))return callback(-202);
      if(request.verificationResult==='net::OK')return callback(-3);
      callback(request.verificationResult==='net::ERR_CERT_AUTHORITY_INVALID'?0:-202);
    }catch{callback(-202)}
  };
  function openSession(partition){
    channel=electron.session.fromPartition(partition,{cache:false});ready=channel.setProxy({mode:'direct'});channel.setCertificateVerifyProc(verifyCertificate);
    channel.webRequest.onErrorOccurred(details=>{failures.set(details.url,{code:details.error,at:Date.now()});while(failures.size>128)failures.delete(failures.keys().next().value);});
  }
  openSession(PARTITION);
  return {
    get session(){return channel},get ready(){return ready},
    trustCompanyProfile(profile){const key=profile.serverName.toLowerCase();companyCertificates.set(key,[...(companyCertificates.get(key)||[]).filter(row=>row.host!==profile.host),profile]);const previous=channel;openSession(PARTITION+'-'+require('node:crypto').randomUUID());void previous.closeAllConnections?.();return ready;},
    async fetch(url,options){
      await ready;
      try{return await channel.fetch(url,options)}catch(error){
        await new Promise(resolve=>setImmediate(resolve));
        const recent=failures.get(String(url));failures.delete(String(url));
        if(recent&&Date.now()-recent.at<15000){const wrapped=Error(recent.code,{cause:error});wrapped.name=error.name;throw wrapped;}throw error;
      }
    },
    request(options){return electron.net.request({...options,session:channel});}
  };
}
module.exports={PARTITION,createCollaborationNetwork};
