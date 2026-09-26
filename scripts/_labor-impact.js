// READ-ONLY: how many prod recipes' prices move if labor becomes a share of the final price.
const admin=require('firebase-admin');const key=require('C:/Keys/claude-llm-access.json');
admin.initializeApp({credential:admin.credential.cert(key),projectId:'freytags-purchasing'});
(async()=>{
  const db=admin.firestore();
  const pl=(await db.collection('settings').doc('recipeGuide').get()).data().priceLists;
  const find=(l,n)=>(pl[l]||[]).find(x=>(x.n||'').trim()===String(n||'').trim());
  const gp=(l,n,m)=>{const f=find(l,n);if(!f)return 0;return(f.r!=null&&f.r>0)?f.r:(f.p||0)*m;};
  const paintUnit=(()=>{const p=(pl.hardgoods||[]).find(h=>/^paint\s+\S/i.test(h.n||''));return(p&&p.r>0)?p.r:2;})();
  const pa=a=>(a&&a.length)?paintUnit:0;
  const comp=r=>gp('containers',r.container||'None',3.5)+gp('accents',r.accent||'None',3.5)+gp('hardgoods',r.hardgood||'None',3.5)
    +((r.container&&r.container!=='None')?pa(r.containerPaint):0)+((r.accent&&r.accent!=='None')?pa(r.accentPaint):0)
    +(r.flowers||[]).reduce((s,f)=>s+f.qty*(gp('flowers',f.name,4)+pa(f.paint)),0)
    +(r.fillers||[]).reduce((s,f)=>s+f.qty*(gp('fillers',f.name,4)+pa(f.paint)),0)
    +(r.plants||[]).reduce((s,f)=>s+f.qty*gp('plants',f.name,3.5),0);
  const snap=await db.collection('recipes').get();const rs=[];snap.forEach(d=>rs.push(d.data()));
  const live=rs.filter(r=>!r.archived);
  let adj=0,tgt=0,auto=[],pcts={};
  for(const r of live){const p=r.laborPct||0;pcts[p]=(pcts[p]||0)+1;
    if(r.adjPrice>0)adj++;else if(r.calcPrice>0)tgt++;else{const c=comp(r);auto.push({n:r.name,sku:r.sku,st:r.status,p,c,old:c*(1+p/100),neu:p>0&&p<100?c/(1-p/100):c});}}
  console.log('recipes (not archived):',live.length);
  console.log('  price set by Adjusted retail :',adj,'  (unchanged)');
  console.log('  price set by Build-to target :',tgt,'  (unchanged; its ingredient budget changes)');
  console.log('  price from CALCULATED retail :',auto.length,'  <-- these move');
  console.log('labor % in use:',JSON.stringify(pcts));
  const moved=auto.filter(a=>Math.abs(a.neu-a.old)>0.005);
  const deltas=moved.map(a=>a.neu-a.old);
  if(moved.length){console.log('moving:',moved.length,'| avg +$'+(deltas.reduce((s,x)=>s+x,0)/moved.length).toFixed(2),'| max +$'+Math.max(...deltas).toFixed(2));
    moved.sort((a,b)=>(b.neu-b.old)-(a.neu-a.old)).slice(0,8).forEach(a=>console.log('   ',(a.sku||'').padEnd(10),a.st.padEnd(8),(a.n||'').replace(/\n/g,' ').slice(0,34).padEnd(34),a.p+'%','$'+a.old.toFixed(2),'->','$'+a.neu.toFixed(2)));}
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});
