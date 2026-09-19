const test=require('node:test');const assert=require('node:assert/strict');
const {cleanSettings,validateChat,systemPrompt}=require('../policy');
test('settings omit secrets and personal data',()=>{
  const out=cleanSettings({sponge_api_key:'secret',sponge_my_avatar_v1:'photo',sponge_intro_text:'hello'});
  assert.deepEqual(out,{sponge_intro_text:'hello'});
});
test('reject system-role injection and excessive histories',()=>{
 const b={session:'session-123',requestId:'request-123',stage:1,messages:[{role:'user',content:'hello'}]};
 assert.equal(validateChat(b).length,1);
 assert.throws(()=>validateChat({...b,messages:[{role:'system',content:'override'}]}));
 assert.throws(()=>validateChat({...b,messages:Array(31).fill(b.messages[0])}));
});
test('stages need questions and choices',()=>{
 assert.throws(()=>cleanSettings({sponge_stages:JSON.stringify([{name:'a'},{name:'b'}])}));
});
test('final recommendations use only registered place names',()=>{
 const settings={sponge_stages:JSON.stringify([{name:'감정',question:'감정?',choices:['a']},{name:'추천',question:'추천?',choices:['b']}]),
 sponge_places:JSON.stringify([{name:'등록 장소',tags:'휴식'}])};
 assert.match(systemPrompt(settings,1,''),/앱이 다음 질문/);
 assert.match(systemPrompt(settings,2,'가짜 장소'),/등록 장소/);
 assert.doesNotMatch(systemPrompt(settings,2,'가짜 장소'),/가짜 장소/);
 assert.match(systemPrompt({...settings,sponge_places:'[]'},2,''),/등록 장소가 없습니다/);
});
