const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server, {maxHttpBufferSize: 20000});
const rooms = new Map();
const WORDS = ['pizza','rainbow','elephant','rocket','bicycle','banana','castle','guitar','snowman','butterfly','dragon','popcorn','penguin','sunflower','airplane','robot','volcano','ice cream','umbrella','dinosaur','telescope','watermelon','spaceship','octopus','lighthouse','treasure','mermaid','skateboard','pancake','helicopter'];
const ROUNDS = 6;
const TURN_MS = 60000;
function makeCode(){let c;do{c=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(c));return c;}
function cleanName(v){return String(v||'Player').trim().slice(0,18).replace(/[<>]/g,'')||'Player';}
function view(r){return {code:r.code,phase:r.phase,players:r.players.map(p=>({id:p.id,name:p.name,score:p.score})),turn:r.turn,drawerId:r.drawerId,deadline:r.deadline,rounds:ROUNDS,wordLength:r.word?.length||0,used:r.used};}
function emit(r){io.to(r.code).emit('state',view(r));}
function tell(r,msg){io.to(r.code).emit('notice',msg);}
function beginTurn(r){
 if(r.players.length!==2){r.phase='waiting';r.deadline=null;r.drawerId=null;r.word=null;emit(r);return;}
 if(r.turn>=ROUNDS){r.phase='finished';r.deadline=null;r.drawerId=null;r.word=null;emit(r);tell(r,'Game over! Start a rematch to play again.');return;}
 r.phase='drawing';r.drawerId=r.players[r.turn%2].id;r.word=WORDS[Math.floor(Math.random()*WORDS.length)];r.deadline=Date.now()+TURN_MS;r.used=[];
 io.to(r.code).emit('clear');emit(r);
 io.to(r.drawerId).emit('secret',r.word);
 tell(r,`Round ${r.turn+1}: ${r.players[r.turn%2].name} is drawing!`);
}
function finishTurn(r,guessed){
 if(r.phase!=='drawing')return;
 const word=r.word;
 if(guessed){const guesser=r.players.find(p=>p.id!==r.drawerId),drawer=r.players.find(p=>p.id===r.drawerId);const bonus=Math.max(10,Math.ceil((r.deadline-Date.now())/1000));if(guesser)guesser.score+=bonus;if(drawer)drawer.score+=10;tell(r,`${guesser?.name||'Guesser'} got it! The word was ${word}. +${bonus} points!`);}
 else tell(r,`Time's up! The word was ${word}.`);
 r.phase='between';r.word=null;r.deadline=Date.now()+3500;r.turn++;emit(r);
}
io.on('connection',socket=>{
 socket.on('create',(name,cb)=>{
  if(typeof cb!=='function')return;
  if(socket.data.code)return cb({error:'You are already in a room.'});
  const code=makeCode(),r={code,players:[{id:socket.id,name:cleanName(name),score:0}],phase:'waiting',turn:0,drawerId:null,deadline:null,word:null,used:[]};
  rooms.set(code,r);socket.data.code=code;socket.join(code);cb({ok:true,code});emit(r);
 });
 socket.on('join',(data,cb)=>{
  if(typeof cb!=='function')return;
  if(socket.data.code)return cb({error:'You are already in a room.'});
  const code=String(data?.code||'').trim().toUpperCase(),r=rooms.get(code);
  if(!r)return cb({error:'Room not found. Check the code.'});
  if(r.players.length>=2)return cb({error:'This room is full.'});
  r.players.push({id:socket.id,name:cleanName(data?.name),score:0});socket.data.code=code;socket.join(code);cb({ok:true,code});r.turn=0;beginTurn(r);
 });
 socket.on('stroke',data=>{
  const r=rooms.get(socket.data.code);
  if(!r||r.phase!=='drawing'||r.drawerId!==socket.id)return;
  if(!data||!['line','dot'].includes(data.type))return;
  const vals=[data.x,data.y,data.x2,data.y2];if(vals.some(v=>v!==undefined&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)))return;
  const color=typeof data.color==='string'&&/^#[0-9a-fA-F]{6}$/.test(data.color)?data.color:'#111827';
  const size=Math.max(1,Math.min(24,Number(data.size)||4));
  socket.to(r.code).emit('stroke',{type:data.type,x:data.x,y:data.y,x2:data.x2,y2:data.y2,color,size});
 });
 socket.on('clear',()=>{const r=rooms.get(socket.data.code);if(r?.phase==='drawing'&&r.drawerId===socket.id)io.to(r.code).emit('clear');});
 socket.on('guess',raw=>{
  const r=rooms.get(socket.data.code);
  if(!r||r.phase!=='drawing'||r.drawerId===socket.id)return;
  const guess=String(raw||'').trim().slice(0,80);if(!guess)return;
  if(guess.toLowerCase().replace(/\s+/g,' ')===r.word.toLowerCase())finishTurn(r,true);
  else socket.emit('guessResult','Not quite! Try again.');
 });
 socket.on('rematch',()=>{const r=rooms.get(socket.data.code);if(!r||r.players.length!==2||r.phase!=='finished')return;r.players.forEach(p=>p.score=0);r.turn=0;beginTurn(r);});
 socket.on('disconnect',()=>{
  const r=rooms.get(socket.data.code);if(!r)return;
  r.players=r.players.filter(p=>p.id!==socket.id);
  if(!r.players.length){rooms.delete(r.code);return;}
  r.phase='waiting';r.deadline=null;r.drawerId=null;r.word=null;r.turn=0;r.players[0].score=0;
  emit(r);tell(r,'Your friend disconnected. Share the room code to invite someone again.');
 });
});
setInterval(()=>{for(const r of rooms.values()){
 if(r.phase==='drawing'&&Date.now()>=r.deadline)finishTurn(r,false);
 else if(r.phase==='between'&&Date.now()>=r.deadline)beginTurn(r);
}},250);
const PORT=process.env.PORT||3000;
server.listen(PORT,'0.0.0.0',()=>console.log('Doodle Duel listening on '+PORT));
