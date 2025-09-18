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

// (aquí sigue el resto de tu código con rand(), roll2d6(), state, etc.)


function rand(n){ return Math.floor(Math.random()*n); }
function roll2d6(){ return 1+rand(6) + 1+rand(6); }

// --- Estado del juego ---
const state = {
  turn: 1,
  phase: 0,
  players: [],
  board: [],             // casillas con tipo y dueño
  size: {cols: 6, rows: 4},
  log: [],
};

// --- Utilidades UI ---
function log(msg){ state.log.unshift(msg); renderSidebar(); }

// --- Tablero ---
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
  const colors = ["#6ee7b7","#93c5fd","#f9a8d4","#fcd34d"];
  for(let i=0;i<n;i++){
    const civ = CIVS[i % CIVS.length];
    state.players.push({
      id:`P${i+1}`,
      name:`Jugador ${i+1}`,
      civ,
      resources:{food:3, energy:1, metal:2},
      points:0,
      color: colors[i],
    });
  }
  // Asignar casillas iniciales
  const used = new Set();
  state.players.forEach(p=>{
    let t;
    do{ t = state.board[rand(state.board.length)]; }while(used.has(t.id));
    used.add(t.id);
    t.owner = p.id; t.troops = 2;
  });
}

function neighbors(tile){
  // Vecindad básica (arriba/abajo/izquierda/derecha)
  return state.board.filter(t => (Math.abs(t.r - tile.r) + Math.abs(t.c - tile.c) === 1));
}

// --- Fases ---
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
  if(ra>rd){
    def.troops = Math.max(0, def.troops-1);
    log(`Ataque gana (${ra} vs ${rd}). Defensor pierde 1 tropa.`);
    if(def.troops===0){
      def.owner = att.owner; def.troops = 1;
      const p = state.players.find(x=>x.id===att.owner);
      p.points += 1;
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
  // Movimiento automático simple: cada jugador mueve 1 tropa si puede
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
  // Intentar atacar si hay enemigo al lado; si no, reclutar (si hay 🍖)
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
  // “Mapa vivo”: intercambiar posiciones de algunas casillas
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
    log("Cizalla Dimensional: varias islas cambian de posición.");
  }else if(roll===1){
    const owned = state.board.filter(t=>t.owner);
    if(owned.length){
      const t = owned[rand(owned.length)];
      const p = state.players.find(x=>x.id===t.owner);
      p.points += 2;
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

function nextPhase(){
  const p = PHASES[state.phase];
  if(p==="Producción") doProduction();
  if(p==="Movimiento") doMovement();
  if(p==="Acción") doAction();
  if(p==="Evento del Nexo") doNexoEvent();
  if(p==="Diplomacia") doDiplomacy();

  state.phase++;
  if(state.phase>=PHASES.length){
    state.phase = 0; state.turn++;
  }
  renderAll();
}

function newGame(players=3){
  state.turn = 1; state.phase = 0; state.log = [];
  newBoard();
  newPlayers(players);
  renderAll();
  log("Nueva partida creada.");
}

// --- Render ---
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

function drawBoard(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const margin = 40;
  const cw = (canvas.width - margin*2) / state.size.cols;
  const ch = (canvas.height - margin*2) / state.size.rows;
  state.board.forEach(t=>{
    const x = margin + t.c*cw + cw/2;
    const y = margin + t.r*ch + ch/2;
    // casilla
    ctx.beginPath();
    ctx.rect(x-cw*0.45, y-ch*0.45, cw*0.9, ch*0.9);
    const fills = {food:"#1b5e20", energy:"#283593", metal:"#4e342e"};
    ctx.fillStyle = fills[t.type];
    ctx.fill();
    ctx.strokeStyle = "#0b1020";
    ctx.lineWidth = 2;
    ctx.stroke();
    // borde por dueño
    if(t.owner){
      const p = state.players.find(x=>x.id===t.owner);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 4;
      ctx.strokeRect(x-cw*0.45, y-ch*0.45, cw*0.9, ch*0.9);
    }
    // texto
    ctx.fillStyle = "#e9efff";
    ctx.font = "14px system-ui";
    const icon = t.type==="food"?"🍖":(t.type==="energy"?"⚡":"⛓️");
    ctx.fillText(icon+" "+t.troops, x-cw*0.4, y);
  });
}

function renderSidebar(){
  document.getElementById("phase").textContent = "Fase: "+PHASES[state.phase];
  document.getElementById("turn").textContent = " | Turno: "+state.turn;
  const ps = state.players.map(p=>{
    return `<div class="tag"><b>${p.name}</b> — <span class="small">${p.civ.name}</span> — Puntos: ${p.points} — 🍖${p.resources.food} ⚡${p.resources.energy} ⛓️${p.resources.metal}</div>`;
  }).join("");
  document.getElementById("players").innerHTML = ps;
  document.getElementById("log").innerHTML = state.log.map(x=>`• ${x}`).join("<br/>");
}

function renderAll(){ drawBoard(); renderSidebar(); }

// --- Eventos UI ---
document.getElementById("newGame").addEventListener("click", ()=>newGame(3));
document.getElementById("nextPhase").addEventListener("click", nextPhase);

// Boot
newGame(3);
renderAll();
