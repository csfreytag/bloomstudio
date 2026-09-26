const admin=require('firebase-admin');const key=require('C:/Keys/claude-llm-access.json');
admin.initializeApp({credential:admin.credential.cert(key),projectId:'freytags-purchasing'});
(async()=>{
  const snap=await admin.firestore().collection('recipes').get();
  const all=[];snap.forEach(d=>{const r=d.data();r._doc=d.id;all.push(r);});
  const q=all.filter(r=>/"/.test(r.name||'')||/"/.test(r.sku||''));
  const sus=all.filter(r=>/^\s*\d+(\.\d+)?\s*$/.test(r.name||'')||(r.name||'').trim()==='');
  console.log('total recipes:',all.length);
  console.log('names/SKUs containing a double-quote (at risk):',q.length);
  q.slice(0,8).forEach(r=>console.log('   e.g.',JSON.stringify(r.name),'| sku',r.sku));
  console.log('names that are blank or just a number (possible past truncation):',sus.length);
  sus.slice(0,15).forEach(r=>console.log('   ',r._doc,'| name',JSON.stringify(r.name),'| sku',JSON.stringify(r.sku),'| status',r.status,'| items',(r.flowers||[]).length+(r.fillers||[]).length+(r.plants||[]).length,'| updated',r.updatedAt&&r.updatedAt.toDate?r.updatedAt.toDate().toISOString().slice(0,10):r.updatedAt));
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});
