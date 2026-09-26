const admin=require('firebase-admin');
const key=require('C:/Keys/claude-llm-access.json');
admin.initializeApp({credential:admin.credential.cert(key),projectId:'freytags-purchasing'});
(async()=>{
  const s=await admin.firestore().collection('settings').doc('recipeGuide').get();
  const pl=(s.data().priceLists)||{};
  for(const cat of ['accents','hardgoods']){
    const hits=(pl[cat]||[]).filter(i=>/paint/i.test(i.n||''));
    console.log(`\n${cat}: ${hits.length} paint item(s)`);
    hits.slice(0,40).forEach(i=>console.log(`  "${i.n}"  r=${i.r}  p=${i.p}`));
  }
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});
