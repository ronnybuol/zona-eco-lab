import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleApi,eventLeaderboard} from '../src/worker.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migrations=['0001_init.sql','0002_seed_questions.sql','0003_expand_questions.sql','0004_participants.sql','0005_curate_bolmong.sql','0006_short_codes.sql','0007_event_awards.sql','0008_voice_contributor_name.sql','0009_player_question_history.sql','0010_bank_100_questions.sql'];
function makeDB({manualQuestion=false}={}){
 const sql=new DatabaseSync(':memory:');
 for(let i=0;i<migrations.length;i++){
  if(i===5){
   sql.prepare("INSERT INTO quiz_participants(id,token_hash,code,nickname,region) VALUES(?,?,?,?,?)").run('legacy-uuid','test-legacy-hash','ECO-A1B2C3D4E5','Pemain Lama','Kabupaten Bolaang Mongondow');
  }
  if(i===3&&manualQuestion){
    sql.prepare("INSERT INTO quiz_questions(category,topic,question,options_json,correct_index,explanation,source_url,active) VALUES(?,?,?,?,?,?,?,1)").run('bolmong','Tambahan admin','Jika melihat sampah di sekitar sungai, apa pilihan yang paling aman?','["Mengangkat dengan aman","Membiarkan saja","Membakarnya","Membuangnya ke aliran air"]',0,'Pengurangan sampah membantu mengurangi penyumbatan aliran air.','https://zonautara.com');
  }
  sql.exec(read('migrations/'+migrations[i]));
 }
 const wrapper={async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results;},prepare(query){
  const statement=sql.prepare(query);
  const make=values=>({
   bind(...params){return make(params);},
   async first(){return statement.get(...values)??null;},
   async all(){return {results:statement.all(...values)};},
   async run(){const result=statement.run(...values);return {meta:{changes:result.changes,last_row_id:Number(result.lastInsertRowid)}};}
  });
  return make([]);
 }};
 return {sql,env:{DB:wrapper,ADMIN_TOKEN:'test-secret-admin-token-32chars-yes'}};
}
async function call(env,path,body,secret){
 const req=new Request('https://eco.test'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(secret?{'authorization':'Bearer '+secret}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const response=await handleApi(req,env,path);
 return {status:response.status,data:await response.json()};
}
const signup=(env,nickname)=>call(env,'/api/player/register',{nickname,region:'Kabupaten Bolaang Mongondow',public_consent:true});
async function round(env,token){
 const start=await call(env,'/api/quiz/start',{token,seen:[]});
 assert.equal(start.status,200);
 assert.equal(start.data.questions.length,5);
 assert.equal(start.data.questions.filter(q=>q.category==='bolmong').length,2);
 assert.ok(start.data.questions.every(q=>!('correct_index' in q)&&!('answer' in q)));
 for(let i=0;i<5;i++){
  const answer=await call(env,'/api/quiz/answer',{session_id:start.data.session_id,question_id:start.data.questions[i].id,choice:0});
  assert.equal(answer.status,200);
 }
 return start.data.session_id;
}
test('Seluruh migrasi berjalan dan 241 soal aktif tanpa menghapus tambahan admin',()=>{
 const {sql}=makeDB({manualQuestion:true});
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM quiz_questions').get().n,270);
 assert.match(sql.prepare("SELECT code FROM quiz_participants WHERE id='legacy-uuid'").get().code,/^ZU-[0-9]{4}$/);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM quiz_questions WHERE active=1').get().n,242);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM quiz_questions WHERE category='bolmong' AND active=1").get().n,77);
 assert.equal(sql.prepare("SELECT active FROM quiz_questions WHERE question='Tanggal apa tercantum sebagai pembangunan pada dinding Bendung Lolak Atas menurut liputan?'").get().active,0);
 assert.equal(sql.prepare("SELECT active FROM quiz_questions WHERE question LIKE 'Jika melihat sampah di sekitar sungai%'").get().active,1);
 sql.close();
});
test('Registrasi sekali, dua permainan, satu entri leaderboard dengan nickname tetap',async()=>{
 const {sql,env}=makeDB();
 const user=await signup(env,'Penjaga Lolak');assert.equal(user.status,201);
 assert.match(user.data.token,/^[0-9a-f]{64}$/);
 assert.match(user.data.player.code,/^ZU-[0-9]{4}$/);
 const profile=await call(env,'/api/player/me',{token:user.data.token});
 assert.equal(profile.data.player.nickname,'Penjaga Lolak');
 let summed=0;
 for(let i=0;i<2;i++){
  const session_id=await round(env,user.data.token);
  const result=await call(env,'/api/quiz/finish',{session_id,token:user.data.token,nickname:'Nama palsu'});
  assert.equal(result.status,200);
  assert.equal(result.data.nickname,'Penjaga Lolak');
  assert.equal(result.data.points,result.data.score*20);
  summed+=result.data.points;
  assert.equal(result.data.total_points,summed);
 }
 const board=await call(env,'/api/leaderboard');
 assert.equal(board.status,200);
 assert.equal(board.data.phase,'upcoming');
 assert.equal(board.data.leaders.length,0); // Uji coba di luar jam acara tidak dihitung dalam hadiah.
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM quiz_results').get().n,2);
 sql.close();
});
test('Token pemain dan kepemilikan sesi dijaga di server',async()=>{
 const {sql,env}=makeDB();
 const first=await signup(env,'Pemain Satu'),second=await signup(env,'Pemain Dua');
 assert.equal((await call(env,'/api/quiz/start',{token:'a'.repeat(64),seen:[]})).status,401);
 const sid=await round(env,first.data.token);
 const stolen=await call(env,'/api/quiz/finish',{token:second.data.token,session_id:sid});
 assert.equal(stolen.status,403);
 assert.equal((await call(env,'/api/quiz/finish',{token:first.data.token,session_id:sid})).status,200);
 sql.close();
});
test('Verifikasi hadiah hanya untuk petugas berotorisasi',async()=>{
 const {sql,env}=makeDB();const registered=await signup(env,'Peserta Stan');
 assert.equal((await call(env,'/api/admin/participants')).status,401);
 const secret='test-secret-admin-token-32chars-yes';
 const list=await call(env,'/api/admin/participants',undefined,secret);
 assert.equal(list.status,200);
 const current=list.data.participants.find(p=>p.code===registered.data.player.code);
 assert.ok(current);
 assert.equal(current.total_points,0);
 const id=current.id;
 const correction=await call(env,'/api/admin/participants/rename',{id,nickname:'Peserta Diperbaiki'},secret);
 assert.equal(correction.status,200);
 assert.equal(sql.prepare('SELECT nickname FROM quiz_participants WHERE id=?').get(id).nickname,'Peserta Diperbaiki');
 assert.equal((await call(env,'/api/admin/participants/verify',{id,verified:true},secret)).status,200);
 assert.equal(sql.prepare('SELECT verified FROM quiz_participants WHERE id=?').get(id).verified,1);
 sql.close();
});

test('Juara empat periode dan juara umum dibekukan, reset periode tidak menghapus akumulasi',async()=>{
 const {sql,env}=makeDB();
 const a=await signup(env,'Peserta A'),b=await signup(env,'Peserta B');
 const players=sql.prepare('SELECT id,nickname FROM quiz_participants WHERE nickname IN (?,?)').all('Peserta A','Peserta B');
 const ids=Object.fromEntries(players.map(p=>[p.nickname,p.id]));
 const start=Date.UTC(2026,10,20,0,0,0),period=3*3600000;
 async function score(token,player,points,finished){
  const session_id=await round(env,token);
  const finish=await call(env,'/api/quiz/finish',{session_id,token});
  assert.equal(finish.status,200);
  sql.prepare('UPDATE quiz_results SET score=? WHERE session_id=?').run(points/20,session_id);
  sql.prepare('UPDATE quiz_sessions SET completed_at=? WHERE id=?').run(finished,session_id);
 }
 await score(a.data.token,'Peserta A',60,start+1000);
 await score(b.data.token,'Peserta B',80,start+2000);
 const p1=await eventLeaderboard(env,start+period+3000);
 assert.equal(p1.phase,'active');
 assert.equal(p1.period.number,2);
 assert.equal(p1.period.leaders.length,0);
 assert.equal(p1.overall.leaders[0].nickname,'Peserta B');
 assert.equal(p1.winners.find(w=>w.period===1).nickname,'Peserta B');
 const saved1=sql.prepare('SELECT nickname,points,status FROM quiz_award_snapshots WHERE period_index=0 AND rank=1').get();
 assert.equal(saved1.nickname,'Peserta B');assert.equal(saved1.points,80);assert.equal(saved1.status,'pending');
 await score(a.data.token,'Peserta A',100,start+period+1000);
 await score(b.data.token,'Peserta B',40,start+period+2000);
 const p2=await eventLeaderboard(env,start+2*period+3000);
 assert.equal(p2.period.number,3);
 assert.equal(p2.overall.leaders[0].nickname,'Peserta A');
 assert.equal(p2.overall.leaders[0].total_points,160);
 assert.equal(p2.winners.find(w=>w.period===2).nickname,'Peserta A');
 assert.equal(sql.prepare('SELECT points FROM quiz_award_snapshots WHERE period_index=0 AND rank=1').get().points,80);
 const final=await eventLeaderboard(env,start+4*period+3000);
 assert.equal(final.phase,'closed');
 assert.equal(final.winners.find(w=>w.period==='umum').nickname,'Peserta A');
 const key='test-secret-admin-token-32chars-yes';
 assert.equal((await call(env,'/api/admin/awards')).status,401);
 const entry=await call(env,'/api/admin/awards',undefined,key);
 assert.equal(entry.status,200);
 assert.ok(entry.data.awards.some(x=>x.period_index===0));
 const pending=await call(env,'/api/admin/awards/status',{period_index:0,rank:1,status:'confirmed'},key);
 assert.equal(pending.status,409); // belum diperiksa di stan
 sql.prepare('UPDATE quiz_participants SET verified=1 WHERE id=?').run(ids['Peserta B']);
 const confirmed=await call(env,'/api/admin/awards/status',{period_index:0,rank:1,status:'confirmed'},key);
 assert.equal(confirmed.status,200);
 const checked=await eventLeaderboard(env,start+4*period+6000);
 assert.equal(checked.winners.find(w=>w.period===1).status,'confirmed');
 sql.close();
});

test('Suara Bumi menyimpan nama atau sapaan dengan aman dan mempertahankan laporan lama',async()=>{
 const {sql,env}=makeDB();
 // Baris lama dari sebelum versi 0008 tetap bisa dibaca sebagai laporan anonim.
 sql.prepare('INSERT INTO voices(topic,region,story,contact,allow_contact) VALUES(?,?,?,?,?)').run('Sampah & plastik','Kabupaten Bolaang Mongondow','Laporan lama dari warga','',0);
 const legacy=sql.prepare('SELECT contributor_name FROM voices WHERE story=?').get('Laporan lama dari warga');
 assert.equal(legacy.contributor_name,'');
 const anonymous=await call(env,'/api/voice',{topic:'Air & kekeringan',region:'Kabupaten Bolaang Mongondow',contributor_name:'',story:'Mau menyampaikan informasi secara anonim.',contact:'',allow_contact:false});
 assert.equal(anonymous.status,201);
 const invalid=await call(env,'/api/voice',{topic:'Air & kekeringan',region:'Kabupaten Bolaang Mongondow',contributor_name:'',story:'Sumber air berkurang.',contact:'081200000000',allow_contact:true});
 assert.equal(invalid.status,400);
 const named=await call(env,'/api/voice',{topic:'Air & kekeringan',region:'Kabupaten Bolaang Mongondow',contributor_name:'Rina Bolmong',story:'Sumber air berkurang.',contact:'081200000000',allow_contact:true});
 assert.equal(named.status,201);
 const admin=await call(env,'/api/admin/voices',undefined,'test-secret-admin-token-32chars-yes');
 assert.equal(admin.status,200);
 assert.equal(admin.data.records.find(v=>v.contact==='081200000000').contributor_name,'Rina Bolmong');
 assert.equal(admin.data.records.find(v=>v.story==='Laporan lama dari warga').contributor_name,'');
 const exportRequest=new Request('https://eco.test/api/admin/export',{headers:{authorization:'Bearer test-secret-admin-token-32chars-yes'}});
 const csv=await handleApi(exportRequest,env,'/api/admin/export');
 assert.equal(csv.status,200);
 const body=await csv.text();
 assert.ok(body.includes('contributor_name'));
 assert.ok(body.includes('Rina Bolmong'));
 sql.close();
});

test('Riwayat D1 mencegah pengulangan 38 putaran meski klien tidak mengirim seen',async()=>{
 const {sql,env}=makeDB();
 const person=await signup(env,'Sahabat Bumi');assert.equal(person.status,201);
 const all=new Set(),local=new Set(),general=new Set();
 for(let roundNum=0;roundNum<38;roundNum++){
  const started=await call(env,'/api/quiz/start',{token:person.data.token,seen:[]});
  assert.equal(started.status,200);
  assert.equal(started.data.questions.length,5);
  const ids=started.data.questions.map(q=>q.id);
  assert.equal(new Set(ids).size,5);
  for(const question of started.data.questions){
   assert.equal(all.has(question.id),false,'soal muncul ulang pada putaran '+(roundNum+1)+': '+question.id);
   all.add(question.id);
   (question.category==='bolmong'?local:general).add(question.id);
  }
 }
 assert.equal(local.size,76);
 assert.equal(general.size,114);
 assert.equal(all.size,190);
 const participantId=sql.prepare("SELECT id FROM quiz_participants WHERE nickname='Sahabat Bumi'").get().id;
 const served=sql.prepare('SELECT COUNT(*) n FROM quiz_question_exposures WHERE participant_id=?').get(participantId).n;
 assert.equal(served,190);
 const next=await call(env,'/api/quiz/start',{token:person.data.token,seen:[]});
 assert.equal(next.status,200);
 assert.equal(next.data.questions.filter(q=>q.category==='bolmong'&&local.has(q.id)).length,2);
 assert.equal(next.data.questions.filter(q=>q.category==='umum'&&general.has(q.id)).length,0);
 const repeats=sql.prepare('SELECT SUM(seen_count) n FROM quiz_question_exposures WHERE participant_id=?').get(participantId).n;
 assert.equal(repeats,195);
 sql.close();
});

test('Soal tambahan lengkap, empat opsi unik, pembahasan dan sumber HTTPS',()=>{
 const {sql}=makeDB();
 const rows=sql.prepare('SELECT category,topic,question,options_json,correct_index,explanation,source_url FROM quiz_questions WHERE id>(SELECT MAX(id)-100 FROM quiz_questions) ORDER BY id').all();
 assert.equal(rows.length,100);
 for(const q of rows){
  const opts=JSON.parse(q.options_json);
  assert.equal(opts.length,4,q.question);
  assert.equal(new Set(opts.map(x=>x.trim().toLowerCase())).size,4,q.question);
  assert.ok(q.correct_index>=0&&q.correct_index<4,q.question);
  assert.ok(q.explanation.length>=15&&q.explanation.length<=500,q.question);
  assert.match(q.source_url,/^https:\/\//,q.question);
 }
 assert.equal(rows.filter(x=>x.category==='bolmong').length,40);
 assert.equal(rows.filter(x=>x.category==='umum').length,60);
 sql.close();
});
