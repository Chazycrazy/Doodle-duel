const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const crypto=require('crypto');
const path=require('path');
const app=express();
app.use(express.static(__dirname));
const server=http.createServer(app);
const io=new Server(server,{maxHttpBufferSize:20000});
const rooms=new Map();
const MAX_PLAYERS=12, TURN_MS=60000;
const WORDS=['pizza','rainbow','elephant','rocket','bicycle','banana','castle','guitar','snowman','butterfly','dragon','popcorn','penguin','sunflower','airplane','robot','volcano','ice cream','umbrella','dinosaur','telescope','watermelon','spaceship','octopus','lighthouse','treasure','mermaid','skateboard','pancake','helicopter'];
function makeCode(){let c;do{c=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(c));return c;}
function cleanName(v){return String(v||'Player').trim().slice(0,18).replace(/[<>]/g,'')||'Player';}
function view(r){return {code:r.code,phase:r.phase,players:r.players.map(p=>({id:p.id,name:p.name,score:p.score})),turn:r.turn,drawerId:r.drawerId,deadline:r.deadline,rounds:r.rounds,wordLength:r.word?.length||0,guessed:[...r.guessed],maxPlayers:MAX_PLAYERS};}
function emit(r){io.to(r.code).emit('state',view(r));}
function tell(r,msg){io.to(r.code).emit('notice',msg);}
function reset(r){r.players.forEach(p=>p.score=0);r.turn=0;r.rounds=r.players.length*2;r.order=r.players.map(p=>p.id);r.guessed=new Set();beginTurn(r);}
function beginTurn(r){
 if(r.players.length<2){r.phase='waiting';r.deadline=null;r.drawerId=null;r.word=null;emit(r);return;}
 if(r.turn>=r.rounds){r.phase='finished';r.deadline=null;r.drawerId=null;r.word=null;emit(r);tell(r,'Game over! Start a rematch to play again.');return;}
 let next=null;
 for(let i=0;i<r.order.length;i++){const id=r.order[r.turn%r.order.length];if(r.players.some(p=>p.id===id)){next=id;break;}r.turn++;}
 if(!next){r.phase='waiting';emit(r);return;}
 r.phase='drawing';r.drawerId=next;r.word=WORDS[Math.floor(Math.random()*WORDS.length)];r.deadline=Date.now()+TURN_MS;r.guessed=new Set();
 io.to(r.code).emit('clear');emit(r);io.to(next).emit('secret',r.word);
 tell(r,`Round ${r.turn+1}: ${r.players.find(p=>p.id===next)?.name||'Player'} is drawing!`);
}
function finishTurn(r){if(r.phase!=='drawing')return;const word=r.word;r.phase='between';r.word=null;r.deadline=Date.now()+3500;r.turn++;emit(r);tell(r,`The word was ${word}. Next round soon!`);}
io.on('connection',socket=>{
 socket.on('create',(name,cb)=>{if(typeof cb!=='function')return;if(socket.data.code)return cb({error:'You are already in a room.'});const code=makeCode(),r={code,players:[{id:socket.id,name:cleanName(name),score:0}],phase:'waiting',turn:0,rounds:0,order:[],drawerId:null,deadline:null,word:null,guessed:new Set()};rooms.set(code,r);socket.data.code=code;socket.join(code);cb({ok:true,code});emit(r);});
 socket.on('join',(data,cb)=>{if(typeof cb!=='function')return;if(socket.data.code)return cb({error:'You are already in a room.'});const code=String(data?.code||'').trim().toUpperCase(),r=rooms.get(code);if(!r)return cb({error:'Room not found. Check the code.'});if(r.players.length>=MAX_PLAYERS)return cb({error:'Room is full (12 players).'});r.players.push({id:socket.id,name:cleanName(data?.name),score:0});socket.data.code=code;socket.join(code);cb({ok:true,code});if(r.phase==='waiting')reset(r);else {emit(r);socket.emit('clear');socket.emit('notice','Joined! You can guess now; you will take drawing turns in the next game.');}});
 socket.on('stroke',data=>{const r=rooms.get(socket.data.code);if(!r||r.phase!=='drawing'||r.drawerId!==socket.id)return;if(!data||!['line','dot'].includes(data.type))return;const vals=[data.x,data.y,data.x2,data.y2];if(vals.some(v=>v!==undefined&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)))return;const color=typeof data.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(data.color)?data.color:'#111827';const size=Math.max(1,Math.min(24,Number(data.size)||4));socket.to(r.code).emit('stroke',{type:data.type,x:data.x,y:data.y,x2:data.x2,y2:data.y2,color,size});});
 socket.on('clear',()=>{const r=rooms.get(socket.data.code);if(r?.phase==='drawing'&&r.drawerId===socket.id)io.to(r.code).emit('clear');});
 socket.on('guess',raw=>{const r=rooms.get(socket.data.code);if(!r||r.phase!=='drawing'||r.drawerId===socket.id||r.guessed.has(socket.id))return;const guess=String(raw||'').trim().slice(0,80);if(!guess)return;if(guess.toLowerCase().replace(/\s+/g,' ')===r.word.toLowerCase()){r.guessed.add(socket.id);const p=r.players.find(p=>p.id===socket.id),drawer=r.players.find(p=>p.id===r.drawerId);const bonus=Math.max(10,Math.ceil((r.deadline-Date.now())/1000));if(p)p.score+=bonus;if(drawer)drawer.score+=10;tell(r,`${p?.name||'Someone'} guessed correctly! +${bonus} points`);emit(r);if(r.players.filter(p=>p.id!==r.drawerId).every(p=>r.guessed.has(p.id)))finishTurn(r);}else socket.emit('guessResult','Not quite! Try again.');});
 socket.on('rematch',()=>{const r=rooms.get(socket.data.code);if(r&&r.players.length>=2&&r.phase==='finished')reset(r);});
 socket.on('disconnect',()=>{const r=rooms.get(socket.data.code);if(!r)return;const wasDrawer=r.drawerId===socket.id;r.players=r.players.filter(p=>p.id!==socket.id);r.guessed.delete(socket.id);if(!r.players.length){rooms.delete(r.code);return;}if(r.players.length<2){r.phase='waiting';r.word=null;r.drawerId=null;r.deadline=null;tell(r,'Waiting for more players.');}else if(wasDrawer&&r.phase==='drawing'){finishTurn(r);}else if(r.phase==='drawing'&&r.players.filter(p=>p.id!==r.drawerId).every(p=>r.guessed.has(p.id))){finishTurn(r);}emit(r);});
});
setInterval(()=>{const now=Date.now();for(const r of rooms.values()){if(r.phase==='drawing'&&now>=r.deadline)finishTurn(r);else if(r.phase==='between'&&now>=r.deadline)beginTurn(r);}},250);
const PORT=process.env.PORT||3000;server.listen(PORT,'0.0.0.0',()=>console.log('Doodle Duel multiplayer listening on '+PORT));
