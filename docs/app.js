// --- Configuración básica ---
const PHASES = ["Producción","Movimiento","Acción","Evento del Nexo","Diplomacia"];
const RES = ["food","energy","metal"];
const CIVS = [
  { id:"iron", name:"Forjadores de Hierro", bonus:"defense_metal" },
  { id:"wind", name:"Nómadas del Viento", bonus:"extra_move" },
  { id:"tech", name:"Tecnomantes", bonus:"shift_island" },
];

// --- Config extra ---
const LOG_LIMIT = 40;
let gameOver = false;
const PLAYER_COLORS = ["#6ee7b7","#93c5fd","#f9a8d4","#fcd34d"];

// Animación
const effects = []; // {tileId, kind:'shake'|'pulse', color?, started, duration}
let rafId = null;

function rand(n){ return Math.floor(Math.random()*n); }
function roll2d6(){ return 1+rand(6) + 1+rand(6); }
function now(){ return performance.now(); }

// --- Estado del juego ---
const state = {
  turn: 1,
  phase: 0,
  players: [],
  board: [],
  size: {cols: 6, rows: 4},
  log: [],
};

// --- Utilidades UI ---
function log(msg){
  state.log.unshift(msg);
  if(state.log.length > LOG_LIMIT) state.log = state.log.slice(0, LOG_LIMIT);
  renderSidebar();
}

// Efectos visuales ------------------------------------------------------------
function addShake(tileId, ms=450){
  effects.push({ tileId, kind:"shake", started:now(), duration:ms });
}
function addPulse(tileId, color="#ffffff", ms=850){
  effects.push({ tileId, kind:"pulse", color, started:now(), duration:ms });
}
function cleanupEffects(){
  const t = now();
  for(let i=effects.length-1;i>=0;i--){
    if(t - effects[i].started > effects[i].duration) effects.splice(i,1);
  }
}

// --- Tablero y jugadores ---
function newBoard(){
  const tiles = [];
  for(let r=0;r<state.size.rows;r++){
    for(let c=0;c<state.size.cols;c++){
      tiles.push({ id:`t${r}_${c}`, r, c, type:RES[rand(RES.length)], owner:null, troops:0, fort:0 });
    }
  }
  state.board = tiles;
}

function newPlayers(n=3){
  state.players = [];
  for(let i=0;i<n;i++){
    const civ = CIVS[i % CIVS.length];
    state.players.push({
      id:`P${i+1}`,
      name:`Jugador ${i+1}`,
      civ,
      resources:{food:3, energy:1, metal:2},
      points:0,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    });
  }
  const used = new Set();
  state.players.forEach(p=>{
    let t;
    do{ t = state.board[rand(state.board.length)]; }while(used.has(t.id));
    used.add(t.id);
    t.owner = p.id; t.troops = 2;
  });
}

function neighbors(tile){
  // Vecindad Manhattan (simple para prototipo)
  return state.board.filter(t => (Math.abs(t.r - tile.r) + Math.abs(t.c - tile.c) === 1));
}

// --- Fases y reglas ---
function doProduction(){
  state.board.forEach(t=>{
    if(!t.owner) return;
    const p = state.players.find(x=>x.id===t.owner);
    p.resources[t.type] = (p.resources[t.type]||0)+1;
  });
  log("Producción: +1 recurso por isla controlada.");
}

function resolveCombat(att, def){
  const ra = roll2d6() + att.troops;
  const rd = roll2d6() + def.troops + def.fort;

  // Marca shake en ambos al combatir
  addShake(att.id);
  addShake(def.id);

  if(ra>rd){
    def.troops = Math.max(0, def.troops-1);
    log(`Ataque gana (${ra} vs ${rd}). Defensor pierde 1 tropa.`);

    if(def.troops===0){
      // Conquista → pulse con color del nuevo dueño
      const pIdx = Math.max(0, state.players.findIndex(x=>x.id===att.owner));
      const glow = PLAYER_COLORS[pIdx % PLAYER_COLORS.length];
      def.owner = att.owner; def.troops = 1;
      const p = state.players.find(x=>x.id===att.owner);
      p.points += 1;
      addPulse(def.id, glow);
      log(`Isla conquistada por ${p.name}: +1 Punto de Nexo.`);
    }
  }else if(rd>ra){
    att.troops = Math.max(0, att.troops-1);
    log(`Defensa gana (${rd} vs ${ra}). Atacante pierde 1 tropa.`);
  }else{
    log("Empate: ventaja para el defensor.");
  }
}

function doMovement(){
  state.players.forEach(p=>{
    const owned = state.board.filter(t=>t.owner===p.id && t.troops>0);
    if(!owned.length) return;
    const from = owned[rand(owned.length)];
    const ns = neighbors(from).filter(n=>!n.owner || n.owner===p.id);
    if(!ns.length) return;
    const to = ns[rand(ns.length)];
    from.troops -= 1;
    if(!to.owner) to.owner = p.id;
    to.troops += 1;
  });
  log("Movimiento automático ejecutado.");
}

function doAction(){
  state.players.forEach(p=>{
    const owned = state.board.filter(t=>t.owner===p.id && t.troops>0);
    let acted = false;
    for(const from of owned){
      const ns = neighbors(from).filter(n=>n.owner && n.owner!==p.id);
      if(ns.length){
        resolveCombat(from, ns[rand(ns.length)]);
        acted = true; break;
      }
    }
    if(!acted && p.resources.food>=2 && owned.length){
      p.resources.food -= 2;
      owned[rand(owned.length)].troops += 1;
      log(`${p.name} recluta 1 tropa (−2🍖).`);
    }
  });
}

function shuffleBoard(){
  for(let i=0;i<3;i++){
    const a = state.board[rand(state.board.length)];
    const b = state.board[rand(state.board.length)];
    const tmp = {r:a.r,c:a.c}; a.r=b.r; a.c=b.c; b.r=tmp.r; b.c=tmp.c;
  }
}

function doNexoEvent(){
  const roll = rand(3);
  if(roll===0){
    shuffleBoard();
    // pequeño pulse global: elegimos 3 casillas al azar
    for(let i=0;i<3;i++){
      const t = state.board[rand(state.board.length)];
      addPulse(t.id, "#00d4ff", 500);
    }
    log("Cizalla Dimensional: varias islas cambian de posición.");
  }else if(roll===1){
    const owned = state.board.filter(t=>t.owner);
    if(owned.length){
      const t = owned[rand(owned.length)];
      const p = state.players.find(x=>x.id===t.owner);
      p.points += 2;
      addPulse(t.id, p.color || "#ffffff", 900);
      log(`Reliquia Antigua en isla de ${p.name}: +2 Puntos de Nexo.`);
    }
  }else{
    state.players.forEach(p=>p.resources.energy+=1);
    log("Tormenta Etérea: todos ganan +1⚡.");
  }
}

function doDiplomacy(){
  if(state.players.length<2) return;
  if(Math.random()<0.2){
    const a = state.players[rand(state.players.length)];
    let b; do{ b = state.players[rand(state.players.length)]; }while(b.id===a.id);
    a.points += 2; b.points += 2;
    log(`Alianza honrada entre ${a.name} y ${b.name}: +2 cada uno.`);
  }else{
    log("Sin acuerdos diplomáticos relevantes.");
  }
}

function checkVictory(){
  const winner = state.players.find(p => p.points >= 10);
  if(winner){
    gameOver = true;
    log(`🏆 ${winner.name} alcanza 10 Puntos de Nexo. ¡Victoria!`);
    alert(`🏆 ${winner.name} gana la partida`);
  }
}

function nextPhase(){
  if(gameOver) return;
  const p = PHASES[state.phase];
  if(p==="Producción") doProduction();
  if(p==="Movimiento") doMovement();
  if(p==="Acción") doAction();
  if(p==="Evento del Nexo") doNexoEvent();
  if(p==="Diplomacia") doDiplomacy();
  state.phase++;
  if(state.phase>=PHASES.length){
    state.phase = 0;
    state.turn++;
    checkVictory();
  }
  renderAll();
}

// --- Inicialización de partida ---
function newGame(players=3){
  gameOver = false;
  state.turn = 1; state.phase = 0; state.log = [];
  effects.length = 0;
  newBoard();
  newPlayers(players);
  renderAll();
  log("Nueva partida creada.");
}

// --- Canvas y render ---
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

function drawRoundedRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function tileRect(t){
  const margin = 40;
  const cw = (canvas.width - margin*2) / state.size.cols;
  const ch = (canvas.height - margin*2) / state.size.rows;
  const x = margin + t.c*cw + cw*0.05;
  const y = margin + t.r*ch + ch*0.05;
  const w = cw*0.9, h = ch*0.9;
  return {x,y,w,h};
}

function drawBoard(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // niebla sutil
  const fog = ctx.createLinearGradient(0,0,0,canvas.height);
  fog.addColorStop(0,'rgba(255,255,255,0.05)');
  fog.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle = fog;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  const tNow = now();

  state.board.forEach(t=>{
    let {x,y,w,h} = tileRect(t);

    // aplicar shake si existe
    const eShake = effects.find(e => e.tileId===t.id && e.kind==="shake");
    if(eShake){
      const dt = Math.min(1, (tNow - eShake.started)/eShake.duration);
      const amp = (1 - dt) * 6; // decae
      const ang = tNow/12; // velocidad
      x += Math.sin(ang + t.r)*amp;
      y += Math.cos(ang + t.c)*amp;
    }

    // sombra
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;

    // relleno cartoon + brillo vertical
    const fills = {food:"#2a7a34", energy:"#2f3da0", metal:"#694a2f"};
    drawRoundedRect(x,y,w,h,14);
    const grad = ctx.createLinearGradient(x,y,x,y+h);
    grad.addColorStop(0, "#ffffff12");
    grad.addColorStop(1, "#00000012");
    ctx.fillStyle = fills[t.type] || "#2a2a2a";
    ctx.fill();
    ctx.fillStyle = grad; ctx.fill();
    ctx.restore();

    // borde base
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0b1020";
    drawRoundedRect(x,y,w,h,14);
    ctx.stroke();

    // glow del dueño
    if(t.owner){
      const idx = Math.max(0, state.players.findIndex(p=>p.id===t.owner));
      const glow = PLAYER_COLORS[idx % PLAYER_COLORS.length];
      ctx.save();
      ctx.shadowColor = glow;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.strokeStyle = glow;
      drawRoundedRect(x,y,w,h,14);
      ctx.stroke();
      ctx.restore();
    }

    // pulse (destello expansivo) si existe
    const ePulse = effects.find(e => e.tileId===t.id && e.kind==="pulse");
    if(ePulse){
      const dt = (tNow - ePulse.started) / ePulse.duration; // 0..1
      if(dt>=0 && dt<=1){
        const alpha = 0.45 * (1 - dt);
        const spread = 6 + dt*14;
        ctx.save();
        ctx.shadowColor = ePulse.color || "#ffffff";
        ctx.shadowBlur = 22 + dt*30;
        ctx.lineWidth = 3 + dt*4;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        drawRoundedRect(x-spread, y-spread, w+spread*2, h+spread*2, 18);
        ctx.stroke();
        ctx.restore();
      }
    }

    // texto/icono
    ctx.fillStyle = "#e9efff";
    ctx.font = "14px system-ui";
    const icon = t.type==="food"?"🍖":(t.type==="energy"?"⚡":"⛓️");
    ctx.fillText(icon+" "+t.troops, x+8, y+20);
  });

  cleanupEffects();
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

// En animación, el tablero lo repinta el tick; la UI lateral se actualiza según eventos
function renderAll(){ renderSidebar(); }

function tick(){
  drawBoard();
  rafId = requestAnimationFrame(tick);
}

// --- Eventos UI ---
document.getElementById("newGame").addEventListener("click", ()=>newGame(3));
document.getElementById("nextPhase").addEventListener("click", nextPhase);
document.getElementById("resetGame").addEventListener("click", ()=>newGame(3));

// Boot
newGame(3);
renderAll();
if(rafId) cancelAnimationFrame(rafId);
tick();
