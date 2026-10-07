const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('deployment SQL validates campaigns and enforces public/manager permissions',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated;
   create function public.current_app_role() returns text language sql as $$select current_setting('app.test_role',true)$$;
   revoke all on function public.current_app_role() from public,anon;
   grant execute on function public.current_app_role() to authenticated;`);
  const sql=fs.readFileSync(require.resolve('../database/seasonal-promotions.sql'),'utf8');
  await db.exec(sql);await db.exec(sql);
  const insert=`insert into public.showroom_promotion_campaigns(name,start_date,end_date,is_enabled,items) values ('Season',current_date-1,current_date+1,true,'[{"code":"A","promo_price":0}]') returning id`;
  await db.exec("set role authenticated;set app.test_role='manager';");
  const row=(await db.query(insert)).rows[0];
  await db.exec(`insert into public.showroom_promotion_campaigns(name,start_date,end_date,is_enabled,items) values ('Future',current_date+5,current_date+10,true,'[{"code":"B"}]'),('Disabled',current_date-1,current_date+1,false,'[{"code":"B"}]'),('Expired',current_date-5,current_date-3,true,'[{"code":"B"}]')`);
  assert.equal((await db.query('select * from public.showroom_promotion_campaigns')).rows.length,4);
  await assert.rejects(()=>db.exec(insert.replace('"promo_price":0','"promo_price":-1')));
  await db.exec('set role anon');
  assert.equal((await db.query('select * from public.showroom_promotion_campaigns')).rows.length,1);
  await assert.rejects(()=>db.exec(insert));
  await assert.rejects(()=>db.exec('update public.showroom_promotion_campaigns set is_enabled=false'));
  await db.exec("set role authenticated;set app.test_role='sales';");
  await assert.rejects(()=>db.exec(insert));
  assert.equal((await db.query('update public.showroom_promotion_campaigns set is_enabled=false returning id')).rows.length,0);
  await db.exec("set app.test_role='manager'");
  assert.equal((await db.query('update public.showroom_promotion_campaigns set is_enabled=false where id=$1 returning id',[row.id])).rows.length,1);
  await db.exec('set role anon');
  assert.equal((await db.query('select * from public.showroom_promotion_campaigns')).rows.length,0);
 }finally{await db.close();}
});
