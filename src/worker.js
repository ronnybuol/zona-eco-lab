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
function sessionExpired(session){return !session||session.started_at<Date.now()-7200000||session.status!=='open';}
function checkQuestion(data){if(!data||!['bolmong','umum'].includes(data.category)||!field(data.topic,2,60)||!field(data.question,15,280)||!Array.isArray(data.options)||data.options.length!==4||!data.options.every(a=>field(a,1,180))||new Set(data.options.map(x=>x.trim().toLowerCase())).size!==4||!Number.isInteger(data.correct_index)||data.correct_index<0||data.correct_index>3||!field(data.explanation,15,500)||!field(data.source_url,12,500))return 'Lengkapi kategori, topik, soal, empat opsi unik, indeks jawaban, pembahasan, dan URL sumber.';try{const u=new URL(data.source_url);if(u.protocol!=='https:')return 'Rujukan harus HTTPS.';}catch{return 'URL rujukan tidak valid.';}return null;}
const csvCell=v=>{let s=String(v??'');if(/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
export async function handleApi(request,env,path){
 if(path==='/api/health'&&request.method==='GET')return J({ok:true,db:!!env.DB});
 if(!env.DB)return err('D1 belum terhubung.',503);
 if(path==='/api/stats'&&request.method==='GET'){
  const [players,voices,topics,qs]=await Promise.all([
   env.DB.prepare('SELECT COUNT(*) n FROM quiz_results').first(),
   env.DB.prepare('SELECT COUNT(*) n FROM voices').first(),
   env.DB.prepare('SELECT topic,COUNT(*) total FROM voices GROUP BY topic ORDER BY total DESC').all(),
   env.DB.prepare("SELECT category,COUNT(*) n FROM quiz_questions WHERE active=1 GROUP BY category").all()
  ]);
  return J({ok:true,players:players?.n||0,voices:voices?.n||0,topics:topics.results||[],questions:qs.results||[]});
 }
 if(path==='/api/leaderboard'&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT nickname,region,score,duration_seconds,created_at FROM quiz_results ORDER BY score DESC,duration_seconds ASC,created_at ASC LIMIT 20').all();
  return J({ok:true,leaders:(rows.results||[]).map((r,i)=>({...r,rank:i+1})),notice:'Leaderboard rekreatif; nama panggilan belum diverifikasi sebagai identitas untuk hadiah.'});
 }
 if(path==='/api/quiz/start'&&request.method==='POST'){
  const b=await body(request,6000);
  const seen=new Set(Array.isArray(b?.seen)?b.seen.filter(x=>Number.isInteger(x)&&x>0).slice(-400):[]);
  const pool=await activeQuestions(env);const local=pool.filter(x=>x.category==='bolmong'),global=pool.filter(x=>x.category==='umum');
  if(local.length<2||global.length<3)return err('Bank soal belum cukup; jalankan migrasi D1.',503);
  const selected=mix([...pick(local,2,seen),...pick(global,3,seen)]);
  const questions=selected.map(q=>{const raw=JSON.parse(q.options_json);const o=mix(raw.map((text,idx)=>({text,correct:idx===q.correct_index})));return {id:q.id,category:q.category,topic:q.topic,question:q.question,options:o.map(x=>x.text),answer:o.findIndex(x=>x.correct),explanation:q.explanation,source_url:q.source_url};});
  const id=crypto.randomUUID(),now=Date.now();
  await env.DB.prepare("INSERT INTO quiz_sessions(id,started_at,questions_json,answers_json,score,status) VALUES(?,?,?,'{}',0,'open')").bind(id,now,JSON.stringify(questions)).run();
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
  const b=await body(request);
  const s=await getSession(env,b?.session_id);if(!s||s.started_at<Date.now()-7200000)return err('Sesi permainan kedaluwarsa.',410);
  if(Object.keys(JSON.parse(s.answers_json)).length!==5)return err('Semua lima soal harus dijawab.');
  if(!field(b?.nickname,2,24))return err('Nama panggilan 2–24 karakter diperlukan.');
  if(!b?.public_consent)return err('Persetujuan untuk menampilkan nama panggilan diperlukan.');
  const nickname=clean(b.nickname),region=REGIONS.includes(b.region)?b.region:REGIONS.at(-1);
  const duration=Math.max(1,Math.ceil(((s.completed_at||Date.now())-s.started_at)/1000));
  await env.DB.prepare('INSERT OR IGNORE INTO quiz_results(session_id,nickname,region,score,duration_seconds) VALUES(?,?,?,?,?)').bind(s.id,nickname,region,s.score,duration).run();
  await env.DB.prepare("UPDATE quiz_sessions SET status='done' WHERE id=?").bind(s.id).run();
  const rec=await env.DB.prepare('SELECT nickname,score,duration_seconds FROM quiz_results WHERE session_id=?').bind(s.id).first();
  return J({ok:true,score:rec.score,total:5,duration_seconds:rec.duration_seconds,nickname:rec.nickname});
 }
 if(path==='/api/voice'&&request.method==='POST'){
  const b=await body(request);
  if(!TOPICS.includes(b?.topic)||!REGIONS.includes(b?.region))return err('Pilih isu dan wilayah.');
  if(typeof b.story!=='string'||b.story.length>650||typeof b.contact!=='string'||b.contact.length>120)return err('Cerita atau kontak terlalu panjang.');
  if(!field(b.story||' ',0,650)||!field(b.contact||' ',0,120))return err('Karakter tidak diizinkan.');
  const contact=clean(b.contact);
  if(contact&&!b.allow_contact)return err('Izin dihubungi diperlukan untuk mengisi kontak.');
  await env.DB.prepare('INSERT INTO voices(topic,region,story,contact,allow_contact) VALUES(?,?,?,?,?)').bind(b.topic,b.region,clean(b.story),contact,contact&&b.allow_contact?1:0).run();
  return J({ok:true,message:'Terima kasih. Cerita disimpan untuk ditinjau redaksi.'},201);
 }
 if(path.startsWith('/api/admin/')){
  if(!auth(request,env))return err('Akses admin ditolak.',401);
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
