'use strict';
const {onRequest}=require('firebase-functions/v2/https');
const {defineSecret,defineString}=require('firebase-functions/params');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {createHash}=require('node:crypto');
const {PUBLIC_KEYS,cleanSettings,validateChat,systemPrompt}=require('./policy');
initializeApp();
const db=getFirestore();
const OPENAI_API_KEY=defineSecret('OPENAI_API_KEY');
const OPENAI_MODEL=defineString('OPENAI_MODEL',{default:'gpt-4o-mini',description:'OpenAI 프로젝트에서 실제 사용 가능한 모델명'});
const ORIGINS=['https://lovewinsall78.github.io','https://spongemap-81a6e.web.app','https://spongemap-81a6e.firebaseapp.com'];
const hash=s=>createHash('sha256').update(s).digest('hex');
const dayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fail=(code,message)=>Object.assign(new Error(message),{status:code});
async function identity(req,admin=false) {
  const token=(req.get('authorization')||'').replace(/^Bearer /,'');
  if(!token) throw fail(401,'로그인이 필요합니다');
  let user;try{user=await getAuth().verifyIdToken(token,true);}catch{throw fail(401,'로그인이 만료되었습니다');}
  if(admin){
    const doc=await db.doc('spongemapAdmins/'+user.uid).get();
    if(!doc.exists || doc.data().enabled!==true) throw fail(403,'Firebase 관리자 권한이 없습니다');
  }
  return user;
}
exports.spongemapApi=onRequest({region:'asia-northeast3',cors:ORIGINS,secrets:[OPENAI_API_KEY],timeoutSeconds:90,maxInstances:3},async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{
    if(req.get('origin') && !ORIGINS.includes(req.get('origin'))) throw fail(403,'허용되지 않은 출처');
    const route=req.path.replace(/\/$/,'') || '/';
    const configRef=db.doc('spongemapConfig/current');
    if(req.method==='GET' && route==='/health') return res.json({project:'spongemap-81a6e',service:'spongemap',ready:true});
    if(req.method==='GET' && route==='/config'){
      await identity(req);
      const cfg=(await configRef.get()).data()?.settings || {};
      const settings={};PUBLIC_KEYS.forEach(k=>{if(cfg[k]!=null)settings[k]=cfg[k];});
      return res.json({settings});
    }
    if(route==='/admin/config'){
      await identity(req,true);
      if(req.method==='GET') return res.json({settings:(await configRef.get()).data()?.settings || {}});
      if(req.method==='POST'){
        let settings;try{settings=cleanSettings(req.body.settings);}catch(e){throw fail(400,e.message);}
        await configRef.set({settings,updatedAt:FieldValue.serverTimestamp()});
        return res.json({ok:true});
      }
    }
    if(req.method==='GET' && route==='/admin/usage'){
      await identity(req,true);
      const day=req.query.day || dayKey();
      if(typeof day!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw fail(400,'날짜 오류');
      return res.json({day,...((await db.doc('spongemapDays/'+day).get()).data()||{})});
    }
    if(req.method!=='POST' || route!=='/chat') throw fail(404,'없는 경로');
    const user=await identity(req);
    let messages;try{messages=validateChat(req.body);}catch(e){throw fail(400,e.message);}
    const settings=(await configRef.get()).data()?.settings || {};
    let prompt;try{prompt=systemPrompt(settings,req.body.stage,req.body.placeName);}catch(e){throw fail(409,e.message);}
    const stages=JSON.parse(settings.sponge_stages || '[]');
    const day=dayKey(), now=Date.now();
    const daily=db.doc('spongemapDays/'+day);
    const visitor=db.doc('spongemapVisitors/'+hash(day+user.uid));
    const session=db.doc('spongemapSessions/'+hash(day+user.uid+req.body.session));
    const request=db.doc('spongemapRequests/'+hash(user.uid+req.body.requestId));
    await db.runTransaction(async tx=>{
      const [d,v,s,r]=await tx.getAll(daily,visitor,session,request);
      if(r.exists) throw fail(409,'이미 처리되었거나 처리 중인 요청입니다');
      if((d.data()?.requests||0)>=200) throw fail(429,'오늘 전체 요청 한도에 도달했습니다');
      if((v.data()?.requests||0)>=50 || now-(v.data()?.lastAt||0)<1500) throw fail(429,'잠시 후 다시 이용해 주세요');
      tx.set(daily,{requests:FieldValue.increment(1),pending:FieldValue.increment(1),sessions:FieldValue.increment(s.exists?0:1)},{merge:true});
      tx.set(visitor,{requests:FieldValue.increment(1),lastAt:now},{merge:true});
      if(!s.exists)tx.set(session,{day,completed:false});
      tx.create(request,{day,status:'pending',createdAt:FieldValue.serverTimestamp()});
    });
    let data=null,error=null,status=200;
    try {
      const upstream=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',headers:{Authorization:'Bearer '+OPENAI_API_KEY.value(),'Content-Type':'application/json'},
        body:JSON.stringify({model:OPENAI_MODEL.value(),messages:[{role:'system',content:prompt},...messages],max_tokens:req.body.stage>=stages.length?600:300}),
        signal:AbortSignal.timeout(55000)
      });
      data=await upstream.json();
      if(!upstream.ok){status=502;error='AI 연결 오류 ('+upstream.status+'). 관리자에게 모델 권한·결제를 확인해 달라고 요청해 주세요.';}
      else if(typeof data.choices?.[0]?.message?.content!=='string'){status=502;error='AI 답변을 받지 못했습니다';}
    } catch {status=504;error='AI 응답이 지연되었습니다. 잠시 후 다시 시도해 주세요.';}
    const usage=data?.usage;
    const known=Number.isSafeInteger(usage?.prompt_tokens)&&usage.prompt_tokens>=0&&Number.isSafeInteger(usage?.completion_tokens)&&usage.completion_tokens>=0;
    // Transaction makes aggregation idempotent. No conversation text is stored.
    await db.runTransaction(async tx=>{
      const [r,s]=await tx.getAll(request,session);
      if(r.data()?.status!=='pending')return;
      const complete=!error && req.body.stage>=stages.length && !s.data()?.completed;
      tx.update(request,{status:error?'error':'success',usageKnown:known,finishedAt:FieldValue.serverTimestamp()});
      tx.set(daily,{pending:FieldValue.increment(-1),success:FieldValue.increment(error?0:1),errors:FieldValue.increment(error?1:0),
        input:FieldValue.increment(known?usage.prompt_tokens:0),output:FieldValue.increment(known?usage.completion_tokens:0),
        unknown:FieldValue.increment(known?0:1),completed:FieldValue.increment(complete?1:0)},{merge:true});
      if(complete)tx.set(session,{completed:true},{merge:true});
    });
    if(error)return res.status(status).json({error:{message:error}});
    return res.json({choices:[{message:{role:'assistant',content:data.choices[0].message.content}}],usage:known?{prompt_tokens:usage.prompt_tokens,completion_tokens:usage.completion_tokens}:null});
  } catch(e){
    console.error('spongemap request failed',e.status || 500); // Never log tokens or conversation content.
    res.status(e.status||500).json({error:{message:e.status?e.message:'서버 처리 오류입니다. 관리자에게 확인해 주세요.'}});
  }
});
