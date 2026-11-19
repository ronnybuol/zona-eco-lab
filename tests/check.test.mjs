import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');

function parseValues(line){
 const v=line.substring(line.indexOf(' VALUES (')+9);let i=0;const values=[];
 while(i<v.length&&v[i]!==')'){
  if(v[i]==="'"){
   i++;let t='';
   while(i<v.length){if(v[i]==="'"&&v[i+1]==="'"){t+="'";i+=2;}else if(v[i]==="'"){i++;break;}else{t+=v[i++];}}
   values.push(t);
  }else{
   let j=i;while(j<v.length&&v[j]!==','&&v[j]!==')')j++;
   values.push(v.slice(i,j).trim());i=j;
  }
  if(v[i]===',')i++;
 }
 return values;
}
const lines=['migrations/0002_seed_questions.sql','migrations/0003_expand_questions.sql','migrations/0005_curate_bolmong.sql','migrations/0010_bank_100_questions.sql'].flatMap(f=>read(f).split('\n').filter(l=>l.startsWith('INSERT OR IGNORE INTO quiz_questions')));
const data=lines.map(parseValues);
test('Bank soal unik dan terdiri dari 269 pertanyaan',()=>{
 assert.equal(data.length,269);
 assert.equal(data.filter(q=>q[0]==='bolmong').length,104);
 assert.equal(data.filter(q=>q[0]==='umum').length,165);
 assert.equal(new Set(data.map(q=>q[2].trim().toLowerCase())).size,data.length);
});
test('Semua pertanyaan punya 4 opsi unik, satu jawaban dan sumber HTTPS',()=>{
 for(const r of data){
  assert.ok(r[2].length>=15);
  const opts=JSON.parse(r[3]);
  assert.equal(opts.length,4);
  assert.equal(new Set(opts.map(s=>s.trim().toLowerCase())).size,4);
  assert.ok(Number.isInteger(Number(r[4]))&&Number(r[4])>=0&&Number(r[4])<=3);
  assert.ok(r[5].length>=15);
  assert.ok(r[6].startsWith('https://'));
 }
});
test('Berkas aplikasi, logo resmi dan migrasi tersedia',()=>{
 for(const name of ['migrations/0004_participants.sql','migrations/0005_curate_bolmong.sql','migrations/0006_short_codes.sql','migrations/0007_event_awards.sql','migrations/0008_voice_contributor_name.sql','migrations/0009_player_question_history.sql','migrations/0010_bank_100_questions.sql','src/worker.js','public/index.html','public/app.js','public/admin.html','public/admin.js','public/style.css','public/logo-zonautara.png','migrations/0001_init.sql','wrangler.toml'])assert.ok(existsSync(new URL('../'+name,import.meta.url)),name);
});
test('Kode JavaScript lolos pemeriksaan sintaks Node.js',()=>{
 for(const file of ['src/worker.js','public/app.js','public/admin.js']){
  const r=spawnSync(process.execPath,['--check',new URL('../'+file,import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(r.status,0,file+': '+r.stderr);
 }
});
test('Server tidak mengirim kunci jawaban ketika memulai permainan',()=>{
 const code=read('src/worker.js');
 assert.match(code,/questions\.map\(publicQuestion\)/);
 assert.match(code,/correct_index:q\.answer/);
 assert.match(code,/completed_at=CASE WHEN/);
});
test('Kuis memiliki tampilan layar penuh dengan footer tetap dan scroll internal',()=>{
 const html=read('public/index.html'),css=read('public/style.css');
 for(const id of ['quiz-layer','quiz-profile','quiz-question','quiz-feedback','quiz-result','quiz-next','quiz-replay'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(css,/\.quiz-layer\{position:fixed/);
 assert.match(css,/height:100dvh/);
 assert.match(css,/\.quiz-scroll\{[^}]*overflow-y:auto/);
 assert.match(css,/\.quiz-bottom\{flex:none/);
 assert.match(css,/max-width:420px/);
});
test('Identitas sekali daftar, poin kumulatif dan daftar petugas tersedia',()=>{
 const worker=read('src/worker.js'),admin=read('public/admin.html');
 for(const route of ['/api/player/register','/api/player/me','/api/admin/participants','/api/admin/participants/verify'])assert.ok(worker.includes(route));
 assert.ok(worker.includes("SUM(r.score)*20 total_points"));
 assert.ok(worker.includes("sess.participant_id!==player.id"));
 assert.ok(worker.includes("token_hash"));
 assert.ok(admin.includes('data-tab="participants"'));
});
test('Trivia liputan dinonaktifkan, bukan dihapus',()=>{
 const migration=read('migrations/0005_curate_bolmong.sql');
 assert.match(migration,/UPDATE quiz_questions SET active=0/);
 assert.match(migration,/question IN/);
 assert.equal((migration.match(/^INSERT OR IGNORE INTO quiz_questions/gm)||[]).length,30);
 assert.equal((read('migrations/0004_participants.sql').match(/ALTER TABLE quiz_/g)||[]).length,2);
});

test('Setiap bagian adalah satu layar dan ada CTA untuk Saweria serta Teras.id',()=>{
 const html=read('public/index.html'),js=read('public/app.js'),css=read('public/style.css');
 for(const screen of ['intro','challenge','leaderboard','jelajah','suara','dukung'])assert.ok(html.includes('data-stage="'+screen+'"'));
 assert.equal((html.match(/class="kiosk-stage/g)||[]).length,6);
 for(const id of ['stage-next','stage-back','quiz-finish','quiz-quit-question','quiz-quit-feedback'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.includes('https://saweria.co/zonautara'));
 assert.ok(html.includes('https://s.id/dukungzu'));
 assert.ok(js.includes("setStage('leaderboard')")||js.includes("closeLayer('leaderboard')"));
 assert.ok(css.includes('height:100dvh'));
 assert.ok(css.includes('.quiz-score-divider'));
 assert.equal(html.includes('id="quiz-close"'),false);
});

test('Enam ilustrasi editorial, urutan layar acara, hadiah, dan informasi Suara Bumi lengkap',()=>{
 const html=read('public/index.html'),js=read('public/app.js');
 const order=[...html.matchAll(/data-stage="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(order,['intro','challenge','leaderboard','suara','dukung','jelajah']);
 for(const key of order){
  assert.ok(existsSync(new URL('../public/art/'+key+'.svg',import.meta.url)),key);
  assert.ok(html.includes('class="stage-art stage-art-'+key+'"'),key+' rendered inline');
 }
 assert.match(html,/HADIAH PERIODE/);
 assert.match(html,/Juara setiap 3 jam/);
 assert.match(html,/Dashboard Admin → Suara Bumi/);
 assert.match(html,/Usulanmu dapat menjadi awal liputan/);
 assert.ok(js.includes("serverOffsetMs"));
 assert.ok(js.includes("boardMode='period'"));
 assert.match(html,/id="board-overall"/);
 assert.match(html,/id="event-countdown"/);
 const server=read('src/worker.js');
 assert.ok(server.includes('EVENT_END_MS'));
 assert.ok(server.includes("quiz_award_snapshots"));
 assert.ok(server.includes("'/api/admin/awards/status'"));
});


test('SVG tertanam langsung, tanpa gambar eksternal atau logo palsu',()=>{
 const html=read('public/index.html'),js=read('public/app.js'),css=read('public/style.css');
 assert.equal((html.match(/<svg class="stage-art stage-art-/g)||[]).length,6);
 assert.equal((html.match(/src="\/art\//g)||[]).length,0);
 assert.equal((html.match(/src="\/logo-zonautara\.png"/g)||[]).length,1);
 assert.ok(html.includes('class="kiosk-text-brand"'));
 assert.ok(html.includes('class="kiosk-mode stage-is-intro"'));
 assert.ok(js.includes("classList.toggle('stage-is-intro',n==='intro')"));
 assert.ok(css.includes('svg.stage-art{flex:none;'));
 for(const key of ['intro','challenge','leaderboard','suara','dukung','jelajah']){
  assert.ok(html.includes('id="sky-'+key+'"'));
 }
});
test('Nama atau panggilan pengirim Suara Bumi ada di UI, API, admin, dan migrasi',()=>{
 const html=read('public/index.html'),js=read('public/app.js'),worker=read('src/worker.js'),admin=read('public/admin.js');
 assert.ok(html.includes('id="voice-name"'));
 assert.ok(js.includes("fd.get('contributor_name')"));
 assert.ok(worker.includes('INSERT INTO voices(topic,region,story,contact,allow_contact,contributor_name)'));
 assert.ok(worker.includes("'contributor_name','topic','region','story'"));
 assert.ok(admin.includes('Pengirim: '));
 assert.match(read('migrations/0008_voice_contributor_name.sql'),/ALTER TABLE voices ADD COLUMN contributor_name/);
});

test('Final visual: enam hero scene penuh, hadiah utama, CTA dan logo resmi',()=>{
 const html=read('public/index.html'),css=read('public/style.css'),js=read('public/app.js');
 const order=[...html.matchAll(/data-stage="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(order,['intro','challenge','leaderboard','suara','dukung','jelajah']);
 assert.equal((html.match(/class="art-scene art-scene-/g)||[]).length,6);
 assert.equal((html.match(/preserveAspectRatio="xMidYMid slice"/g)||[]).length,6);
 assert.equal((html.match(/src="\/logo-zonautara\.png"/g)||[]).length,1);
 assert.ok(html.includes('Hadiah Periode')||html.includes('HADIAH PERIODE'));
 assert.ok(html.includes('HADIAH UTAMA'));
 assert.ok(html.includes('Jurnalisme publik'));
 assert.ok(html.includes('Bisa menang')||html.includes('Rebut hadiah'));
 assert.ok(html.includes('v=20261118d'));
 assert.ok(js.includes('document.body.dataset.stage=n'));
 assert.ok(js.includes("challenge:'Main sekarang & rebut hadiah →'"));
 assert.match(css,/\.art-scene\s*svg\.stage-art/);
 assert.match(css,/@media\(max-width:430px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('Pesan jawaban kurang tepat, donasi, dan aturan poin kumulatif sesuai versi final',()=>{
 const html=read('public/index.html'),js=read('public/app.js'),css=read('public/style.css');
 assert.ok(js.includes("Jawaban Anda Kurang Tepat"));
 assert.ok(js.includes("'is-incorrect',!data.correct"));
 assert.ok(html.includes('Donasi Untuk Zonautara.com'));
 assert.ok(html.includes('href="https://saweria.co/zonautara"'));
 assert.equal(html.includes('Donasi melalui Saweria'),false);
 assert.equal(html.includes('Hanya skor terbaik profil ini'),false);
 assert.ok(html.includes('Seluruh poin yang diperoleh pada jam resmi acara'));
 assert.match(css,/#quiz-feedback\.is-incorrect \.quiz-feedback-title/);
 assert.ok(html.includes('style.css?v=20261118d'));
 assert.ok(html.includes('app.js?v=20261118d'));
});

test('Pemilihan soal server melacak riwayat per pemain dan meminimalkan pengulangan',()=>{
 const worker=read('src/worker.js'),schema=read('migrations/0009_player_question_history.sql');
 assert.match(schema,/PRIMARY KEY\(participant_id, question_id\)/);
 assert.match(worker,/pickForPlayer\(local,2,history,seen\)/);
 assert.match(worker,/pickForPlayer\(global,3,history,seen\)/);
 assert.match(worker,/SELECT question_id,seen_count,last_seen_at FROM quiz_question_exposures/);
 assert.match(worker,/env\.DB\.batch\(\[saveSession/);
 assert.match(worker,/ON CONFLICT\(participant_id,question_id\)/);
});
