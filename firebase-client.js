/* Firebase web config is public. Never put an OpenAI secret in this file. */
window.SPONGE_CLOUD_ENABLED = false; // Set true only after deployment + admin publishing + a successful test.
window.SpongeCloud = (() => {
  const config = {
    apiKey:'AIzaSyDwq1aSEMN5TpzqrtHvGMCXEStRpI158Sc',
    authDomain:'spongemap-81a6e.firebaseapp.com', projectId:'spongemap-81a6e',
    storageBucket:'spongemap-81a6e.firebasestorage.app', messagingSenderId:'900480282894',
    appId:'1:900480282894:web:8bb808a797b5af9b78275f',measurementId:'G-PR4PC1LZ4Y'
  };
  const base='https://asia-northeast3-spongemap-81a6e.cloudfunctions.net/spongemapApi';
  const keys=["sponge_intro_text","sponge_greeting_text","sponge_select_subtitle","sponge_start_btn","sponge_chat_placeholder","sponge_intro_sway_deg","sponge_aurora_v1","sponge_stages","sponge_places","sponge_flow_prompt_v1","sponge_super_prompt","sponge_prompt_blue","sponge_prompt_gold","sponge_usage_budget_v1"];
  let credential=null;
  async function firebaseAuth(method,body){
    const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:'+method+'?key='+config.apiKey,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,returnSecureToken:true}),signal:AbortSignal.timeout(15000)
    });
    const result=await response.json();
    if(!response.ok)throw Error('Firebase 인증 실패: '+(result.error?.message||response.status));
    credential={...result,expiresAt:Date.now()+Number(result.expiresIn||3600)*1000-60000};
    return credential;
  }
  async function token(){
    if(!credential)await firebaseAuth('signUp',{});
    if(Date.now()>=credential.expiresAt){
      const response=await fetch('https://securetoken.googleapis.com/v1/token?key='+config.apiKey,{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'refresh_token',refresh_token:credential.refreshToken}),signal:AbortSignal.timeout(15000)
      });
      const r=await response.json();
      if(!response.ok){credential=null;throw Error('로그인이 만료되었습니다. 다시 로그인해 주세요');}
      credential={...credential,idToken:r.id_token,refreshToken:r.refresh_token,expiresAt:Date.now()+Number(r.expires_in)*1000-60000};
    }
    return credential.idToken;
  }
  async function request(path,body){
    return fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(80000)});
  }
  async function json(path,body){
    const r=await request(path,body);const value=await r.json();
    if(!r.ok)throw Error(value.error?.message||'서버 연결 실패');return value;
  }
  async function loadConfig(){
    const {settings}=await json('/config');
    // Only managed public settings are copied; personal avatars and API keys are untouched.
    keys.filter(k=>!['sponge_super_prompt','sponge_prompt_blue','sponge_prompt_gold','sponge_usage_budget_v1'].includes(k)).forEach(k=>{
      if(settings[k]!=null)localStorage.setItem(k,settings[k]);else localStorage.removeItem(k);
    });
  }
  return {config,keys,loadConfig,
    login:async(email,password)=>{await firebaseAuth('signInWithPassword',{email,password});await json('/admin/config');},
    logout:()=>{credential=null;},
    publish:(defaults={})=>{const settings={...defaults};keys.forEach(k=>{const v=localStorage.getItem(k);if(v!==null)settings[k]=v;});return json('/admin/config',{settings});},
    adminConfig:()=>json('/admin/config'),
    usage:day=>json('/admin/usage?day='+encodeURIComponent(day)),
    chat:body=>request('/chat',body)
  };
})();
