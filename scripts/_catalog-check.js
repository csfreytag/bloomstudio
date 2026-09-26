// One-off: does the live catalog contain Liatris / Alstroemeria? Checks both envs.
const admin = require('firebase-admin');
const key = require('C:\\Keys\\claude-llm-access.json');
function fsdb(name, projectId){
  return admin.initializeApp({ credential: admin.credential.cert(key), projectId }, name).firestore();
}
const NEEDLES = [/liatris/i, /alstro/i];
async function check(label, projectId){
  const db = fsdb(label, projectId);
  const snap = await db.collection('settings').doc('recipeGuide').get();
  if(!snap.exists){ console.log(`\n[${label}] settings/recipeGuide MISSING`); return; }
  const pl = (snap.data().priceLists)||{};
  console.log(`\n===== ${label} (${projectId}) =====`);
  for(const [cat, list] of Object.entries(pl)){
    const arr = Array.isArray(list)?list:[];
    for(const re of NEEDLES){
      const hits = arr.filter(it=>it&&it.n&&re.test(it.n)).map(it=>it.n);
      if(hits.length) console.log(`  ${cat}  /${re.source}/  ->`, hits);
    }
  }
  // explicit yes/no
  const flat = Object.values(pl).flat().filter(x=>x&&x.n).map(x=>x.n);
  console.log(`  Liatris present? ${flat.some(n=>/liatris/i.test(n))?'YES':'NO'}`);
  console.log(`  Alstro/Alstroemeria present? ${flat.some(n=>/alstro/i.test(n))?'YES':'NO'}`);
}
(async()=>{
  try{
    await check('prod', 'freytags-purchasing');
    await check('staging', 'freytags-recipes-staging');
  }catch(e){ console.error('ERR', e.message); }
  process.exit(0);
})();
