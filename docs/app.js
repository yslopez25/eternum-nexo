// --- Configuración básica ---
const PHASES = ["Producción","Movimiento","Acción","Evento del Nexo","Diplomacia"];
const RES = ["food","energy","metal"];
const CIVS = [
  { id:"iron", name:"Forjadores de Hierro", bonus:"defense_metal" },
  { id:"wind", name:"Nómadas del Viento", bonus:"extra_move" },
  { id:"tech", name:"Tecnomantes", bonus:"shift_island" },
];

// --- Config extra ---
const LOG_LIMIT = 40;              // máximo de líneas de log
let gameOver = false;              // detener juego al ganar
const PLAYER_COLORS = ["#6ee7b7","#93c5fd","#f9a8d4","#fcd34d"]; // glow por jugador

function rand(n){ return Math.floor(Math.random()*n); }
function roll2d6(){ return 1+rand(6) + 1+rand(6); }

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
    const tmp = {r:a.r,c:a.c};
