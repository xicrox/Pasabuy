// Pasabuy API for Vercel. Data lives in Upstash Redis (one JSON document).
const crypto=require('crypto');
const RU=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL,RT=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
const rc=async c=>{const r=await fetch(RU,{method:'POST',headers:{Authorization:'Bearer '+RT},body:JSON.stringify(c)});const j=await r.json();if(j.error)throw new Error(j.error);return j.result};
const rnd=n=>crypto.randomBytes(n).toString('hex'),hash=(p,s)=>crypto.scryptSync(p,s,32).toString('hex');
const mk=(name,sid,pw,role,status)=>{const salt=rnd(8);return{id:'u'+rnd(5),name,sid,salt,pw:hash(pw,salt),role,status}};
let D;const store=()=>rc(['SET','pasabuy',JSON.stringify(D)]);
async function load(){const v=await rc(['GET','pasabuy']);D=v?JSON.parse(v):null;if(!D){D={users:[mk('Campus Admin','admin',process.env.ADMIN_PASSWORD||'admin1234','admin','verified')],reqs:[],msgs:[],notifs:[],reports:[],reviews:[],sess:{}};await store()}}
const E=(m,c=400)=>{throw{m,c}},str=(s,n)=>String(s==null?'':s).trim().slice(0,n);
const N=(to,text)=>D.notifs.push({to,text,t:Date.now(),read:0}),U=id=>D.users.find(u=>u.id==id);
const R=id=>D.reqs.find(r=>r.id==id)||E('Request not found.',404);
const ST=['open','accepted','buying','onway','delivered'],LB=['','Runner accepted','Buying your items','On the way','Delivered'];
const part=(r,u)=>{if(r.by!=u.id&&r.runner!=u.id)E('This is not your order.',403);return r.by==u.id?r.runner:r.by};
const admins=f=>D.users.filter(x=>x.role=='admin').forEach(f),open=r=>r.status=='open'&&r.due>Date.now();
const A={
read(u){D.notifs.forEach(n=>{if(n.to==u.id)n.read=1})},
post(u,o){o=o||{};const t=str(o.title,80),s=str(o.store,60),fee=+o.fee;if(!t||!s)E('Add what you need and where to buy it.');if(!(fee>=10&&fee<=1000))E('Runner fee must be between ₱10 and ₱1000.');const m=[15,30,60,120].includes(+o.mins)?+o.mins:30;
 D.reqs.push({id:Date.now()*10+Math.floor(Math.random()*10),by:u.id,title:t,store:s,note:str(o.note,200),drop:str(o.drop,40),budget:Math.min(5000,Math.max(0,+o.budget||0)),fee,due:Date.now()+m*6e4,status:'open',runner:null,dec:[],t:Date.now()});
 D.users.filter(x=>x.status=='verified'&&x.role!='admin'&&x.id!=u.id).forEach(x=>N(x.id,'New errand: '+t+' (₱'+fee+' fee)'))},
acc(u,id){const r=R(id);if(r.by==u.id)E("You can't run your own errand.");if(!open(r))E('This request is no longer open.');r.status='accepted';r.runner=u.id;N(r.by,u.name+' accepted "'+r.title+'".')},
dec(u,id){const r=R(id);if(open(r)&&!r.dec.includes(u.id))r.dec.push(u.id)},
adv(u,id){const r=R(id),i=ST.indexOf(r.status);if(r.runner!=u.id||i<1||i>3)E("You can't update this order.",403);r.status=ST[i+1];N(r.by,'"'+r.title+'": '+LB[i+1]+'.')},
back(u,id){const r=R(id);if(r.runner!=u.id||r.status!='accepted')E('You can only back out before buying.');r.dec.push(u.id);r.status='open';r.runner=null;N(r.by,'Your runner backed out. "'+r.title+'" is open again.')},
cancel(u,id){const r=R(id);if(r.by!=u.id||r.status!='open')E('Only open requests can be cancelled.');r.status='cancelled'},
send(u,id,text){const r=R(id),o=part(r,u),v=str(text,500);if(!o||!v)E('Nothing to send yet.');D.msgs.push({rid:r.id,from:u.id,text:v,t:Date.now()});N(o,u.name+': '+v.slice(0,40))},
rate(u,id,s,text){const r=R(id),o=part(r,u),n=Math.round(+s);if(r.status!='delivered'||!o)E('You can rate after delivery.');if(!(n>=1&&n<=5))E('Pick 1 to 5 stars.');if(D.reviews.some(v=>v.rid==r.id&&v.from==u.id))E('You already reviewed this order.');D.reviews.push({rid:r.id,from:u.id,to:o,stars:n,text:str(text,200)});N(o,u.name+' rated you '+n+' stars.')},
report(u,id,why,note){const r=R(id),o=part(r,u);if(!o)E('There is no one to report yet.');D.reports.push({id:Date.now(),by:u.id,against:o,rid:r.id,why:str(why,60),note:str(note,300),open:1});admins(a=>N(a.id,'New report about '+U(o).name+'.'))},
setU(u,id,s){if(!['verified','suspended','banned','rejected'].includes(s))E('Bad status.');const x=U(id)||E('User not found.',404);if(x.role=='admin')E('You cannot change an admin.');x.status=s;N(x.id,s=='verified'?'You are verified. You can post and run errands.':'Your account is now '+s+'.')},
res(u,id,a){const p=D.reports.find(x=>x.id==id&&x.open)||E('Report not found.',404);if(a&&!['suspended','banned'].includes(a))E('Bad action.');const x=U(p.against);if(a&&x.role=='admin')E('You cannot change an admin.');p.open=0;if(a){x.status=a;N(x.id,'Your account is now '+a+'.')}N(p.by,a?'Your report was reviewed. The user is now '+a+'.':'Your report was reviewed. No action was taken.')}
};
const state=u=>{const ad=u.role=='admin',mine=r=>r.by==u.id||r.runner==u.id,ids=new Set(D.reqs.filter(mine).map(r=>r.id));
return{me:u.id,users:D.users.map(x=>({id:x.id,name:x.name,role:x.role,status:x.status,sid:ad||x.id==u.id?x.sid:undefined})),reqs:D.reqs.filter(r=>ad||mine(r)||open(r)),msgs:D.msgs.filter(m=>ids.has(m.rid)),notifs:D.notifs.filter(n=>n.to==u.id).slice(-100).reverse(),reports:ad?D.reports:[],reviews:D.reviews}};
const send=(res,c,o)=>{res.setHeader('Cache-Control','no-store');res.status(c).json(o)};
module.exports=async(req,res)=>{try{
if(!RU||!RT)E('Database is not connected. Add Upstash Redis under Storage in Vercel, then redeploy.',500);
await load();const p=String((req.query||{}).p||''),b=req.body&&typeof req.body=='object'?req.body:{},tok=(req.headers.authorization||'').slice(7);
if(p=='login'||p=='signup'){let u;
 if(p=='login'){u=D.users.find(x=>x.sid==str(b.sid,30));if(!u||!crypto.timingSafeEqual(Buffer.from(hash(String(b.pw||''),u.salt)),Buffer.from(u.pw)))E('Student ID or password is wrong.',403)}
 else{const n=str(b.name,60),s=str(b.sid,30),pw=String(b.pw||'');if(!n||!s||pw.length<4)E('Fill in every field. Password needs 4+ characters.');if(D.users.some(x=>x.sid==s))E('That student ID already has an account.');u=mk(n,s,pw,'student','pending');D.users.push(u);admins(a=>N(a.id,n+' signed up and needs verification.'))}
 const t=rnd(24);D.sess[t]=u.id;await store();return send(res,200,{token:t})}
const u=U(D.sess[tok]);if(!u)return send(res,401,{error:'Please log in again.'});
if(p=='logout'){delete D.sess[tok];await store();return send(res,200,{})}
if(p=='state')return send(res,200,state(u));
if(p=='act'){const n=String(b.n),ad=u.role=='admin';if(!Object.hasOwn(A,n))E('Unknown action.');
 if(ad?!['setU','res','read'].includes(n):['setU','res'].includes(n))E('Not allowed for your account.',403);
 if(!ad&&u.status!='verified'&&n!='read')E('Your account is not verified yet.',403);
 A[n](u,...(Array.isArray(b.a)?b.a:[]));await store();return send(res,200,{ok:1})}
send(res,404,{error:'Not found.'})}catch(e){send(res,e.c||500,{error:e.m||'Server error.'});if(!e.c)console.error(e)}};
