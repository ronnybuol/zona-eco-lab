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
const lines=['migrations/0002_seed_questions.sql','migrations/0003_expand_questions.sql'].flatMap(f=>read(f).split('\n').filter(l=>l.startsWith('INSERT OR IGNORE INTO quiz_questions')));
const data=lines.map(parseValues);
test('Bank soal unik dan terdiri dari 139 pertanyaan',()=>{
 assert.equal(data.length,139);
 assert.equal(data.filter(q=>q[0]==='bolmong').length,34);
 assert.equal(data.filter(q=>q[0]==='umum').length,105);
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
 for(const name of ['src/worker.js','public/index.html','public/app.js','public/admin.html','public/admin.js','public/style.css','public/logo-zonautara.png','migrations/0001_init.sql','wrangler.toml'])assert.ok(existsSync(new URL('../'+name,import.meta.url)),name);
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
test('Tampilan punya font mobile dan petunjuk scroll',()=>{
 assert.match(read('public/index.html'),/scroll-hint/);
 assert.match(read('public/style.css'),/max-width:650px/);
 assert.match(read('public/style.css'),/font-size:16px/);
});
