const PLAYERS = [
  { id: 'jordon', name: 'Jordon', nick: 'Hota Hota', initials: 'JO', color: '#d9f268' },
  { id: 'justin', name: 'Justin', nick: 'Juan Pablo', initials: 'JU', color: '#c9def3' },
  { id: 'raul', name: 'Raul', nick: 'Ralph', initials: 'RA', color: '#ffd0b7' }
];
const KEY = 'xp-club-data-v1';
const TEST_DATA_CLEANUP = 'xp-club-test-data-cleared-v1';
// The only saved record in this local prototype was a test quest; clear it once on upgrade.
if (!localStorage.getItem(TEST_DATA_CLEANUP)) { localStorage.removeItem(KEY); localStorage.setItem(TEST_DATA_CLEANUP, 'yes'); }
const backendConfigured = Boolean(window.supabase && window.XP_SUPABASE_URL && window.XP_SUPABASE_PUBLISHABLE_KEY && !window.XP_SUPABASE_URL.includes('YOUR_PROJECT'));
const backend = backendConfigured ? window.supabase.createClient(window.XP_SUPABASE_URL, window.XP_SUPABASE_PUBLISHABLE_KEY) : null;
let statePlayerId = null;
let gameData = { quests: [], scores: {}, resetRequest: null };
let liveChannel = null;
const $ = (s, root=document) => root.querySelector(s);
const DAY = 86400000;
const today = () => dateKey(new Date());
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dayNumber = key => { const [y,m,d]=key.split('-').map(Number); return Date.UTC(y,m-1,d)/DAY; };
const shiftDate = (key, offset) => { const d=new Date(`${key}T12:00:00`); d.setDate(d.getDate()+offset); return dateKey(d); };
const prettyDate = key => new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric'}).format(new Date(`${key}T12:00:00`));
function player(id){return PLAYERS.find(p=>p.id===id)}
function safe(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function refreshData(){
 const [q,r,l]=await Promise.all([
  backend.from('quests').select('*').order('quest_date'),
  backend.from('reset_votes').select('*').maybeSingle(),
  backend.from('leaderboard').select('id,xp')
 ]);
 const err=q.error||r.error||l.error;if(err)throw err;
 gameData.quests=(q.data||[]).map(x=>({id:x.id,date:x.quest_date,assigner:x.assigner,assignee:x.assignee,title:x.title,detail:x.detail,xp:x.xp,bonuses:x.bonuses||[],status:x.status}));
 gameData.resetRequest=r.data?{approvals:r.data.approvals||[]}:null;
 gameData.scores=Object.fromEntries((l.data||[]).map(x=>[x.id,Number(x.xp)||0]));
}
async function loadPlayer(userId){const result=await backend.rpc('current_xp_player');if(result.error)throw result.error;statePlayerId=result.data;return userId;}
function watchGame(){if(liveChannel)backend.removeChannel(liveChannel);liveChannel=backend.channel('xp-club-shared-state').on('postgres_changes',{event:'*',schema:'public',table:'quests'},async()=>{try{await refreshData();render()}catch(e){toast(e.message)}}).on('postgres_changes',{event:'*',schema:'public',table:'reset_votes'},async()=>{try{await refreshData();render()}catch(e){toast(e.message)}}).subscribe();}
function isSchedulable(date){return date>=today()&&date<=shiftDate(today(),7)}
// Everyone gives one quest and receives one. The arrows rotate together each day.
function recipientFor(assignerId,date){const day=dayNumber(date)-dayNumber('2025-01-06');const shift=(day%3+3)%3;const i=PLAYERS.findIndex(p=>p.id===assignerId);return PLAYERS[(i+1+shift)%3].id}
function totals(data){const result=Object.fromEntries(PLAYERS.map(p=>[p.id,0]));PLAYERS.forEach(p=>result[p.id]=data.scores?.[p.id]||0);return result}
let selectedDate=today();
function renderLogin(error=''){
 const app=$('#app');
 if(!backend){app.innerHTML=`<main class="login-wrap"><section class="login-card"><div class="brand"><div class="brand-mark">XP</div><div>XP CLUB<small>Spanish class side quests</small></div></div><h1>One last<br>setup step.</h1><p>Connect this site to its Supabase project to enable secure logins and shared quests.</p><div class="empty">Create the project, run <b>supabase/schema.sql</b>, then add your project URL and publishable key to <b>supabase-config.js</b>.</div></section></main>`;return}
 app.innerHTML=`<main class="login-wrap"><section class="login-card"><div class="brand"><div class="brand-mark">XP</div><div>XP CLUB<small>Spanish class side quests</small></div></div><h1>Enter the<br>classroom.</h1><p>Sign in with your own email and password. Your login is linked to your player profile.</p><form id="loginForm"><div class="field"><label for="email">Email</label><input id="email" type="email" autocomplete="username" placeholder="you@example.com" required></div><div class="field"><label for="password">Password</label><div class="pin-row"><input id="password" type="password" autocomplete="current-password" required><button class="btn" type="submit">Let me in ↗</button></div><div class="login-error" id="loginError">${safe(error)}</div></div></form><div class="privacy-note">THREE PERSONAL LOGINS · ONE SHARED QUEST BOARD</div></section></main>`;
 $('#loginForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;$('#loginError').textContent='Signing in…';const result=await backend.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});if(result.error){$('#loginError').textContent=result.error.message;button.disabled=false;return}try{await loadPlayer(result.data.user.id);await refreshData();watchGame();render()}catch(err){await backend.auth.signOut();statePlayerId=null;renderLogin(err.message)}};
}
function render(){
 const id=statePlayerId; if(!id||!player(id)){renderLogin();return}
 if(selectedDate>shiftDate(today(),7))selectedDate=shiftDate(today(),7);
 const me=player(id), data=gameData, date=selectedDate, dayQuests=data.quests.filter(q=>q.date===date), score=totals(data), resetRequest=data.resetRequest||null;
 const leaderboard=[...PLAYERS].sort((a,b)=>score[b.id]-score[a.id]);
 const scheduled=dayQuests.length, completed=dayQuests.filter(q=>q.status!=='open').length, verified=dayQuests.filter(q=>q.status==='awarded').length;
 const offset=dayNumber(date)-dayNumber('2025-01-06');
 $('#app').innerHTML=`<div class="shell"><header class="topbar"><div class="brand"><div class="brand-mark">XP</div><div>XP CLUB<small>Spanish class side quests</small></div></div><div class="nav-right"><div class="date">${prettyDate(today())}</div><div class="user-chip"><span class="avatar" style="background:${me.color}">${me.initials}</span>${me.name} <span class="muted">· ${safe(me.nick)}</span></div><button class="logout" id="logout">log out</button></div></header>
 <section class="hero"><div class="hero-main"><div class="eyebrow">A tiny bit of chaos, for XP</div><h1>Spanish class,<br><em>side quest mode.</em></h1><p>Do the silly thing. Get the points. Respect the classroom.</p><div class="hero-stamp">¡VAMOS!</div></div><div class="daily-card"><div class="daily-head"><span>${date===today()?"Today’s rotation":date<today()?'Past rotation':'Planned rotation'}</span><span class="sun">☼</span></div><div><h2>Three quests.<br>Everyone plays.</h2><p>${PLAYERS.map(p=>`${p.name} → ${player(recipientFor(p.id,date)).name}`).join('　·　')}</p></div><div class="section-tag">ROTATION CYCLE ${((offset%3+3)%3)+1} / 3</div></div></section>
 <section class="panel calendar-panel"><div class="panel-title"><div><h2>Quest calendar</h2><div class="hint">Browse the archive or plan up to one week ahead.</div></div><span class="section-tag">${scheduled}/3 QUESTS SET · ${verified} VERIFIED</span></div><div class="calendar-strip">${Array.from({length:14},(_,i)=>{const d=shiftDate(today(),i-6),qs=data.quests.filter(q=>q.date===d);return `<button class="calendar-day ${d===date?'selected':''} ${d===today()?'is-today':''}" data-date="${d}"><span>${new Intl.DateTimeFormat('en-US',{weekday:'short'}).format(new Date(`${d}T12:00:00`))}</span><b>${new Date(`${d}T12:00:00`).getDate()}</b><i>${qs.length?`${qs.filter(q=>q.status==='awarded').length}✓ / ${qs.length}`:'·'}</i></button>`}).join('')}</div><div class="calendar-controls"><button class="btn secondary" id="previousDay">← Previous day</button><label class="date-picker">Jump to date <input type="date" id="datePicker" value="${date}" max="${shiftDate(today(),7)}"></label><button class="btn secondary" id="todayButton">Today</button><button class="btn secondary" id="nextDay" ${date>=shiftDate(today(),7)?'disabled':''}>Next day →</button></div></section>
 <main class="layout"><div><section class="panel"><div class="panel-title"><h2>${date===today()?"Today’s quests":date<today()?`${prettyDate(date)} · Quest archive`:`${prettyDate(date)} · Planned quests`}</h2><span class="section-tag">${completed}/3 COMPLETED · ${verified}/3 VERIFIED</span></div>${PLAYERS.map(p=>{const q=dayQuests.find(x=>x.assigner===p.id);return q?questMarkup(q,me):emptyQuest(p,recipientFor(p.id,date),me,date)}).join('')}</section>${isSchedulable(date)&&!dayQuests.some(q=>q.assigner===me.id)?createForm(date,me):''}</div>
 <aside><section class="panel"><div class="panel-title"><h2>Leaderboard</h2><span class="section-tag">ALL TIME · XP</span></div>${leaderboard.map((p,i)=>`<div class="board-row"><span class="rank">${String(i+1).padStart(2,'0')}</span><span class="board-avatar" style="background:${p.color}">${p.initials}</span><span class="board-name">${safe(p.name)}<small>${safe(p.nick)}${p.id===me.id?' · YOU':''}</small></span><span class="score">${score[p.id].toLocaleString()} <small>XP</small></span></div>`).join('')}</section><section class="panel"><div class="panel-title"><h2>Quest loop</h2><span class="section-tag">${date===today()?'TODAY':'SELECTED DAY'}</span></div>${PLAYERS.map(p=>`<div class="person-card"><div class="who"><span class="board-avatar" style="background:${p.color}">${p.initials}</span>${safe(p.name)} <span class="muted">→ ${safe(player(recipientFor(p.id,date)).name)}</span></div><span class="role">${dayQuests.some(q=>q.assigner===p.id)?'SET ✓':p.id===me.id&&isSchedulable(date)?'YOUR TURN':'UP NEXT'}</span></div>`).join('')}</section>${resetPanel(resetRequest,me)}<p class="hint" style="padding:0 5px">Keep quests school-friendly, quick, and fun. Anyone can pass on something that feels uncomfortable.</p></aside></main></div><div id="toast" class="toast"></div>`;
 $('#logout').onclick=async()=>{await backend.auth.signOut();statePlayerId=null;renderLogin()};
 $('#previousDay').onclick=()=>{selectedDate=shiftDate(date,-1);render()};
 $('#nextDay').onclick=()=>{selectedDate=shiftDate(date,1);render()};
 $('#todayButton').onclick=()=>{selectedDate=today();render()};
 $('#datePicker').onchange=e=>{if(e.target.value){selectedDate=e.target.value;render()}};
 document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{selectedDate=b.dataset.date;render()});
 for(const q of dayQuests)bindQuest(q,me);
 if(isSchedulable(date))bindCreate(date,me);
 bindReset(resetRequest,me);
}
function resetPanel(request,me){
 if(!request)return `<section class="panel reset-panel"><div class="panel-title"><h2>Reset game data</h2><span class="section-tag">ALL THREE AGREE</span></div><p class="hint">Propose a full reset of quests and XP. Your proposal counts as your own yes; the other two must log in and approve before anything is erased.</p><button class="btn secondary" id="proposeReset">Propose reset vote</button></section>`;
 const approved=request.approvals||[];
 return `<section class="panel reset-panel"><div class="panel-title"><h2>Reset vote in progress</h2><span class="section-tag">${approved.length}/3 YES</span></div><p class="hint">All quests and XP will be erased only after everyone approves.</p>${PLAYERS.map(p=>`<div class="reset-voter"><span class="board-avatar" style="background:${p.color}">${p.initials}</span><span>${safe(p.name)}</span><b>${approved.includes(p.id)?'AGREED ✓':p.id===me.id?'YOUR APPROVAL NEEDED':'WAITING'}</b></div>`).join('')}${approved.includes(me.id)?'<p class="hint">Your approval is recorded for this reset.</p>':`<button class="btn accent" id="approveReset">I agree — reset everything</button>`}<button class="reset-cancel" id="cancelReset">Cancel reset vote</button></section>`;
}
function bindReset(request,me){
 const propose=$('#proposeReset');if(propose)propose.onclick=async()=>{const {error}=await backend.rpc('propose_reset');if(error)return toast(error.message);await refreshData();render();toast('Your yes is recorded. The other two need to approve.')};
 const approve=$('#approveReset');if(approve)approve.onclick=async()=>{const {data,error}=await backend.rpc('approve_reset');if(error)return toast(error.message);await refreshData();render();toast(data?'All three agreed. Quests and XP have been wiped.':'Your approval is recorded.')};
 const cancel=$('#cancelReset');if(cancel)cancel.onclick=async()=>{const {error}=await backend.rpc('cancel_reset');if(error)return toast(error.message);await refreshData();render();toast('Reset vote cancelled. No data was erased.')};
}
function emptyQuest(assigner,assignee,me,date){
 const allowed=isSchedulable(date)&&me.id===assigner.id;
 return `<article class="quest missing-quest"><div class="quest-top"><div><div class="quest-label">${safe(assigner.name)}’S QUEST · FOR ${safe(player(assignee).name)}</div><h3>${allowed?'Your quest is waiting to be written.':`${safe(assigner.name)} hasn’t assigned this quest yet.`}</h3></div><span class="xp-pill">— XP</span></div><div class="quest-meta"><span>${allowed?'Set the quest for your friend to complete.':`Assigned by <b>${safe(assigner.name)}</b>`}</span><span>→</span><span>Quest for <b>${safe(player(assignee).name)}</b></span></div>${allowed?`<button class="btn set-quest" data-assigner="${assigner.id}" data-assignee="${assignee}">＋ Write this quest</button>`:''}</article>`;
}
function questMarkup(q,me){
 const recipient=player(q.assignee), assigner=player(q.assigner), verifier=PLAYERS.find(p=>p.id!==q.assignee&&p.id!==q.assigner);
 const statusLabel={open:'WAITING TO BE DONE',complete:'NEEDS A WITNESS',awarded:'VERIFIED · XP AWARDED'}[q.status]||'QUEST';
 const earned=q.status==='awarded'?` · +${(q.xp+(q.bonuses||[]).filter(b=>b.done).reduce((s,b)=>s+b.xp,0)).toLocaleString()} XP`:(q.bonuses||[]).length?` · +${q.bonuses.reduce((s,b)=>s+b.xp,0).toLocaleString()} BONUS XP POSSIBLE`:'';
 let action='';
 if(q.status==='open'&&me.id===q.assignee&&q.date<=today())action=`<button class="btn accent" data-complete="${q.id}">I did the thing ✓</button>`;
 if(q.status==='complete'&&me.id===verifier.id&&q.date<=today())action=`<button class="btn accent" data-attest="${q.id}">Attest & award XP ✓</button>`;
 if(q.status==='complete'&&me.id===q.assignee)action=`<span class="hint">Waiting for ${safe(verifier.name)} to attest.</span>`;
 if(q.status==='open'&&me.id!==q.assignee)action=`<span class="hint">${me.id===q.assigner?'You assigned this quest.':`Waiting for ${safe(recipient.name)} to complete it.`}</span>`;
 if(q.status==='complete'&&me.id===q.assigner)action=`<span class="hint">Waiting for ${safe(verifier.name)} to attest.</span>`;
 return `<article class="quest"><div class="quest-top"><div><div class="quest-label">${statusLabel}${earned}</div><h3>${safe(q.title)}</h3></div><span class="xp-pill">${q.xp.toLocaleString()} XP</span></div>${q.detail?`<p class="hint" style="margin:0 0 11px">${safe(q.detail)}</p>`:''}<div class="quest-meta"><span>Assigned by <b>${safe(assigner.name)}</b></span><span>→</span><span>Quest for <b>${safe(recipient.name)}</b></span><span>·</span><span>Witness <b>${safe(verifier.name)}</b></span></div>${q.bonuses?.length?`<ul class="bonus-list">${q.bonuses.map(b=>`<li>${safe(b.title)} <b>+${b.xp} XP</b>${b.done?' · complete':q.status==='open'?' · unlocks after main quest':' · not earned'}</li>`).join('')}</ul>`:''}${action?`<div class="quest-actions">${action}</div>`:''}</article>`;
}
function createForm(date,me){const assignee=recipientFor(me.id,date);return `<section class="panel create-quest-panel" id="createQuestPanel"><div class="panel-title"><h2>Write your quest</h2><span class="section-tag">ONE EACH PER DAY</span></div><p class="hint">You’re assigning a quest to <b>${safe(player(assignee).name)}</b> for <b>${prettyDate(date)}</b>. The remaining friend will be the witness.</p><form id="questForm"><div class="field"><label for="questTitle">Main quest</label><input id="questTitle" maxlength="90" placeholder="e.g. Say ‘¡Qué chévere!’ at the perfect moment" required></div><div class="field"><label for="questDetail">Little details <span>OPTIONAL</span></label><textarea id="questDetail" maxlength="240" placeholder="Make it clear, kind, and easy to verify."></textarea></div><div class="field"><label for="xpRange">XP reward <span>DRAG TO SET</span></label><div class="range-wrap"><input id="xpRange" type="range" min="0" max="10000" step="100" value="1000"><output id="xpOutput" class="range-value">1,000 XP</output></div></div><div class="field"><label>Bonus objectives <span>ONLY COUNT IF MAIN QUEST IS DONE</span></label><div id="bonusRows"></div><button class="add-bonus" type="button" id="addBonus">＋ Add bonus objective</button></div><button class="btn" type="submit">Assign quest to ${safe(player(assignee).name)} ↗</button></form></section>`}
function bindCreate(date,me){
 document.querySelectorAll('.set-quest').forEach(b=>b.onclick=()=>{$('#createQuestPanel')?.scrollIntoView({behavior:'smooth',block:'center'});$('#questTitle')?.focus()});
 $('#xpRange').oninput=e=>$('#xpOutput').textContent=Number(e.target.value).toLocaleString()+' XP';
 const addBonus=()=>{const row=document.createElement('div');row.className='bonus-row';row.innerHTML=`<input maxlength="70" placeholder="Bonus objective (optional)"><input type="number" min="1" max="2000" step="25" value="250" aria-label="Bonus XP"><button class="icon-btn" type="button" aria-label="Remove bonus">×</button>`;row.querySelector('button').onclick=()=>row.remove();$('#bonusRows').appendChild(row)};
 $('#addBonus').onclick=addBonus;
 $('#questForm').onsubmit=async e=>{e.preventDefault();const title=$('#questTitle').value.trim();if(!title)return;if(!isSchedulable(date))return toast('Choose today or a date up to one week ahead.');if(gameData.quests.some(q=>q.date===date&&q.assigner===me.id))return toast('You have already assigned a quest for this date.');const bonuses=[...$('#bonusRows').querySelectorAll('.bonus-row')].map(r=>({title:r.querySelector('input').value.trim(),xp:Math.max(1,Math.min(2000,Number(r.querySelector('input[type=number]').value)||1))})).filter(b=>b.title);const {error}=await backend.rpc('create_quest',{p_date:date,p_title:title,p_detail:$('#questDetail').value.trim(),p_xp:Number($('#xpRange').value),p_bonuses:bonuses});if(error)return toast(error.message);await refreshData();render();toast('Quest assigned. Let the shenanigans begin.');};
}
function bindQuest(q,me){
 const complete=document.querySelector(`[data-complete="${q.id}"]`);if(complete)complete.onclick=async()=>{const {error}=await backend.rpc('complete_quest',{p_quest_id:q.id});if(error)return toast(error.message);await refreshData();render();toast('Marked done. Waiting on your witness!')};
 const attest=document.querySelector(`[data-attest="${q.id}"]`);if(attest)attest.onclick=()=>{const verifier=PLAYERS.find(p=>p.id!==q.assignee&&p.id!==q.assigner);if(me.id!==verifier.id)return;const contents=`<div class="modal-backdrop"><div class="modal"><div class="section-tag">WITNESS CHECK · ${safe(player(q.assignee).name)}</div><h2>Did they do the thing?</h2><p>Confirm the main quest first. Bonus XP only counts when the main quest was completed.</p>${q.bonuses?.length?`<div class="field"><label>Bonus objectives</label>${q.bonuses.map((b,i)=>`<label style="justify-content:flex-start;gap:8px;font:12px var(--sans);text-transform:none;letter-spacing:0;color:var(--ink);margin:10px 0"><input type="checkbox" data-bonus="${i}"> ${safe(b.title)} <b style="margin-left:auto">+${b.xp} XP</b></label>`).join('')}</div>`:''}<div class="modal-actions"><button class="btn secondary" id="cancelAttest">Not yet</button><button class="btn accent" id="confirmAttest">Yep, award XP ✓</button></div></div></div>`;document.body.insertAdjacentHTML('beforeend',contents);$('#cancelAttest').onclick=()=>$('.modal-backdrop').remove();$('#confirmAttest').onclick=async()=>{const bonusDone=(q.bonuses||[]).map((b,i)=>Boolean($(`[data-bonus="${i}"]`)?.checked));const {error}=await backend.rpc('attest_quest',{p_quest_id:q.id,p_bonus_done:bonusDone});if(error)return toast(error.message);$('.modal-backdrop').remove();await refreshData();render();toast(`${player(q.assignee).name} earned XP!`)}};
}
function toast(msg){const el=$('#toast');if(!el)return;el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
async function initialize(){
 if(!backend){render();return}
 const {data,error}=await backend.auth.getSession();
 if(error||!data.session){renderLogin();return}
 try{await loadPlayer(data.session.user.id);await refreshData();watchGame();render()}catch(err){await backend.auth.signOut();statePlayerId=null;renderLogin(err.message)}
}
initialize();
