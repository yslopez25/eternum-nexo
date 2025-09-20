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

// Estado base
const state = {
  turn: 1, phase: 0, players: [], board: [],
  size: {cols: 6, rows: 4}, log: [],
  selectedTileId: null
};

// ===================== AUDIO (SONIDOS) =====================
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

// ===================== UTIL =====================
function rand(n){ return Math.floor(Math.random()*n); }
function roll2d6(){ return 1+rand(6) + 1+rand(6); }
function log(msg){ state.log.unshift(msg); if(state.log.length>LOG_LIMIT) state.log=state.log.slice(0,LOG_LIMIT); renderSidebar(); }
function ownerOf(tile){ return tile.owner ? state.players.find(p=>p.id===tile.owner) : null; }

// ===================== EFECTOS VISUALES =====================
const effects = []; 
let rafId=null;
function now(){ return performance.now(); }
function addShake(tileId, ms=450){ effects.push({tileId,kind:"shake",started:now(),duration:ms}); }
function addPulse(tileId, color="#ffffff", ms=850){ effects.push({tileId,kind:"pulse",color,started:now(),duration:ms}); }
function cleanupEffects(){ const t=now(); for(let i=effects.length-1;i>=0;i--){ if(t-effects[i].started>effects[i].duration) effects.splice(i,1); } }

// ===================== TABLERO / JUGADORES =====================
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
