// READ-ONLY: snapshot prod catalog + a few varied recipes for a local UI review.
const admin=require('firebase-admin');const key=require('C:/Keys/claude-llm-access.json');
admin.initializeApp({credential:admin.credential.cert(key),projectId:'freytags-purchasing'});
const fs=require('fs');
(async()=>{
  const db=admin.firestore();
  const s=(await db.collection('settings').doc('recipeGuide').get()).data()||{};
  const snap=await db.collection('recipes').get();
  const all=[];snap.forEach(d=>{const r=d.data();r.id=r.id||d.id;all.push(r);});
  const pick=[];const want=[
    r=>(r.flowers||[]).some(f=>f.paint&&f.paint.length),
    r=>(r.plants||[]).length>0,
    r=>r.hardgood&&r.hardgood!=='None',
    r=>r.photo&&r.photo.length<250000,
    r=>(r.flowers||[]).length>=6,
    r=>r.status==='draft'];
  for(const w of want){const r=all.find(x=>w(x)&&!pick.includes(x));if(r)pick.push(r);}
  pick.forEach(r=>{if(r.photo&&r.photo.length>250000)r.photo='';});
  const out={priceLists:s.priceLists,tags:s.tags||[],pricingSync:s.pricingSync||null,recipes:pick,totalRecipes:all.length};
  fs.writeFileSync(process.argv[2],JSON.stringify(out));
  console.log('recipes picked',pick.length,'of',all.length,'| lists',Object.keys(s.priceLists||{}).map(k=>k+':'+s.priceLists[k].length).join(' '));
  pick.forEach(r=>console.log(' -',r.id,r.sku,r.name,'| fl',(r.flowers||[]).length,'pl',(r.plants||[]).length,'hg',r.hardgood,'photo',r.photo?Math.round(r.photo.length/1024)+'KB':'none','status',r.status));
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});
