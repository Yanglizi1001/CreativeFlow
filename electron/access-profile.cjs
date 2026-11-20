const {X509Certificate}=require('node:crypto');
function validateAccessProfile(input,now=Date.now()){
  if(!input||input.format!=='creativeflow-company-access'||input.version!==1)throw Error('不是受支持的公司接入文件，请从管理员获取新版文件');
  const url=new URL(input.host);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('接入文件中的主机地址无效');
  if(typeof input.certificate!=='string'||input.certificate.length>24000||!/^[A-Za-z0-9+/=\r\n]+$/.test(input.certificate))throw Error('接入文件中的公开证书无效');
  const cert=new X509Certificate(Buffer.from(input.certificate,'base64'));
  if(now<Date.parse(cert.validFrom)||now>=Date.parse(cert.validTo))throw Error('公司主机证书尚未生效或已过期，请联系管理员');
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  if(!(require('node:net').isIP(hostname)?cert.checkIP(hostname):cert.checkHost(hostname,{subject:'never'})))throw Error('主机地址与证书名称不匹配，请联系管理员重新导出接入文件');
  const fingerprint=cert.fingerprint256.replaceAll(':','');
  if(typeof input.fingerprintSha256!=='string'||input.fingerprintSha256.replaceAll(':','').toUpperCase()!==fingerprint)throw Error('接入文件的证书指纹不一致，已停止配置');
  if(cert.subject!==cert.issuer||!cert.verify(cert.publicKey))throw Error('接入证书不是受支持的公司自签名主机证书');
  if(typeof input.workspaceName!=='string'||!input.workspaceName.trim()||input.workspaceName.length>80)throw Error('公司空间名称无效');
  return {format:input.format,version:1,host:url.origin,workspaceName:input.workspaceName.trim(),workspaceId:typeof input.workspaceId==='string'?input.workspaceId.slice(0,80):'',certificate:cert.raw.toString('base64'),fingerprintSha256:fingerprint,thumbprint:cert.fingerprint.replaceAll(':',''),expiresAt:new Date(cert.validTo).toISOString(),serverName:hostname};
}
module.exports={validateAccessProfile};
