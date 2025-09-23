// ===================== CONFIG BÁSICA =====================
const PHASES = ["Producción","Movimiento","Acción","Evento del Nexo","Diplomacia"];
const RES = ["food","energy","metal"];
const CIVS = [
  { id:"iron", name:"Forjadores de Hierro", bonus:"defense_metal" },
  { id:"wind", name:"Nómadas del Viento", bonus:"extra_move" },
  { id:"tech", name:"Tecnomantes", bonus:"shift_island" },
];

const LOG_LIMIT = 40;
let gameOver = false;
const PLAYER_COLORS = ["#6ee7b7","#93c5fd","#f9a8d4","#fcd34d"];

// Estado
const state = {
  turn: 1, phase: 0, players: [], board: [],
  size: {cols: 6, rows: 4}, log: [],
  selectedTileId: null
};

// ===================== AUDIO =====================
class SFX {
  constructor(){
    const saved = JSON.parse(localStorage.getItem("eternum_audio")||"{}");
    this.muted = !!saved.muted;
    this.volume = typeof saved.volume==="number" ? saved.volume : 0.7;
    this.ctx = null; this.gain = null;
  }
  ensure(){
    if(this.ctx) return;
    this.ctx = new (window.AudioContext||window.webkitAudioContext)();
    this.gain = this.ctx.createGain(); this.gain.gain.value = this.muted ? 0 : this.volume;
    this.gain.connect(this.ctx.destination);
  }
  save(){ localStorage.setItem("eternum_audio", JSON.stringify({muted:this.muted, volume:this.volume})); }
  setMuted(b){ this.muted=b; if(this.gain) this.gain.gain.value = this.muted ? 0 : this.volume; this.save(); }
  setVolume(v){ this.volume=v; if(this.gain) this.gain.gain.value = this.muted ? 0 : this.volume; this.save(); }

  tone({type="sine", f=440, t=0.12, a=0.01, d=0.02, s=0.5, r=0.08, gain=0.4, sweep=0}){
    this.ensure();
    const ctx=this.ctx, g=ctx.createGain(), o=ctx.createOscillator();
    o.type=type; o.frequency.value=f;
    if(sweep){ const now=ctx.currentTime; o.frequency.setValueAtTime(f,now); o.frequency.linearRampToValueAtTime(f+sweep, now+t*0.8); }
    const now=ctx.currentTime; const env=g.gain;
    env.setValueAtTime(0, now);
    env.linearRampToValueAtTime(gain, now+a);
    env.linearRampToValueAtTime(gain*s, now+a+d);
    env.linearRampToValueAtTime(0, now+a+d+r);
    o.connect(g); g.connect(this.gain); o.start(); o.stop(now + Math.max(t, a+d+r)+0.01);
  }

  click(){ this.tone({type:"square", f:700, t:0.05, gain:0.25}); }
  move(){ this.tone({type:"sine", f:320, t:0.15, gain:0.25, sweep:90}); }
  production(){ this.tone({type:"triangle", f:880, t:0.18, gain:0.22}); this.tone({type:"triangle", f:1180, t:0.18, gain:0.15}); }
  hit(){ this.tone({type:"sawtooth", f:180, t:0.12, gain:0.35, sweep:-60}); }
  conquest(){ this.tone({type:"square", f:660, t:0.16, gain:0.3}); this.tone({type:"square", f:880, t:0.22, gain:0.25}); }
  nexo(){ this.tone({type:"sine", f:540, t:0.5, gain:0.22, sweep:280}); }
}
const sfx = new SFX();

// UI audio (si existen controles)
const volEl = document.getElementById("vol");
const muteEl = document.getElementById("mute");
if(volEl && muteEl){
  volEl.value = sfx.volume;
  muteEl.textContent = sfx.muted ? "🔇" : "🔊";
  volEl.addEventListener("input", e=>{ sfx.setVolume(parseFloat(e.target.value)); });
  muteEl.addEventListener("click", ()=>{ sfx.setMuted(!sfx.muted); muteEl.textContent = sfx.muted ? "🔇" : "🔊"; sfx.click(); });
}

// ===================== UTIL =====================
function rand(n){ return Math.floor(Math.random()*n); }
function roll2d6(){ return 1+rand(6) + 1+rand(6); }
function log(msg){ state.log.unshift(msg); if(state.log.length>LOG_LIMIT) state.log=state.log.slice(0,LOG_LIMIT); renderSidebar(); }
function ownerOf(tile){ return tile.owner ? state.players.find(p=>p.id===tile.owner) : null; }

// ===================== EFECTOS =====================
const effects = []; // {tileId, kind:'shake'|'pulse', color?, started, duration}
let rafId=null;
function now(){ return performance.now(); }
function addShake(tileId, ms=450){ effects.push({tileId,kind:"shake",started:now(),duration:ms}); }
function addPulse(tileId, color="#ffffff", ms=850){ effects.push({tileId,kind:"pulse",color,started:now(),duration:ms}); }
function cleanupEffects(){ const t=now(); for(let i=effects.length-1;i>=0;i--){ if(t-effects[i].started>effects[i].duration) effects.splice(i,1); } }

// ===================== TABLERO/JUGADORES =====================
function newBoard(){
  const tiles=[];
  for(let r=0;r<state.size.rows;r++){
    for(let c=0;c<state.size.cols;c++){
      tiles.push({ id:`t${r}_${c}`, r, c, type:RES[rand(RES.length)], owner:null, troops:0, fort:0 });
    }
  }
  state.board=tiles;
}
function newPlayers(n=3){
  state.players=[];
  for(let i=0;i<n;i++){
    const civ=CIVS[i%CIVS.length];
    state.players.push({ id:`P${i+1}`, name:`Jugador ${i+1}`, civ, resources:{food:3, energy:1, metal:2}, points:0, color:PLAYER_COLORS[i%PLAYER_COLORS.length] });
  }
  const used=new Set();
  state.players.forEach(p=>{
    let t; do{ t=state.board[rand(state.board.length)]; }while(used.has(t.id));
    used.add(t.id); t.owner=p.id; t.troops=2;
  });
}
function neighbors(tile){ return state.board.filter(t => (Math.abs(t.r - tile.r) + Math.abs(t.c - tile.c) === 1)); }

// ===================== FASES =====================
function doProduction(){ state.board.forEach(t=>{ if(!t.owner) return; const p=state.players.find(x=>x.id===t.owner); p.resources[t.type]=(p.resources[t.type]||0)+1; }); log("Producción: +1 recurso por isla controlada."); sfx.production(); }

function resolveCombat(att,def){
  const ra=roll2d6()+att.troops, rd=roll2d6()+def.troops+def.fort;
  addShake(att.id); addShake(def.id); sfx.hit();
  if(ra>rd){
    def.troops=Math.max(0,def.troops-1);
    log(`Ataque gana (${ra} vs ${rd}). Defensor pierde 1 tropa.`);
    if(def.troops===0){
      const pIdx = Math.max(0, state.players.findIndex(x=>x.id===att.owner));
      const glow = PLAYER_COLORS[pIdx % PLAYER_COLORS.length];
      def.owner=att.owner; def.troops=1;
      const p=state.players.find(x=>x.id===att.owner); p.points+=1;
      addPulse(def.id,glow); sfx.conquest();
      log(`Isla conquistada por ${p.name}: +1 Punto de Nexo.`);
    }
  } else if(rd>ra){ att.troops=Math.max(0,att.troops-1); log(`Defensa gana (${rd} vs ${ra}). Atacante pierde 1 troppa.`); }
    else { log("Empate: ventaja para el defensor."); }
}

function doMovement(){
  state.players.forEach(p=>{
    const owned=state.board.filter(t=>t.owner===p.id && t.troops>0);
    if(!owned.length) return;
    const from=owned[rand(owned.length)];
    const ns=neighbors(from).filter(n=>!n.owner || n.owner===p.id);
    if(!ns.length) return;
    const to=ns[rand(ns.length)];
    from.troops-=1; if(!to.owner) to.owner=p.id; to.troops+=1;
  });
  log("Movimiento automático ejecutado."); sfx.move();
}

function doAction(){
  state.players.forEach(p=>{
    const owned=state.board.filter(t=>t.owner===p.id && t.troops>0);
    let acted=false;
    for(const from of owned){
      const ns=neighbors(from).filter(n=>n.owner && n.owner!==p.id);
      if(ns.length){ resolveCombat(from, ns[rand(ns.length)]); acted=true; break; }
    }
    if(!acted && p.resources.food>=2 && owned.length){
      p.resources.food-=2; owned[rand(owned.length)].troops+=1; log(`${p.name} recluta 1 tropa (−2🍖).`);
    }
  });
}

function shuffleBoard(){
  for(let i=0;i<3;i++){
    const a=state.board[rand(state.board.length)], b=state.board[rand(state.board.length)];
    const tmp={r:a.r,c:a.c}; a.r=b.r; a.c=b.c; b.r=tmp.r; b.c=tmp.c;
  }
}
function doNexoEvent(){
  const roll=rand(3);
  if(roll===0){ shuffleBoard(); for(let i=0;i<3;i++){ const t=state.board[rand(state.board.length)]; addPulse(t.id,"#00d4ff",500); } log("Cizalla Dimensional: varias islas cambian de posición."); }
  else if(roll===1){ const owned=state.board.filter(t=>t.owner); if(owned.length){ const t=owned[rand(owned.length)]; const p=state.players.find(x=>x.id===t.owner); p.points+=2; addPulse(t.id, p.color||"#fff", 900); log(`Reliquia Antigua en isla de ${p.name}: +2 Puntos de Nexo.`);} }
  else { state.players.forEach(p=>p.resources.energy+=1); log("Tormenta Etérea: todos ganan +1⚡."); }
  sfx.nexo();
}
function doDiplomacy(){
  if(state.players.length<2) return;
  if(Math.random()<0.2){ const a=state.players[rand(state.players.length)]; let b; do{ b=state.players[rand(state.players.length)]; }while(b.id===a.id); a.points+=2; b.points+=2; log(`Alianza honrada entre ${a.name} y ${b.name}: +2 cada uno.`); }
  else { log("Sin acuerdos diplomáticos relevantes."); }
}

function checkVictory(){
  const winner = state.players.find(p => p.points >= 10);
  if(winner){ gameOver=true; log(`🏆 ${winner.name} alcanza 10 Puntos de Nexo. ¡Victoria!`); alert(`🏆 ${winner.name} gana la partida`); }
}

function nextPhase(){
  if(gameOver) return;
  const p = PHASES[state.phase];
  if(p==="Producción") doProduction();
  if(p==="Movimiento") doMovement();
  if(p==="Acción") doAction();
  if(p==="Evento del Nexo") doNexoEvent();
  if(p==="Diplomacia") doDiplomacy();
  state.phase++; if(state.phase>=PHASES.length){ state.phase=0; state.turn++; checkVictory(); }
  renderAll();
}

// Turno completo
async function playFullTurn(){
  if(gameOver) return;
  for(let i=0;i<5;i++){ nextPhase(); await new Promise(r=>setTimeout(r,140)); if(gameOver) break; }
}

// ===================== RENDER / CANVAS =====================
const canvas=document.getElementById("board"); const ctx=canvas.getContext("2d");
const mini=document.getElementById("minimap"); const mctx=mini ? mini.getContext("2d") : null;
const mmWrap=document.getElementById("mmWrap"); const mmToggle=document.getElementById("mmToggle");

function drawRoundedRect(x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
function tileRect(t){
  const margin=40, cw=(canvas.width - margin*2)/state.size.cols, ch=(canvas.height - margin*2)/state.size.rows;
  const x=margin + t.c*cw + cw*0.05, y=margin + t.r*ch + ch*0.05, w=cw*0.9, h=ch*0.9;
  return {x,y,w,h,cw,ch,margin};
}

function drawBoard(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // niebla
  const fog=ctx.createLinearGradient(0,0,0,canvas.height); fog.addColorStop(0,'rgba(255,255,255,0.05)'); fog.addColorStop(1,'rgba(255,255,255,0)'); ctx.fillStyle=fog; ctx.fillRect(0,0,canvas.width,canvas.height);
  const tNow=performance.now();

  state.board.forEach(t=>{
    let {x,y,w,h}=tileRect(t);

    // shake
    const eShake=effects.find(e=>e.tileId===t.id && e.kind==="shake");
    if(eShake){ const dt=Math.min(1,(tNow-eShake.started)/eShake.duration), amp=(1-dt)*6, ang=tNow/12; x+=Math.sin(ang+t.r)*amp; y+=Math.cos(ang+t.c)*amp; }

    // sombra + relleno
    ctx.save(); ctx.shadowColor="rgba(0,0,0,.45)"; ctx.shadowBlur=18; ctx.shadowOffsetY=6;
    const fills={food:"#2a7a34", energy:"#2f3da0", metal:"#694a2f"};
    drawRoundedRect(x,y,w,h,14);
    const grad=ctx.createLinearGradient(x,y,x,y+h); grad.addColorStop(0,"#ffffff12"); grad.addColorStop(1,"#00000012");
    ctx.fillStyle=fills[t.type]||"#2a2a2a"; ctx.fill(); ctx.fillStyle=grad; ctx.fill(); ctx.restore();

    // borde base
    ctx.lineWidth=2; ctx.strokeStyle="#0b1020"; drawRoundedRect(x,y,w,h,14); ctx.stroke();

    // glow dueño
    if(t.owner){ const idx=Math.max(0,state.players.findIndex(p=>p.id===t.owner)); const glow=PLAYER_COLORS[idx%PLAYER_COLORS.length];
      ctx.save(); ctx.shadowColor=glow; ctx.shadowBlur=14; ctx.lineWidth=3; ctx.strokeStyle=glow; drawRoundedRect(x,y,w,h,14); ctx.stroke(); ctx.restore(); }

    // pulse
    const ePulse=effects.find(e=>e.tileId===t.id && e.kind==="pulse");
    if(ePulse){ const dt=(tNow-ePulse.started)/ePulse.duration; if(dt>=0 && dt<=1){ const alpha=0.45*(1-dt), spread=6+dt*14; ctx.save(); ctx.shadowColor=ePulse.color||"#fff"; ctx.shadowBlur=22+dt*30; ctx.lineWidth=3+dt*4; ctx.strokeStyle=`rgba(255,255,255,${alpha})`; drawRoundedRect(x-spread,y-spread,w+spread*2,h+spread*2,18); ctx.stroke(); ctx.restore(); } }

    // texto
    ctx.fillStyle="#e9efff"; ctx.font="14px system-ui";
    const icon=t.type==="food"?"🍖":(t.type==="energy"?"⚡":"⛓️");
    ctx.fillText(icon+" "+t.troops, x+8, y+20);
  });

  // selección
  if(state.selectedTileId){
    const t = state.board.find(x=>x.id===state.selectedTileId);
    if(t){ const {x,y,w,h} = tileRect(t); ctx.save(); ctx.lineWidth = 5; ctx.strokeStyle = "#ffffffcc"; drawRoundedRect(x-2,y-2,w+4,h+4,16); ctx.stroke(); ctx.restore(); }
  }

  cleanupEffects();
  drawMinimap();
}

function drawMinimap(){
  if(!mctx) return;
  mctx.clearRect(0,0,mini.width,mini.height);
  const cols=state.size.cols, rows=state.size.rows;
  const cw=mini.width/cols, ch=mini.height/rows;
  state.board.forEach(t=>{
    const x=t.c*cw, y=t.r*ch, w=cw-1, h=ch-1;
    const fills={food:"#2a7a34", energy:"#2f3da0", metal:"#694a2f"};
    mctx.fillStyle=fills[t.type]; mctx.fillRect(x,y,w,h);
    if(t.owner){ const idx=Math.max(0,state.players.findIndex(p=>p.id===t.owner)); mctx.strokeStyle=PLAYER_COLORS[idx%PLAYER_COLORS.length]; mctx.lineWidth=2; mctx.strokeRect(x+1,y+1,w-2,h-2); }
  });
  // selección
  if(state.selectedTileId){
    const t=state.board.find(x=>x.id===state.selectedTileId);
    if(t){ const cw=mini.width/state.size.cols, ch=mini.height/state.size.rows; mctx.strokeStyle="#fff"; mctx.lineWidth=2; mctx.strokeRect(t.c*cw+1, t.r*ch+1, cw-2, ch-2); }
  }
}

function renderSidebar(){
  document.getElementById("phase").textContent = "Fase: "+PHASES[state.phase];
  document.getElementById("turn").textContent  = " | Turno: "+state.turn;
  document.getElementById("players").innerHTML = state.players.map(p=>
    `<div class="tag"><b>${p.name}</b> — <span class="small">${p.civ.name}</span> — Puntos: ${p.points} — 🍖${p.resources.food} ⚡${p.resources.energy} ⛓️${p.resources.metal}</div>`
  ).join("");
  document.getElementById("log").innerHTML = state.log.map(x=>{
    const cls = x.includes("conquistada")?"win":(x.includes("Tormenta")||x.includes("Cizalla"))?"warn":x.includes("pierde 1 tropa")?"bad":"";
    return `<div class="line ${cls}">• ${x}</div>`;
  }).join("");
}
function renderAll(){ renderSidebar(); }

// ===================== CONTROLES (tap/long-press + minimapa) =====================
let pressTimer = null;
let pressStartPos = null;

function screenToTile(px, py){
  const rect = canvas.getBoundingClientRect();
  const x = (px - rect.left) * (canvas.width / rect.width);
  const y = (py - rect.top) * (canvas.height / rect.height);
  const margin=40, cw=(canvas.width - margin*2)/state.size.cols, ch=(canvas.height - margin*2)/state.size.rows;
  const cx = Math.floor((x - margin) / cw);
  const cy = Math.floor((y - margin) / ch);
  if(cx<0||cy<0||cx>=state.size.cols||cy>=state.size.rows) return null;
  return state.board.find(t=>t.c===cx && t.r===cy);
}
function selectTile(t){ if(!t) return; state.selectedTileId = t.id; sfx.click(); renderAll(); }
function tryMoveOrAttack(from, to){
  if(!from || !to) return;
  if(from.id===to.id) return;
  if(Math.abs(from.r - to.r) + Math.abs(from.c - to.c) !== 1){ log("Solo puedes actuar en islas adyacentes."); return; }
  const me = ownerOf(from); if(!me){ log("Selecciona primero una isla que controles."); return; }
  if(!to.owner || to.owner===from.owner){
    if(from.troops<=0){ log("No hay tropas para mover."); return; }
    from.troops -= 1; if(!to.owner) to.owner = from.owner; to.troops += 1;
    addShake(to.id, 250); sfx.move(); log(`Movimiento de 1 tropa a isla adyacente.`);
  }else{
    resolveCombat(from, to);
  }
  renderAll();
}

// Long-press para tooltip
function showTooltip(t, px, py){
  let tip = document.getElementById("tile-tip");
  if(!tip){
    tip = document.createElement("div");
    tip.id = "tile-tip";
    tip.style.position = "fixed";
    tip.style.zIndex = "9999";
    tip.style.background = "rgba(13,20,48,.95)";
    tip.style.border = "1px solid #2a3a8a";
    tip.style.color = "#e9efff";
    tip.style.padding = "8px 10px";
    tip.style.borderRadius = "12px";
    tip.style.boxShadow = "0 10px 30px rgba(0,0,0,.35)";
    tip.style.font = "14px system-ui";
    document.body.appendChild(tip);
  }
  const owner = ownerOf(t);
  const icon = t.type==="food"?"🍖":(t.type==="energy"?"⚡":"⛓️");
  tip.innerHTML = `<b>Isla</b> ${t.r},${t.c} — ${icon}<br>${owner?`Dueño: ${owner.name}`:"Sin dueño"}<br>Tropas: ${t.troops}`;
  tip.style.left = (px + 10) + "px";
  tip.style.top  = (py - 10) + "px";
  tip.style.display = "block";
  setTimeout(()=>{ tip.style.display="none"; }, 1500);
}

function startPress(px, py){
  clearTimeout(pressTimer);
  pressStartPos = {px, py};
  pressTimer = setTimeout(()=>{
    const t = screenToTile(px, py);
    if(t) showTooltip(t, px, py);
  }, 500);
}
function endPress(px, py){
  clearTimeout(pressTimer);
  const start = pressStartPos; pressStartPos = null;
  if(!start) return;
  const dx = Math.abs(px - start.px), dy = Math.abs(py - start.py);
  if(dx<8 && dy<8){
    const t = screenToTile(px, py); if(!t) return;
    const sel = state.board.find(x=>x.id===state.selectedTileId);
    if(sel){ tryMoveOrAttack(sel, t); if(sel.troops<=0) state.selectedTileId = t.id; }
    else{
      if(t.owner){ const me = state.players[0]; if(t.owner===me.id) selectTile(t); else log("Esa isla no es tuya."); }
      else log("Selecciona primero una isla que controles.");
    }
  }
}

// Touch/mouse sobre tablero
canvas.addEventListener("touchstart", e=>{ const t=e.touches[0]; startPress(t.clientX, t.clientY); }, {passive:true});
canvas.addEventListener("touchend", e=>{ const t=e.changedTouches[0]; endPress(t.clientX, t.clientY); }, {passive:true});
canvas.addEventListener("touchmove", e=>{ if(!pressStartPos) return; const t=e.touches[0]; if(Math.abs(t.clientX-pressStartPos.px)>12 || Math.abs(t.clientY-pressStartPos.py)>12){ clearTimeout(pressTimer); pressStartPos=null; }}, {passive:true});
canvas.addEventListener("mousedown", e=>startPress(e.clientX, e.clientY));
window.addEventListener("mouseup", e=>endPress(e.clientX, e.clientY));

// Minimapa: tap para seleccionar casilla
if(mini){
  function minimapToTile(px, py){
    const rect = mini.getBoundingClientRect();
    const x = (px - rect.left) * (mini.width / rect.width);
    const y = (py - rect.top) * (mini.height / rect.height);
    const cx = Math.floor(x / (mini.width / state.size.cols));
    const cy = Math.floor(y / (mini.height / state.size.rows));
    if(cx<0||cy<0||cx>=state.size.cols||cy>=state.size.rows) return null;
    return state.board.find(t=>t.c===cx && t.r===cy);
  }
  function onMiniTap(px, py){
    const t = minimapToTile(px, py);
    if(t){ selectTile(t); }
  }
  mini.addEventListener("click", e=>onMiniTap(e.clientX, e.clientY));
  mini.addEventListener("touchstart", e=>{ const t=e.touches[0]; onMiniTap(t.clientX, t.clientY); }, {passive:true});
}

// Botón de ocultar/mostrar minimapa
if(mmToggle && mmWrap){
  mmToggle.addEventListener("click", ()=>{
    mmWrap.classList.toggle("minimized");
    mmToggle.textContent = mmWrap.classList.contains("minimized") ? "+" : "−";
  });
}

// ===================== UI BOTONES =====================
document.getElementById("newGame").addEventListener("click", ()=>{ sfx.click(); newGame(3); });
document.getElementById("nextPhase").addEventListener("click", ()=>{ sfx.click(); nextPhase(); });
const playTurnBtn = document.getElementById("playTurn");
if(playTurnBtn) playTurnBtn.addEventListener("click", ()=>{ sfx.click(); playFullTurn(); });
document.getElementById("resetGame").addEventListener("click", ()=>{ sfx.click(); newGame(3); });

// ===================== BOOT + LOOP =====================
function drawMinimap(){ /* definida arriba */ }
function renderAll(){ renderSidebar(); }

function tick(){ drawBoard(); rafId=requestAnimationFrame(tick); }
function newGame(players=3){
  gameOver=false; state.turn=1; state.phase=0; state.log=[]; effects.length=0; state.selectedTileId=null;
  newBoard(); newPlayers(players); renderAll(); log("Nueva partida creada.");
}
newGame(3); renderAll(); if(rafId) cancelAnimationFrame(rafId); tick();
