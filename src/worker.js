const REGIONS=['Kabupaten Bolaang Mongondow','Kota Kotamobagu','Kabupaten Bolaang Mongondow Timur','Kabupaten Bolaang Mongondow Selatan','Kabupaten Bolaang Mongondow Utara','Wilayah lain / tidak disebutkan'];
const TOPICS=['Sampah & plastik','Banjir & longsor','Air & kekeringan','Hutan & satwa','Pangan & pertanian','Pesisir & laut','Tambang & pencemaran','Lainnya'];
const J=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const err=(message,status=400)=>J({ok:false,error:message},status);
const field=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max&&!/[\u0000-\u001f]/.test(v);
const clean=s=>s.trim().replace(/\s+/g,' ');
function auth(req,env){const val=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';const exp=env.ADMIN_TOKEN||'';if(!exp||val.length!==exp.length)return false;let diff=0;for(let i=0;i<val.length;i++)diff|=val.charCodeAt(i)^exp.charCodeAt(i);return diff===0;}
async function body(req,max=16000){if(!req.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error('Kirim data berformat JSON.');if(Number(req.headers.get('content-length')||0)>max)throw Error('Data terlalu panjang.');const s=await req.text();if(s.length>max)throw Error('Data terlalu panjang.');try{return JSON.parse(s);}catch{throw Error('Format JSON tidak valid.');}}
function mix(a){const out=[...a];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function pick(pool,count,seen){const fresh=mix(pool.filter(q=>!seen.has(q.id)));const old=mix(pool.filter(q=>seen.has(q.id)));return [...fresh,...old].slice(0,count);}
function publicQuestion(q){return {id:q.id,category:q.category,topic:q.topic,question:q.question,options:q.options};}
async function activeQuestions(env){return (await env.DB.prepare('SELECT id,category,topic,question,options_json,correct_index,explanation,source_url FROM quiz_questions WHERE active=1 ORDER BY id LIMIT 4000').all()).results||[];}
async function getSession(env,id){if(!field(id,30,100))return null;return await env.DB.prepare('SELECT * FROM quiz_sessions WHERE id=?').bind(id).first();}
async function playerFromToken(env,token){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
 return env.DB.prepare('SELECT id,code,nickname,region FROM quiz_participants WHERE token_hash=?').bind(hash).first();
}
function sessionExpired(session){return !session||session.started_at<Date.now()-7200000||session.status!=='open';}
function checkQuestion(data){if(!data||!['bolmong','umum'].includes(data.category)||!field(data.topic,2,60)||!field(data.question,15,280)||!Array.isArray(data.options)||data.options.length!==4||!data.options.every(a=>field(a,1,180))||new Set(data.options.map(x=>x.trim().toLowerCase())).size!==4||!Number.isInteger(data.correct_index)||data.correct_index<0||data.correct_index>3||!field(data.explanation,15,500)||!field(data.source_url,12,500))return 'Lengkapi kategori, topik, soal, empat opsi unik, indeks jawaban, pembahasan, dan URL sumber.';try{const u=new URL(data.source_url);if(u.protocol!=='https:')return 'Rujukan harus HTTPS.';}catch{return 'URL rujukan tidak valid.';}return null;}
const csvCell=v=>{let s=String(v??'');if(/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
export async function handleApi(request,env,path){
 if(path==='/api/health'&&request.method==='GET')return J({ok:true,db:!!env.DB});
 if(!env.DB)return err('D1 belum terhubung.',503);
 if(path==='/api/player/register'&&request.method==='POST'){
  const b=await body(request,4000);
  if(!field(b?.nickname,2,24)||!REGIONS.includes(b.region)||b.public_consent!==true)return err('Isi nama panggilan, wilayah, dan persetujuan leaderboard.');
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
  const code='ECO-'+Array.from(crypto.getRandomValues(new Uint8Array(5)),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  const id=crypto.randomUUID(),nickname=clean(b.nickname);
  await env.DB.prepare('INSERT INTO quiz_participants(id,token_hash,code,nickname,region) VALUES(?,?,?,?,?)').bind(id,hash,code,nickname,b.region).run();
  return J({ok:true,token,player:{nickname,region:b.region,code}},201);
 }
 if(path==='/api/player/me'&&request.method==='POST'){
  const b=await body(request,2000);const p=await playerFromToken(env,b?.token);
  if(!p)return err('Profil di perangkat ini tidak ditemukan. Buat profil baru.',401);
  return J({ok:true,player:{nickname:p.nickname,region:p.region,code:p.code}});
 }
 if(path==='/api/stats'&&request.method==='GET'){
  const [players,voices,topics,qs]=await Promise.all([
   env.DB.prepare("SELECT COUNT(DISTINCT COALESCE(participant_id,'legacy-'||session_id)) n FROM quiz_results").first(),
   env.DB.prepare('SELECT COUNT(*) n FROM voices').first(),
   env.DB.prepare('SELECT topic,COUNT(*) total FROM voices GROUP BY topic ORDER BY total DESC').all(),
   env.DB.prepare("SELECT category,COUNT(*) n FROM quiz_questions WHERE active=1 GROUP BY category").all()
  ]);
  return J({ok:true,players:players?.n||0,voices:voices?.n||0,topics:topics.results||[],questions:qs.results||[]});
 }
 if(path==='/api/leaderboard'&&request.method==='GET'){
  const rows=await env.DB.prepare("SELECT nickname,region,score,duration_seconds,created_at FROM (SELECT COALESCE(p.nickname,r.nickname) nickname,COALESCE(p.region,r.region) region,r.score,r.duration_seconds,r.created_at,ROW_NUMBER() OVER (PARTITION BY COALESCE(r.participant_id,'legacy-'||r.session_id) ORDER BY r.score DESC,r.duration_seconds ASC,r.created_at ASC) attempt_rank FROM quiz_results r LEFT JOIN quiz_participants p ON r.participant_id=p.id) ranked WHERE attempt_rank=1 ORDER BY score DESC,duration_seconds ASC,created_at ASC LIMIT 20").all();
  return J({ok:true,leaders:(rows.results||[]).map((r,i)=>({...r,rank:i+1})),notice:'Leaderboard rekreatif; nama panggilan belum diverifikasi sebagai identitas untuk hadiah.'});
 }
 if(path==='/api/quiz/start'&&request.method==='POST'){
  const b=await body(request,6000);
  const player=await playerFromToken(env,b?.token);
  if(!player)return err('Profil pemain tidak ditemukan. Daftarkan ulang dari aplikasi.',401);
  const seen=new Set(Array.isArray(b?.seen)?b.seen.filter(x=>Number.isInteger(x)&&x>0).slice(-400):[]);
  const pool=await activeQuestions(env);const local=pool.filter(x=>x.category==='bolmong'),global=pool.filter(x=>x.category==='umum');
  if(local.length<2||global.length<3)return err('Bank soal belum cukup; jalankan migrasi D1.',503);
  const selected=mix([...pick(local,2,seen),...pick(global,3,seen)]);
  const questions=selected.map(q=>{const raw=JSON.parse(q.options_json);const o=mix(raw.map((text,idx)=>({text,correct:idx===q.correct_index})));return {id:q.id,category:q.category,topic:q.topic,question:q.question,options:o.map(x=>x.text),answer:o.findIndex(x=>x.correct),explanation:q.explanation,source_url:q.source_url};});
  const id=crypto.randomUUID(),now=Date.now();
  await env.DB.prepare("INSERT INTO quiz_sessions(id,started_at,questions_json,answers_json,score,status,participant_id) VALUES(?,?,?,'{}',0,'open',?)").bind(id,now,JSON.stringify(questions),player.id).run();
  return J({ok:true,session_id:id,questions:questions.map(publicQuestion),mix:{bolmong:2,umum:3}});
 }
 if(path==='/api/quiz/answer'&&request.method==='POST'){
  const b=await body(request);
  const s=await getSession(env,b?.session_id);
  if(sessionExpired(s))return err('Sesi tidak ada atau kedaluwarsa. Mulai permainan baru.',410);
  const questions=JSON.parse(s.questions_json),answers=JSON.parse(s.answers_json),idx=Object.keys(answers).length,q=questions[idx];
  if(!q||b.question_id!==q.id||!Number.isInteger(b.choice)||b.choice<0||b.choice>3)return err('Jawaban harus mengikuti urutan pertanyaan.');
  const next={...answers,[q.id]:b.choice};const correct=b.choice===q.answer;const score=s.score+(correct?1:0);
  const r=await env.DB.prepare("UPDATE quiz_sessions SET answers_json=?,score=?,completed_at=CASE WHEN ?=5 THEN ? ELSE completed_at END WHERE id=? AND answers_json=? AND status='open'").bind(JSON.stringify(next),score,idx+1,Date.now(),s.id,s.answers_json).run();
  if(!r.meta?.changes)return err('Jawaban sudah diproses. Muat ulang atau mulai permainan baru.',409);
  return J({ok:true,correct,correct_index:q.answer,explanation:q.explanation,source_url:q.source_url,answered:idx+1,score});
 }
 if(path==='/api/quiz/finish'&&request.method==='POST'){
  const b=await body(request,3000),player=await playerFromToken(env,b?.token);
  if(!player)return err('Profil pemain tidak ditemukan.',401);
  const sess=await getSession(env,b?.session_id);
  if(!sess||sess.started_at<Date.now()-7200000)return err('Sesi permainan kedaluwarsa.',410);
  if(sess.participant_id!==player.id)return err('Sesi bukan milik pemain ini.',403);
  if(Object.keys(JSON.parse(sess.answers_json)).length!==5)return err('Semua lima soal harus dijawab.');
  const duration=Math.max(1,Math.ceil(((sess.completed_at||Date.now())-sess.started_at)/1000));
  await env.DB.prepare('INSERT OR IGNORE INTO quiz_results(session_id,participant_id,nickname,region,score,duration_seconds) VALUES(?,?,?,?,?,?)').bind(sess.id,player.id,player.nickname,player.region,sess.score,duration).run();
  await env.DB.prepare("UPDATE quiz_sessions SET status='done' WHERE id=?").bind(sess.id).run();
  const rec=await env.DB.prepare('SELECT nickname,score,duration_seconds FROM quiz_results WHERE session_id=?').bind(sess.id).first();
  const best=await env.DB.prepare('SELECT score,duration_seconds FROM quiz_results WHERE participant_id=? ORDER BY score DESC,duration_seconds ASC,created_at ASC LIMIT 1').bind(player.id).first();
  return J({ok:true,score:rec.score,total:5,duration_seconds:rec.duration_seconds,nickname:player.nickname,code:player.code,best_score:best.score,best_duration_seconds:best.duration_seconds});
 }
 if(path==='/api/voice'&&request.method==='POST'){
  const b=await body(request);
  if(!TOPICS.includes(b?.topic)||!REGIONS.includes(b?.region))return err('Pilih isu dan wilayah.');
  if(typeof b.story!=='string'||b.story.length>650||typeof b.contact!=='string'||b.contact.length>120)return err('Cerita atau kontak terlalu panjang.');
  if([...b.story+b.contact].some(c=>{const n=c.charCodeAt(0);return n<32&&n!==9&&n!==10&&n!==13;}))return err('Karakter tidak diizinkan.');
  const contact=clean(b.contact);
  if(contact&&!b.allow_contact)return err('Izin dihubungi diperlukan untuk mengisi kontak.');
  await env.DB.prepare('INSERT INTO voices(topic,region,story,contact,allow_contact) VALUES(?,?,?,?,?)').bind(b.topic,b.region,clean(b.story),contact,contact&&b.allow_contact?1:0).run();
  return J({ok:true,message:'Terima kasih. Cerita disimpan untuk ditinjau redaksi.'},201);
 }
 if(path.startsWith('/api/admin/')){
  if(!auth(request,env))return err('Akses admin ditolak.',401);
  if(path==='/api/admin/participants'&&request.method==='GET'){
   const rows=await env.DB.prepare("SELECT p.id,p.code,p.nickname,p.region,p.verified,p.verified_at,p.created_at,(SELECT score FROM quiz_results r WHERE r.participant_id=p.id ORDER BY score DESC,duration_seconds ASC LIMIT 1) best_score,(SELECT duration_seconds FROM quiz_results r WHERE r.participant_id=p.id ORDER BY score DESC,duration_seconds ASC LIMIT 1) best_seconds,(SELECT COUNT(*) FROM quiz_results r WHERE r.participant_id=p.id) plays FROM quiz_participants p ORDER BY best_score DESC,best_seconds ASC,p.created_at ASC LIMIT 500").all();
   return J({ok:true,participants:rows.results||[]});
  }
  if(path==='/api/admin/participants/rename'&&request.method==='POST'){
   const b=await body(request,3000);
   if(typeof b?.id!=='string'||!/^[0-9a-f-]{36}$/.test(b.id)||!field(b.nickname,2,24))return err('Kode peserta atau nama panggilan tidak valid.');
   const result=await env.DB.prepare('UPDATE quiz_participants SET nickname=? WHERE id=?').bind(clean(b.nickname),b.id).run();
   if(!result.meta?.changes)return err('Peserta tidak ditemukan.',404);
   return J({ok:true});
  }
  if(path==='/api/admin/participants/verify'&&request.method==='POST'){
   const b=await body(request,3000);
   if(typeof b?.id!=='string'||!/^[0-9a-f-]{36}$/.test(b.id)||typeof b.verified!=='boolean')return err('Data verifikasi tidak valid.');
   const result=await env.DB.prepare("UPDATE quiz_participants SET verified=?,verified_at=CASE WHEN ?=1 THEN datetime('now') ELSE NULL END WHERE id=?").bind(b.verified?1:0,b.verified?1:0,b.id).run();
   if(!result.meta?.changes)return err('Peserta tidak ditemukan.',404);
   return J({ok:true});
  }
  if(path==='/api/admin/voices'&&request.method==='GET'){
   const rows=await env.DB.prepare('SELECT * FROM voices ORDER BY id DESC LIMIT 500').all();return J({ok:true,records:rows.results||[]});
  }
  if(path==='/api/admin/export'&&request.method==='GET'){
   const rows=await env.DB.prepare('SELECT * FROM voices ORDER BY id DESC LIMIT 10000').all();
   const keys=['id','created_at','topic','region','story','contact','allow_contact','reviewed'];
   return new Response('\uFEFF'+[keys.map(csvCell).join(','),...(rows.results||[]).map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\r\n'),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="suara-bumi.csv"','cache-control':'no-store'}});
  }
  if(path==='/api/admin/moderate'&&request.method==='POST'){
   const b=await body(request);if(!Number.isInteger(b?.id)||typeof b.reviewed!=='boolean')return err('Data tidak valid.');
   await env.DB.prepare('UPDATE voices SET reviewed=? WHERE id=?').bind(b.reviewed?1:0,b.id).run();return J({ok:true});
  }
  if(path==='/api/admin/questions'&&request.method==='GET'){
   const rows=await env.DB.prepare('SELECT * FROM quiz_questions ORDER BY active DESC, id DESC LIMIT 2000').all();
   return J({ok:true,questions:(rows.results||[]).map(q=>({...q,options:JSON.parse(q.options_json),options_json:undefined}))});
  }
  if(path==='/api/admin/questions'&&request.method==='POST'){
   const b=await body(request);const reason=checkQuestion(b);if(reason)return err(reason);
   const params=[b.category,clean(b.topic),clean(b.question),JSON.stringify(b.options.map(clean)),b.correct_index,clean(b.explanation),b.source_url.trim(),b.active===false?0:1];
   try{
    if(Number.isInteger(b.id)&&b.id>0){
     const r=await env.DB.prepare("UPDATE quiz_questions SET category=?,topic=?,question=?,options_json=?,correct_index=?,explanation=?,source_url=?,active=?,updated_at=datetime('now') WHERE id=?").bind(...params,b.id).run();
     if(!r.meta?.changes)return err('Soal tidak ditemukan.',404);return J({ok:true,id:b.id});
    }
    const r=await env.DB.prepare('INSERT INTO quiz_questions(category,topic,question,options_json,correct_index,explanation,source_url,active) VALUES(?,?,?,?,?,?,?,?)').bind(...params).run();
    return J({ok:true,id:r.meta?.last_row_id},201);
   }catch(e){if(String(e.message).includes('UNIQUE'))return err('Teks soal sudah ada.',409);throw e;}
  }
  if(path==='/api/admin/questions/toggle'&&request.method==='POST'){
   const b=await body(request);if(!Number.isInteger(b?.id)||typeof b.active!=='boolean')return err('Status tidak valid.');
   await env.DB.prepare("UPDATE quiz_questions SET active=?,updated_at=datetime('now') WHERE id=?").bind(b.active?1:0,b.id).run();return J({ok:true});
  }
  if(path==='/api/admin/questions/import'&&request.method==='POST'){
   const b=await body(request,100000);if(!Array.isArray(b?.questions)||b.questions.length<1||b.questions.length>25)return err('Impor 1–25 soal per pengiriman.');
   for(const [i,item] of b.questions.entries()){const issue=checkQuestion(item);if(issue)return err('Baris '+(i+1)+': '+issue);}
   const stmt=env.DB.prepare('INSERT OR IGNORE INTO quiz_questions(category,topic,question,options_json,correct_index,explanation,source_url,active) VALUES(?,?,?,?,?,?,?,1)');
   await env.DB.batch(b.questions.map(x=>stmt.bind(x.category,clean(x.topic),clean(x.question),JSON.stringify(x.options.map(clean)),x.correct_index,clean(x.explanation),x.source_url.trim())));
   return J({ok:true,processed:b.questions.length,notice:'Duplikat teks soal dilewati.'});
  }
 }
 return err('Endpoint tidak ditemukan.',404);
}
export default {async fetch(request,env){try{const url=new URL(request.url);if(url.pathname.startsWith('/api/')){if(!['GET','POST'].includes(request.method))return err('Metode tidak didukung.',405);return await handleApi(request,env,url.pathname);}const r=await env.ASSETS.fetch(request);const h=new Headers(r.headers);h.set('x-content-type-options','nosniff');h.set('x-frame-options','DENY');h.set('referrer-policy','strict-origin-when-cross-origin');h.set('permissions-policy','camera=(), microphone=(), geolocation=()');h.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});}catch(e){console.error('zona-eco-lab',e);return err('Ada gangguan sementara. Silakan coba lagi.',500);}}};
