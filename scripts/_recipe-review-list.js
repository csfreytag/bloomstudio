// READ-ONLY: recipes the team should look at (price calculated, not typed; or odd records).
const admin=require('firebase-admin');const key=require('C:/Keys/claude-llm-access.json');
admin.initializeApp({credential:admin.credential.cert(key),projectId:'freytags-purchasing'});
(async()=>{
  const db=admin.firestore();
  const pl=(await db.collection('settings').doc('recipeGuide').get()).data().priceLists;
  const find=(l,n)=>(pl[l]||[]).find(x=>(x.n||'').trim()===String(n||'').trim());
  const gp=(l,n,m)=>{const f=find(l,n);if(!f)return 0;return(f.r!=null&&f.r>0)?f.r:(f.p||0)*m;};
  const pu=(()=>{const p=(pl.hardgoods||[]).find(h=>/^paint\s+\S/i.test(h.n||''));return(p&&p.r>0)?p.r:2;})();
  const pa=a=>(a&&a.length)?pu:0;
  const comp=r=>gp('containers',r.container||'None',3.5)+gp('accents',r.accent||'None',3.5)+gp('hardgoods',r.hardgood||'None',3.5)
    +((r.container&&r.container!=='None')?pa(r.containerPaint):0)+((r.accent&&r.accent!=='None')?pa(r.accentPaint):0)
    +(r.flowers||[]).reduce((s,f)=>s+f.qty*(gp('flowers',f.name,4)+pa(f.paint)),0)
    +(r.fillers||[]).reduce((s,f)=>s+f.qty*(gp('fillers',f.name,4)+pa(f.paint)),0)
    +(r.plants||[]).reduce((s,f)=>s+f.qty*gp('plants',f.name,3.5),0);
  const snap=await db.collection('recipes').get();const rs=[];snap.forEach(d=>{const r=d.data();r._id=d.id;rs.push(r);});
  const live=rs.filter(r=>!r.archived);
  const cln=s=>String(s||'').replace(/\n/g,' ').trim();
  console.log('--- PRICE IS CALCULATED (no Adjusted retail typed) ---');
  live.filter(r=>!(r.adjPrice>0)).forEach(r=>{const c=comp(r),p=r.laborPct||0;const price=r.calcPrice>0?r.calcPrice:c*(1+p/100);
    console.log(['#'+r._id,'SKU='+JSON.stringify(cln(r.sku)),'Name='+JSON.stringify(cln(r.name)),'status='+r.status,(r.calcPrice>0?'build-to target $'+r.calcPrice:'calculated $'+price.toFixed(2)),'items='+((r.flowers||[]).length+(r.fillers||[]).length+(r.plants||[]).length),'created='+(r.createdAt&&r.createdAt.toDate?r.createdAt.toDate().toISOString().slice(0,10):'?')].join(' | '));});
  console.log('--- ODD RECORDS ---');
  live.filter(r=>!cln(r.name)||/test/i.test(r.name||'')||/test/i.test(r.sku||'')).forEach(r=>console.log(['#'+r._id,'SKU='+JSON.stringify(cln(r.sku)),'Name='+JSON.stringify(cln(r.name)),'status='+r.status].join(' | ')));
  process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1);});
