'use strict';
const el=id=>document.getElementById(id);
const message=(id,text)=>{el(id).textContent=text;};
const escStore=()=>{try{const a=JSON.parse(localStorage.getItem('eco_seen_v2')||'[]');return Array.isArray(a)?a.filter(Number.isInteger).slice(-400):[];}catch{return [];}};
let player=null,session='',questions=[],step=0,score=0,busy=false,current='loading',retryTask=null,restoreFocus=null;
const STAGES=['intro','challenge','leaderboard','suara','dukung','jelajah'];
const NEXT_CTA={
 intro:'Masuk ke Tantangan Bumi →',
 challenge:'Main sekarang & rebut hadiah →',
 leaderboard:'Punya cerita lingkungan? Suarakan →',
 suara:'Lanjut dukung jurnalisme Zonautara →',
 dukung:'Jelajahi peta & kisah iklim →',
 jelajah:'Kembali ke Awal ↻'
};
let activeStage='intro';
function setStage(name,{updateHash=true}={}){
 const maps={top:'intro',game:'challenge',pantau:'jelajah',voice:'suara',support:'dukung'};
 const n=maps[name]||name;
 if(!STAGES.includes(n))return;
 activeStage=n;
 document.body.dataset.stage=n;
 document.body.classList.toggle('stage-is-intro',n==='intro');
 document.querySelectorAll('.kiosk-stage').forEach(section=>{
  const active=section.dataset.stage===n;
  section.classList.toggle('is-active',active);
  section.setAttribute('aria-hidden',String(!active));
  if(active) section.querySelector('.stage-scroll').scrollTop=0;
 });
 const pos=STAGES.indexOf(n);
 message('stage-count',String(pos+1).padStart(2,'0')+' / 06');
 message('stage-next',NEXT_CTA[n]);
 el('stage-back').disabled=pos===0;
 if(updateHash)history.replaceState(null,'','#'+n);
 if(n==='leaderboard')refreshBoard();
 if(n==='suara')refreshStats();
}
function nextStage(){
 const i=STAGES.indexOf(activeStage);
 if(activeStage==='challenge'){openQuiz();return;}
 setStage(STAGES[(i+1)%STAGES.length]);
}
function previousStage(){
 const i=STAGES.indexOf(activeStage);
 if(i>0)setStage(STAGES[i-1]);
}
function resumeFromHash(){const raw=decodeURIComponent(location.hash.replace(/^#/,''));setStage(raw||'intro',{updateHash:false});}

try{const p=JSON.parse(localStorage.getItem('eco_player_v1')||'null');if(p&&typeof p.token==='string'&&p.token.length===64)player=p;}catch{}
async function api(path,data){const opts=data===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)};const response=await fetch(path,{...opts,cache:'no-store'});let result;try{result=await response.json();}catch{throw Error('Respons server tidak valid.');}if(!response.ok||!result.ok)throw Error(result.error||'Terjadi gangguan jaringan.');return result;}
function screen(name){current=name;document.querySelectorAll('#quiz-layer .quiz-screen').forEach(node=>node.classList.toggle('hidden',node.id!=='quiz-'+name));const state=name==='profile'?['DAFTAR PEMAIN','SEKALI SAJA',0]:name==='result'?['HASIL PERMAINAN','SELESAI',100]:name==='loading'?['TANTANGAN BUMI','MEMUAT',0]:name==='error'?['TANTANGAN BUMI','COBA LAGI',0]:['TANTANGAN BUMI','SOAL '+(step+1)+' / 5',20*(step+1)];message('quiz-phase',state[0]);message('quiz-step-label',state[1]);el('quiz-progress-bar').style.width=state[2]+'%';const target=el('quiz-'+name).querySelector('.quiz-scroll');if(target)target.scrollTop=0;el('quiz-layer').setAttribute('aria-label',name==='question'?'Pertanyaan '+(step+1)+' dari 5':'Tantangan Bumi');}
function openLayer(){restoreFocus=document.activeElement;document.body.classList.add('quiz-open');el('quiz-layer').classList.remove('hidden');el('quiz-layer').setAttribute('tabindex','-1');el('quiz-layer').focus();}
function closeLayer(destination='leaderboard'){document.body.classList.remove('quiz-open');el('quiz-layer').classList.add('hidden');current='loading';setStage(destination);restoreFocus?.focus?.();message('game-status',player?'Profil pemain tersimpan. Main lagi kapan pun.':'Profil cukup dibuat sekali di perangkat ini.');}
function quitQuiz(){if(current==='question'||current==='feedback'){if(!window.confirm('Keluar dari kuis? Putaran yang belum selesai tidak akan mendapat poin.'))return;}closeLayer('leaderboard');}
function errorScreen(error,retry){message('quiz-error-message',error?.message||String(error));retryTask=retry;screen('error');}
async function openQuiz(){openLayer();if(current==='question'||current==='feedback'||current==='result'){screen(current);return;}screen('loading');if(!player){screen('profile');return;}
 try{const data=await api('/api/player/me',{token:player.token});player={...player,...data.player};await startRound();}
 catch(e){if(/profil|tidak ditemukan/i.test(e.message)){player=null;try{localStorage.removeItem('eco_player_v1');}catch{}screen('profile');message('quiz-profile-status','Profil tidak ditemukan. Silakan mendaftar ulang.');}else errorScreen(e,openQuiz);}
}
async function registerPlayer(event){event.preventDefault();if(busy)return;const form=el('quiz-profile-form');if(!form.reportValidity())return;busy=true;el('quiz-register').disabled=true;message('quiz-profile-status','Menyimpan profil…');
 try{const data=await api('/api/player/register',{nickname:el('quiz-nickname').value.trim(),region:el('quiz-region').value,public_consent:el('quiz-consent').checked});player={token:data.token,...data.player};try{localStorage.setItem('eco_player_v1',JSON.stringify(player));}catch{message('quiz-profile-status','Penyimpanan browser dibatasi. Profil mungkin tidak tersimpan setelah halaman ditutup.');}await startRound();}
 catch(e){message('quiz-profile-status','Gagal mendaftar: '+e.message);}finally{busy=false;el('quiz-register').disabled=false;}
}
async function startRound(){screen('loading');message('quiz-phase','TANTANGAN BUMI');busy=true;
 try{const data=await api('/api/quiz/start',{token:player.token,seen:escStore()});session=data.session_id;questions=data.questions;step=0;score=0;const seen=escStore();seen.push(...questions.map(q=>q.id));try{localStorage.setItem('eco_seen_v2',JSON.stringify([...new Set(seen)].slice(-400)));}catch{}renderQuestion();}
 catch(e){errorScreen(e,startRound);}finally{busy=false;}
}
function renderQuestion(){const q=questions[step];if(!q){errorScreen(Error('Pertanyaan tidak ditemukan.'),startRound);return;}message('quiz-topic',q.topic);message('quiz-category',q.category==='bolmong'?'BOLMONG':'UMUM');message('quiz-question-title',q.question);message('quiz-answer-status','');const container=el('quiz-options');container.replaceChildren();q.options.forEach((answer,i)=>{const button=document.createElement('button');button.className='quiz-choice';button.type='button';const key=document.createElement('span');key.className='quiz-choice-key';key.textContent='ABCD'[i];const label=document.createElement('span');label.textContent=answer;button.append(key,label);button.addEventListener('click',()=>answerQuestion(i));container.append(button);});screen('question');}
async function answerQuestion(choice){if(busy)return;busy=true;const buttons=[...el('quiz-options').querySelectorAll('button')];buttons.forEach(x=>x.disabled=true);message('quiz-answer-status','Memeriksa jawaban…');
 try{const q=questions[step],data=await api('/api/quiz/answer',{session_id:session,question_id:q.id,choice});score=data.score;el('quiz-feedback').classList.toggle('is-incorrect',!data.correct);message('quiz-feedback-status',data.correct?'✓ TEPAT!':'↗ AYO PELAJARI');message('quiz-feedback-symbol',data.correct?'✓':'✕');message('quiz-feedback-title',data.correct?'Bagus, kamu benar!':'Jawaban Anda Kurang Tepat');message('quiz-correct-answer',q.options[data.correct_index]);message('quiz-explanation',data.explanation);const a=el('quiz-reference');if(data.source_url){a.href=data.source_url;a.classList.remove('hidden');}else{a.removeAttribute('href');a.classList.add('hidden');}message('quiz-next',step===4?'Lihat hasil →':'Pertanyaan berikutnya →');screen('feedback');}
 catch(e){buttons.forEach(x=>x.disabled=false);message('quiz-answer-status','Koneksi gagal: '+e.message+' Pilih jawaban lagi.');}
 finally{busy=false;}
}
function advance(){if(busy||current!=='feedback')return;if(step<4){step++;renderQuestion();}else{finishRound();}}
async function finishRound(){screen('loading');busy=true;try{const data=await api('/api/quiz/finish',{session_id:session,token:player.token});score=data.score;message('quiz-result-score',data.points);message('quiz-result-title',score===5?'Penjaga Bumi!':score>=3?'Sahabat Bumi!':'Penjelajah Bumi!');message('quiz-result-summary','Terima kasih, '+data.nickname+'! Kamu memperoleh '+data.points+' dari 100 poin dalam putaran ini.');message('quiz-result-name',data.nickname);message('quiz-result-code',data.code);message('quiz-result-best',data.counts_for_prize?'Poin periode ini: '+data.period_points+' · Poin juara umum: '+data.event_total_points+' · Putaran terbaik: '+data.best_points+'/100.':'Putaran uji coba: '+data.points+' poin. Poin hadiah resmi mulai dihitung Jumat 20 November pukul 08.00 WITA.');message('quiz-result-status',data.counts_for_prize?'Poin sudah dihitung untuk hadiah periode dan juara umum. Main lagi untuk mengejar puncak peringkat!':'Latihan berhasil disimpan, tetapi tidak dihitung sebagai poin hadiah sebelum atau sesudah jam resmi acara.');screen('result');refreshBoard();}
 catch(e){errorScreen(Error('Skor belum dapat disimpan: '+e.message),finishRound);}finally{busy=false;}
}
async function share(){const text='Aku mendapat '+(score*20)+'/100 poin pada Tantangan Bumi ZONA ECO LAB! Ayo kumpulkan poinmu: '+location.origin+'/';if(navigator.share){try{await navigator.share({title:'Tantangan Bumi',text});return;}catch(e){if(e.name==='AbortError')return;}}try{await navigator.clipboard.writeText(text);message('quiz-result-status','Teks hasil disalin. Tempel ke WhatsApp atau media sosial.');}catch{window.prompt('Salin hasil permainan:',text);}}
let liveBoard=null,boardMode='period',serverOffsetMs=0;
const countFmt=ms=>{
 const seconds=Math.max(0,Math.floor(ms/1000));
 return [Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(v=>String(v).padStart(2,'0')).join(':');
};
function countDownTick(){
 if(!liveBoard)return;
 const now=Date.now()+serverOffsetMs;
 const target=liveBoard.phase==='upcoming'?liveBoard.event_start_ms:liveBoard.phase==='active'?liveBoard.period.end_ms:liveBoard.event_end_ms;
 message('event-countdown',liveBoard.phase==='closed'?'00:00:00':countFmt(target-now));
 if(now>=target&&liveBoard.phase!=='closed'&&!document.hidden&&activeStage==='leaderboard')refreshBoard();
}
function boardTab(which){
 boardMode=which;
 el('board-period').classList.toggle('board-switch-active',which==='period');
 el('board-overall').classList.toggle('board-switch-active',which==='overall');
 el('board-period').setAttribute('aria-pressed',String(which==='period'));
 el('board-overall').setAttribute('aria-pressed',String(which==='overall'));
 el('board-view-period').classList.toggle('hidden',which!=='period');
 el('board-view-overall').classList.toggle('hidden',which!=='overall');
}
function fillLeaders(id,leaders,empty){
 const node=el(id);node.replaceChildren();
 if(!leaders.length){const p=document.createElement('p');p.className='muted';p.textContent=empty;node.append(p);return;}
 leaders.forEach(r=>{
  const row=document.createElement('div');row.className='leader-row';
  const rank=document.createElement('div');rank.className='rank';rank.textContent='#'+r.rank;
  const person=document.createElement('div');
  const name=document.createElement('div');name.className='leader-name';name.textContent=r.nickname;
  const region=document.createElement('div');region.className='leader-meta';region.textContent=r.region+' · '+(r.code||'');
  person.append(name,region);
  const value=document.createElement('div');
  const points=document.createElement('div');points.className='leader-score';points.textContent=r.total_points+' poin';
  const detail=document.createElement('div');detail.className='leader-detail';detail.textContent=r.rounds+'× main · '+r.perfect_rounds+'× 100 poin';
  value.append(points,detail);row.append(rank,person,value);node.append(row);
 });
}
function announceWinners(winners){
 const box=el('previous-winners');box.replaceChildren();
 if(!winners.length){const p=document.createElement('p');p.className='muted small';p.textContent='Belum ada periode yang selesai. Pengumuman tampil di sini setelah periode ditutup.';box.append(p);return;}
 for(const w of winners.slice().reverse()){
  const item=document.createElement('div');item.className='winner-item';
  const period=document.createElement('strong');period.textContent=w.period==='umum'?'🏆 Juara Umum':'🏅 Periode '+w.period;
  const user=document.createElement('span');user.textContent=w.code+' · '+w.nickname+' · '+w.points+' poin';
  const badge=document.createElement('small');badge.textContent=w.status==='confirmed'?'Sudah diverifikasi':'Menunggu verifikasi petugas';
  item.append(period,user,badge);box.append(item);
 }
}
async function refreshBoard(){
 try{
  const d=await api('/api/leaderboard');
  liveBoard=d;serverOffsetMs=d.server_now_ms-Date.now();
  const p=d.period;
  const from=8+(p.number-1)*3,to=from+3;
  const phaseText=d.phase==='upcoming'?'ACARA BELUM DIMULAI · PERIODE 1':d.phase==='closed'?'PERMAINAN HADIAH SUDAH DITUTUP':'PERIODE '+p.number+' BERJALAN';
  message('event-period-label',phaseText+' · '+String(from).padStart(2,'0')+'.00–'+String(to).padStart(2,'0')+'.00 WITA');
  message('event-remaining',d.phase==='upcoming'?'Mulai 20 November 2026 pukul 08.00 WITA':d.phase==='active'?'Pengumuman setelah periode berakhir dan verifikasi petugas':'Hadiah utama ditutup 20 November pukul 20.00 WITA');
  fillLeaders('leader-rows-period',p.leaders,d.phase==='upcoming'?'Peringkat periode dimulai pada 20 November pukul 08.00 WITA.':'Belum ada skor di periode ini. Ayo jadi yang pertama!');
  fillLeaders('leader-rows-overall',d.overall.leaders,d.phase==='upcoming'?'Papan juara umum akan mulai menghitung saat acara dimulai.':'Belum ada skor juara umum.');
  announceWinners(d.winners||[]);boardTab(boardMode);countDownTick();
 }catch(e){
  message('leader-rows-period','Peringkat belum tersedia: '+e.message);
  message('leader-rows-overall','Peringkat belum tersedia: '+e.message);
 }
}
async function refreshStats(){try{const d=await api('/api/stats');const node=el('issue-bars');node.replaceChildren();const topics=d.topics||[];if(!topics.length){const p=document.createElement('p');p.className='muted';p.textContent='Belum ada pilihan isu yang terkumpul.';node.append(p);return;}const max=Math.max(...topics.map(t=>t.total));topics.forEach(t=>{const row=document.createElement('div');row.className='issue-row';const lbl=document.createElement('div');lbl.className='issue-label';const name=document.createElement('span');name.textContent=t.topic;const n=document.createElement('span');n.textContent=t.total;lbl.append(name,n);const track=document.createElement('div');track.className='issue-track';const bar=document.createElement('span');bar.style.width=(100*t.total/max)+'%';track.append(bar);row.append(lbl,track);node.append(row);});}catch(e){message('issue-bars','Statistik belum tersedia.');}}
async function submitVoice(event){event.preventDefault();const f=el('voice-form');if(!f.reportValidity())return;const fd=new FormData(f);const data={topic:fd.get('topic'),region:fd.get('region'),contributor_name:String(fd.get('contributor_name')||'').trim(),story:String(fd.get('story')||''),contact:String(fd.get('contact')||'').trim(),allow_contact:el('voice-consent').checked};if(data.contact&&!data.contributor_name){message('voice-status','Jika ingin dihubungi, isi nama atau sapaan agar redaksi dapat menyapa dengan tepat.');el('voice-name').focus();return;}if(data.contact&&!data.allow_contact){message('voice-status','Centang persetujuan bila mengisi kontak.');return;}const btn=el('voice-send');btn.disabled=true;message('voice-status','Mengirim…');
 try{await api('/api/voice',data);message('voice-status','✓ Terima kasih! Pilihan dan ceritamu sudah diterima untuk ditinjau redaksi.');f.reset();refreshStats();}catch(e){message('voice-status','Belum berhasil dikirim: '+e.message);}finally{btn.disabled=false;}}

document.addEventListener('DOMContentLoaded',()=>{
 resumeFromHash();
 el('stage-next').addEventListener('click',nextStage);
 el('stage-back').addEventListener('click',previousStage);
 el('skip-game').addEventListener('click',()=>setStage('leaderboard'));
 el('quiz-profile-form').addEventListener('submit',registerPlayer);
 el('quiz-next').addEventListener('click',advance);
 el('quiz-replay').addEventListener('click',startRound);
 el('quiz-share').addEventListener('click',share);
 el('quiz-finish').addEventListener('click',()=>closeLayer('leaderboard'));
 el('quiz-quit-question').addEventListener('click',quitQuiz);
 el('quiz-quit-feedback').addEventListener('click',quitQuiz);
 el('quiz-retry').addEventListener('click',()=>{if(retryTask)retryTask();else openQuiz();});
 el('refresh-board').addEventListener('click',refreshBoard);
 el('board-period').addEventListener('click',()=>boardTab('period'));
 el('board-overall').addEventListener('click',()=>boardTab('overall'));
 setInterval(countDownTick,1000);
 setInterval(()=>{if(activeStage==='leaderboard'&&!document.hidden)refreshBoard();},45000);
 el('voice-form').addEventListener('submit',submitVoice);
 window.addEventListener('hashchange',resumeFromHash);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!el('quiz-layer').classList.contains('hidden'))quitQuiz();});
 message('game-status','Satu soal per layar · 5 pertanyaan · Main ulang menambah poin');
 refreshBoard();refreshStats();
});
