import { createRequire } from 'module';
const require = createRequire('/Users/erosallonato/Desktop/02_PROGETTI/progetti antigravity/progetti/walbox-kitchen-release/package.json');
const { createClient } = require('@supabase/supabase-js');
import { execSync } from 'child_process';
const URL='http://127.0.0.1:55321';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const mk=()=>createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const sh=(u)=>String(u||'').slice(0,8);
const err=(e)=>e?`ERR{msg="${e.message}" code=${e.code} status=${e.status}}`:'ok';
const psql=(q)=>execSync(`docker exec -i supabase_db_walbox-f0-auth psql -U postgres -At -c "${q.replace(/"/g,'\\"')}"`).toString().trim();
const claims=(t)=>t?JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString()):{};
const log=(...a)=>console.log(...a);
async function who(label,c){
  const {data:{session}}=await c.auth.getSession();
  const {data,error}=await c.auth.getUser();
  const cl=claims(session?.access_token);
  log(`  [${label}] getUser uid=${sh(data?.user?.id)} is_anon(user)=${data?.user?.is_anonymous} is_anon(jwt)=${cl.is_anonymous} phone=${data?.user?.phone||''} ${err(error)}`);
  return data?.user;
}
const orders=async(label,c)=>{const {data,error}=await c.from('kitchen_orders').select('id,total');log(`  [${label}] orders visible=${data?.length} totals=${JSON.stringify(data?.map(o=>o.total))} ${err(error)}`);return data;};
const pushes=async(label,c)=>{const {data,error}=await c.from('kitchen_push_subscriptions').select('endpoint');log(`  [${label}] push visible=${data?.length} ${err(error)}`);return data;};
const P1='393330000001',P2='393330000002',P3='393330000003';
const ins=async(c,uid,total)=>{const {error}=await c.from('kitchen_orders').insert({customer_id:uid,total});if(error)log('  insert order',err(error));};

log('== E1');
const A=mk(); let r=await A.auth.signInAnonymously(); log(' signInAnon',err(r.error));
const uA=await who('A',A); const uidA=uA.id;
await ins(A,uidA,10);await ins(A,uidA,20);
r=await A.from('kitchen_push_subscriptions').insert({customer_id:uidA,endpoint:'https://push/A'}); log(' push insert',err(r.error));
await orders('A',A);await pushes('A',A);
const oldAnonToken=(await A.auth.getSession()).data.session.access_token;
const oldRefresh=(await A.auth.getSession()).data.session.refresh_token;

log('== E2');
r=await A.auth.updateUser({phone:P1}); log(' updateUser phone',err(r.error), 'user.phone=',r.data?.user?.phone,'new_phone=',r.data?.user?.new_phone);
r=await A.auth.verifyOtp({phone:P1,token:'123456',type:'phone_change'}); log(' verifyOtp phone_change',err(r.error));
let u=await who('A after verify (no refresh)',A);
log('  uid unchanged?',u?.id===uidA);
const cl1=claims((await A.auth.getSession()).data.session?.access_token); log('  claim after verify is_anonymous=',cl1.is_anonymous,'phone=',cl1.phone);
await orders('A',A);await pushes('A',A);
// old token
const ot=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${oldAnonToken}`}}});
const g=await ot.auth.getUser(oldAnonToken); log('  OLD anon token getUser: uid',sh(g.data?.user?.id),'is_anonymous=',g.data?.user?.is_anonymous,'phone=',g.data?.user?.phone,err(g.error));
const og=await ot.from('kitchen_orders').select('id'); log('  OLD anon token orders visible=',og.data?.length,err(og.error));
r=await A.auth.refreshSession(); log(' refreshSession',err(r.error));
const cl2=claims((await A.auth.getSession()).data.session?.access_token); log('  claim after refresh is_anonymous=',cl2.is_anonymous,'phone=',cl2.phone);
await who('A after refresh',A);

log('== E3');
const B=mk();
await new Promise(r=>setTimeout(r,5500));
r=await B.auth.signInWithOtp({phone:P1}); log(' signInWithOtp',err(r.error));
r=await B.auth.verifyOtp({phone:P1,token:'123456',type:'sms'}); log(' verifyOtp sms',err(r.error));
const uB=await who('B',B); log('  B uid == A uid?',uB?.id===uidA);
await orders('B',B);await pushes('B',B);
await who('A still',A); await orders('A still',A);
r=await A.auth.refreshSession();log(' A refresh after B login',err(r.error));
r=await B.auth.refreshSession();log(' B refresh',err(r.error));

log('== E4');
const C=mk(); await C.auth.signInAnonymously(); const uC=await who('C',C); await ins(C,uC.id,99);
await orders('C',C);
r=await C.auth.updateUser({phone:P1}); log(' C updateUser(phone existing):',err(r.error),'new_phone=',r.data?.user?.new_phone);
if(!r.error){ const v=await C.auth.verifyOtp({phone:P1,token:'123456',type:'phone_change'}); log(' C verifyOtp phone_change:',err(v.error)); }
await who('C after attempt',C);
r=await C.rpc('create_merge_ticket'); log(' create_merge_ticket',err(r.error),'token len',r.data?.length);
const tk=r.data; const tkC=tk;
await new Promise(r=>setTimeout(r,5500));
r=await C.auth.signInWithOtp({phone:P1}); log(' C signInWithOtp',err(r.error));
r=await C.auth.verifyOtp({phone:P1,token:'123456',type:'sms'}); log(' C verifyOtp sms',err(r.error));
const uC2=await who('C now',C); log('  C uid==A uid?',uC2?.id===uidA);
await orders('C before redeem',C);
r=await C.rpc('redeem_merge_ticket',{p_ticket:tk}); log(' redeem',err(r.error),'moved=',r.data);
await orders('C after redeem',C); await orders('A after redeem',A);
await pushes('C',C);
log('  orphan anon C row:',psql(`select id,is_anonymous from auth.users where id='${uC.id}'`));

log('== E5');
r=await C.rpc('redeem_merge_ticket',{p_ticket:tk}); log(' (a) riuso',err(r.error),'res=',r.data);
// (b) scaduto
const E=mk(); await E.auth.signInAnonymously(); const uE=await who('E',E); await ins(E,uE.id,7);
const tkE=(await E.rpc('create_merge_ticket')).data;
psql(`update public.identity_merge_tickets set expires_at=now()-interval '1 minute' where anon_uid='${uE.id}'`);
r=await C.rpc('redeem_merge_ticket',{p_ticket:tkE}); log(' (b) scaduto',err(r.error),'res=',r.data);
// (c) anonimo
const F=mk(); await F.auth.signInAnonymously(); const uF=await who('F',F);
const tkF=(await F.rpc('create_merge_ticket')).data;
const G=mk(); await G.auth.signInAnonymously();
r=await G.rpc('redeem_merge_ticket',{p_ticket:tkF}); log(' (c) redeem da anonimo',err(r.error),'res=',r.data);
r=await F.rpc('redeem_merge_ticket',{p_ticket:tkF}); log(' (c2) redeem da anonimo stesso owner',err(r.error),'res=',r.data);
// (d) altro utente telefono
const H=mk(); await H.auth.signInWithOtp({phone:P2}); await H.auth.verifyOtp({phone:P2,token:'123456',type:'sms'}); const uH=await who('H(P2)',H);
await ins(F,uF.id,5);
r=await H.rpc('redeem_merge_ticket',{p_ticket:tkF}); log(' (d) altro utente telefono con ticket intercettato',err(r.error),'moved=',r.data);
await orders('H after',H);
// (e) non anonimo crea
r=await H.rpc('create_merge_ticket'); log(' (e) create da non anonimo',err(r.error),'res=',r.data);
// (f) anon role
const N=mk();
r=await N.rpc('create_merge_ticket'); log(' (f) create ruolo anon senza sessione',err(r.error));
r=await N.rpc('redeem_merge_ticket',{p_ticket:'abc'}); log(' (f) redeem ruolo anon senza sessione',err(r.error));
// (g) direct table access
r=await C.from('identity_merge_tickets').select('*'); log(' (g) select diretto tickets da authenticated',err(r.error),'rows=',r.data?.length);
// (h) redeem token random
r=await C.rpc('redeem_merge_ticket',{p_ticket:'deadbeef'}); log(' (h) token inventato',err(r.error));
// (i) utente con telefono non confermato? anon con updateUser pendente
const K=mk(); await K.auth.signInAnonymously(); const tkK=(await K.rpc('create_merge_ticket')).data; await K.auth.updateUser({phone:'393330000005'}); // phone non verificato
r=await K.rpc('redeem_merge_ticket',{p_ticket:tkK}); log(' (i) anon con phone pending prova redeem su proprio ticket',err(r.error));

log('== E6');
const D=mk(); await D.auth.signInAnonymously(); const uD=await who('D',D); await ins(D,uD.id,3);
r=await D.auth.updateUser({phone:P3}); log(' updateUser',err(r.error));
r=await D.auth.verifyOtp({phone:P3,token:'123456',type:'phone_change'}); log(' verifyOtp',err(r.error));
await D.auth.refreshSession(); const uD2=await who('D after',D); log('  uid unchanged?',uD2?.id===uD.id); await orders('D',D);

log('== E7');
const Q=mk(); await Q.auth.signInAnonymously(); const uQ=await who('Q anon',Q); await ins(Q,uQ.id,1);
const P5='393330000004';
r=await Q.auth.signInWithOtp({phone:P5}); log(' signInWithOtp new phone on anon client',err(r.error));
r=await Q.auth.verifyOtp({phone:P5,token:'123456',type:'sms'}); log(' verifyOtp',err(r.error));
const uQ2=await who('Q after',Q); log('  new uid != anon uid?',uQ2?.id!==uQ.id);
await orders('Q after',Q);
log('  anon orphan:',psql(`select id,is_anonymous,phone from auth.users where id='${uQ.id}'`));

log('== E8');
log(psql(`select substr(id::text,1,8)||' anon='||is_anonymous||' phone='||coalesce(phone,'-')||' conf='||coalesce(phone_confirmed_at::text,'-') from auth.users order by created_at`).replace(/\n/g,'\n  '));
log(psql(`select 'orders: '||substr(customer_id::text,1,8)||' total='||total from public.kitchen_orders order by created_at`));
log(psql(`select 'tickets: '||substr(anon_uid::text,1,8)||' redeemed_by='||coalesce(substr(redeemed_by::text,1,8),'-') from public.identity_merge_tickets`));
