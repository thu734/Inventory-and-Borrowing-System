import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, finishApp } from '../src/app.ts';
import { PrismaAuthStore } from '../src/modules/auth/auth.store.ts';
import { hashPassword, newToken, tokenHash } from '../src/modules/auth/credentials.ts';
import { mountBorrowingRoutes } from '../src/modules/borrowing/borrowing.routes.ts';
import { PrismaBorrowingStore } from '../src/modules/borrowing/borrowing.store.ts';

if (process.env.SYS01_TEST_DATABASE !== 'true' ||
    !/^\/borrowbase_sys01_f03_/.test(new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/unsafe').pathname)) {
  throw new Error('F-03 tests require an explicitly disposable borrowbase_sys01_f03_* database and guard');
}
const db = new PrismaClient();
const origin = 'http://localhost:5173';
const password = 'synthetic-f03-fixture-password';
const suffix = randomUUID();
const users: string[] = []; const assets: string[] = [];
let modelId: string; let a: string; let b: string; let c: string;
const build = (client = db) => {
  const auth = createApp({ store: new PrismaAuthStore(client), origin,
    csrfSecret: 'f03-test-only-secret-with-at-least-32-bytes', secureCookies: false });
  mountBorrowingRoutes(auth, new PrismaBorrowingStore(client));
  return finishApp(auth.app);
};
let app = build();
async function login(id: string) {
  const agent = request.agent(app);
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  const result = await agent.post('/api/v1/auth/login').set('Origin', origin).send({ email: user.normalizedEmail, password });
  expect(result.status).toBe(200);
  return { agent, csrf: result.body.data.csrfToken as string };
}
async function asset(serviceability: 'SERVICEABLE' | 'MAINTENANCE' | 'RETIRED' = 'SERVICEABLE') {
  const row = await db.asset.create({ data: { equipmentModelId: modelId, assetCode: `F03-${randomUUID()}`, serviceability } });
  assets.push(row.id); return row;
}
async function pending(borrowerId: string, assetId: string) {
  return db.borrowRequest.create({ data: { borrowerId, assetId } });
}
async function loan(borrowerId: string, returned = false) {
  const unit = await asset(); const req = await pending(borrowerId, unit.id);
  const time = new Date('2026-11-01T00:00:00Z');
  await db.borrowRequest.update({ where: { id: req.id }, data: { status: 'FULFILLED', fulfilledAt: time } });
  return db.loan.create({ data: { borrowRequestId: req.id, borrowerId, assetId: unit.id, checkedOutById: c,
    checkedOutAt: time, ...(returned ? { returnedAt: new Date('2026-11-02'), returnedById: c } : {}) } });
}
async function post(id: string, body: unknown) {
  const { agent, csrf } = await login(id);
  return agent.post('/api/v1/borrow-requests').set('Origin', origin).set('X-CSRF-Token', csrf).send(body as object);
}

beforeAll(async () => {
  const hash = await hashPassword(password);
  for (const [name, role] of [['a','BORROWER'], ['b','BORROWER'], ['c','CUSTODIAN']] as const) {
    const u = await db.user.create({ data: { normalizedEmail: `${name}-${suffix}@example.test`, displayName: name, role, passwordHash: hash } });
    users.push(u.id);
  }
  [a,b,c] = users as [string,string,string];
  modelId = (await db.equipmentModel.create({ data: { name: suffix, category: 'F03 Test' } })).id;
});
afterAll(async () => {
  await db.loan.deleteMany({ where: { assetId: { in: assets } } });
  await db.borrowRequest.deleteMany({ where: { assetId: { in: assets } } });
  await db.asset.deleteMany({ where: { id: { in: assets } } });
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  if (modelId) await db.equipmentModel.delete({ where: { id: modelId } });
  await db.$disconnect();
});

describe('F-03 real PostgreSQL API contract', () => {
  it('PG-01 creates persisted PENDING with server owner, without reservation/Loan writes', async () => {
    const unit = await asset(); const before = await db.asset.findUnique({ where: { id: unit.id } });
    const result = await post(a, { assetId: unit.id });
    expect(result.status).toBe(201);
    expect(result.headers.location).toBe(`/api/v1/me/borrow-requests/${result.body.data.id}`);
    expect(result.body.data).toMatchObject({ status: 'PENDING', asset: { id: unit.id, assetCode: unit.assetCode } });
    const row = await db.borrowRequest.findUniqueOrThrow({ where: { id: result.body.data.id } });
    expect(row).toMatchObject({ borrowerId: a, assetId: unit.id, status: 'PENDING', fulfilledAt: null });
    expect(await db.asset.findUnique({ where: { id: unit.id } })).toEqual(before);
    expect(await db.loan.count({ where: { assetId: unit.id } })).toBe(0);
    expect(JSON.stringify(result.body)).not.toMatch(/password|tokenHash|normalizedEmail|borrowerId/);
  });
  it.each(['MAINTENANCE','RETIRED'] as const)('PG-02 rejects %s without saving', async state => {
    const unit = await asset(state); const result = await post(a, { assetId: unit.id });
    expect(result.status).toBe(409); expect(result.body.error.code).toBe('ASSET_UNAVAILABLE');
    expect(await db.borrowRequest.count({ where: { assetId: unit.id } })).toBe(0);
  });
  it('PG-02 rejects active-loaned Asset, but accepts one with only returned Loan', async () => {
    const active = await loan(b); expect((await post(a, { assetId: active.assetId })).status).toBe(409);
    const returned = await loan(b, true); expect((await post(a, { assetId: returned.assetId })).status).toBe(201);
  });
  it('PG-02 nonexistent Asset is 404', async () => { expect((await post(a, { assetId: randomUUID() })).status).toBe(404); });
  it.each([{}, {assetId:'bad'}, {assetId:null}, [], {assetId:randomUUID(),borrowerId:'forged'}, {assetId:randomUUID(),role:'CUSTODIAN'}])('invalid body %j', async body => {
    expect((await post(a, body)).status).toBe(400);
  });
  it('PG-06 duplicate pending is 409, another Borrower can still request', async () => {
    const unit = await asset(); expect((await post(a, {assetId:unit.id})).status).toBe(201);
    const duplicate = await post(a, {assetId:unit.id}); expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DUPLICATE_PENDING_REQUEST');
    expect((await post(b, {assetId:unit.id})).status).toBe(201);
    expect(await db.borrowRequest.count({where:{assetId:unit.id}})).toBe(2);
  });
  it('PG-06 concurrent API duplicates produce exactly one pending row', async () => {
    const unit=await asset(); const auth=await login(a);
    const send=()=>auth.agent.post('/api/v1/borrow-requests').set('Origin',origin).set('X-CSRF-Token',auth.csrf).send({assetId:unit.id});
    const results=await Promise.all([send(),send()]); expect(results.map(x=>x.status).sort()).toEqual([201,409]);
    expect(await db.borrowRequest.count({where:{assetId:unit.id,borrowerId:a,status:'PENDING'}})).toBe(1);
  });
  it('PG-06 PostgreSQL independently prevents pending duplicates, permits a later request after fulfillment', async () => {
    const unit=await asset(); const req=await pending(a,unit.id);
    await expect(pending(a,unit.id)).rejects.toMatchObject({code:'P2002'});
    await db.borrowRequest.update({where:{id:req.id},data:{status:'FULFILLED',fulfilledAt:new Date()}});
    await expect(pending(a,unit.id)).resolves.toMatchObject({status:'PENDING'});
  });
  it('PG-03/04 owner-scoped request lists/details hide foreign records and query forgery', async () => {
    const own=await pending(a,(await asset()).id), foreign=await pending(b,(await asset()).id);
    const {agent}=await login(a); const list=await agent.get('/api/v1/me/borrow-requests');
    expect(list.status).toBe(200); expect(list.body.data.items.some((x:{id:string})=>x.id===own.id)).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain(foreign.id);
    expect((await agent.get(`/api/v1/me/borrow-requests/${own.id}`)).status).toBe(200);
    const denied=await agent.get(`/api/v1/me/borrow-requests/${foreign.id}`), missing=await agent.get(`/api/v1/me/borrow-requests/${randomUUID()}`);
    expect(denied.status).toBe(404); expect(denied.body.error.code).toBe(missing.body.error.code);
    expect((await agent.get('/api/v1/me/borrow-requests?borrowerId=forged')).status).toBe(400);
  });
  it('PG-03/04 lists and retrieves only own active Loans; returned and foreign are 404', async () => {
    const own=await loan(a), foreign=await loan(b), returned=await loan(a,true);
    const {agent}=await login(a); const list=await agent.get('/api/v1/me/loans');
    expect(list.status).toBe(200); expect(list.body.data.items.map((x:{id:string})=>x.id)).toContain(own.id);
    for(const id of [foreign.id,returned.id]) {expect(JSON.stringify(list.body)).not.toContain(id);expect((await agent.get(`/api/v1/me/loans/${id}`)).status).toBe(404);}
    const detail=await agent.get(`/api/v1/me/loans/${own.id}`);expect(detail.status).toBe(200);expect(detail.body.data.checkedOutAt).toBe(own.checkedOutAt.toISOString());
  });
  it('PG-05 identity and saved requests survive new client/app instances', async () => {
    const result=await post(a,{assetId:(await asset()).id}); expect(result.status).toBe(201);
    const fresh=new PrismaClient(); const old=app;
    try {app=build(fresh);const {agent}=await login(a);expect((await agent.get(`/api/v1/me/borrow-requests/${result.body.data.id}`)).body.data).toEqual(result.body.data);}
    finally {app=old;await fresh.$disconnect();}
  });
  const paths=['/api/v1/me/borrow-requests',`/api/v1/me/borrow-requests/${randomUUID()}`,'/api/v1/me/loans',`/api/v1/me/loans/${randomUUID()}`];
  it.each(paths)('PG-04 anonymous and Custodian cannot read %s', async path => {
    expect((await request(app).get(path)).status).toBe(401);
    expect((await (await login(c)).agent.get(path)).status).toBe(403);
  });
  it('PG-04 POST rejects anonymous, Custodian, inactive account, wrong/missing Origin/CSRF', async () => {
    const unit=await asset();expect((await request(app).post('/api/v1/borrow-requests').send({assetId:unit.id})).status).toBe(401);
    expect((await post(c,{assetId:unit.id})).status).toBe(403);
    const auth=await login(a);
    for(const [site,csrf] of [[origin,'wrong'],['https://foreign.test',auth.csrf],['',auth.csrf],[origin,'']]){
      expect((await auth.agent.post('/api/v1/borrow-requests').set('Origin',site!).set('X-CSRF-Token',csrf!).send({assetId:unit.id})).status).toBe(403);
    }
    await db.user.update({where:{id:a},data:{isActive:false}});
    try {expect((await auth.agent.get('/api/v1/me/loans')).status).toBe(401);}finally{await db.user.update({where:{id:a},data:{isActive:true}});}
    expect(await db.borrowRequest.count({where:{assetId:unit.id}})).toBe(0);
  });
  it('malformed JSON, content type, oversized body and invalid detail ID are safe', async()=>{
    const {agent,csrf}=await login(a);const call=()=>agent.post('/api/v1/borrow-requests').set('Origin',origin).set('X-CSRF-Token',csrf);
    expect((await call().set('Content-Type','application/json').send('{')).status).toBe(400);
    expect((await call().send('text')).status).toBe(415);
    expect((await call().send({assetId:'x'.repeat(17000)})).status).toBe(413);
    expect((await agent.get('/api/v1/me/loans/not-a-uuid')).status).toBe(400);
  });
  it('PG-07 rollback after insert leaves no request and returns safe error',async()=>{
    const unit=await asset();
    const failing=db.$extends({query:{borrowRequest:{async create({args,query}){
      await query(args);throw new Error('private SQL password=never-expose');
    }}}});
    const old=app;
    try{
      app=build(failing as unknown as PrismaClient);
      const response=await post(a,{assetId:unit.id});expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');expect(JSON.stringify(response.body)).not.toMatch(/SQL|password|never-expose/);
      expect(await db.borrowRequest.count({where:{assetId:unit.id}})).toBe(0);
    }finally{app=old;}
  });
  it('PG-07 request waits for Asset lock and rechecks committed eligibility',async()=>{
    const unit=await asset();const auth=await login(a);
    let locked!:()=>void;const ready=new Promise<void>(r=>{locked=r;});let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
    const writer=db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "Asset" WHERE "id"=${unit.id} FOR UPDATE`;
      await tx.asset.update({where:{id:unit.id},data:{serviceability:'MAINTENANCE'}});locked();await gate;
    });
    await ready;
    const result=auth.agent.post('/api/v1/borrow-requests').set('Origin',origin).set('X-CSRF-Token',auth.csrf).send({assetId:unit.id}).then(r=>r);
    release();await writer;expect((await result).status).toBe(409);
    expect(await db.borrowRequest.count({where:{assetId:unit.id}})).toBe(0);
  });
  it('PG-06 independent simultaneous DB writers cannot bypass pending uniqueness',async()=>{
    const unit=await asset();const other=new PrismaClient();
    try{
      const results=await Promise.allSettled([pending(a,unit.id),other.borrowRequest.create({data:{borrowerId:a,assetId:unit.id}})]);
      expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
      expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
      expect(await db.borrowRequest.count({where:{assetId:unit.id,status:'PENDING'}})).toBe(1);
    }finally{await other.$disconnect();}
  });
  it('PG-03 fresh Borrower has empty lists and deterministic request ordering',async()=>{
    const fresh=await db.user.create({data:{normalizedEmail:`empty-${suffix}@example.test`,displayName:'Empty',role:'BORROWER',passwordHash:await hashPassword(password)}});users.push(fresh.id);
    const {agent}=await login(fresh.id);
    for(const path of ['/api/v1/me/loans','/api/v1/me/borrow-requests']){
      const response=await agent.get(path);expect(response.status).toBe(200);expect(response.body.data).toEqual({items:[]});
    }
    const time=new Date('2026-11-03');const one=await pending(fresh.id,(await asset()).id),two=await pending(fresh.id,(await asset()).id);
    await db.borrowRequest.updateMany({where:{id:{in:[one.id,two.id]}},data:{createdAt:time}});
    const response=await agent.get('/api/v1/me/borrow-requests');expect(response.body.data.items.map((x:{id:string})=>x.id)).toEqual([one.id,two.id].sort().reverse());
  });
  it.each(['malformed','expired','revoked','inactive'] as const)('PG-04 all feature routes reject %s sessions',async state=>{
    const token=newToken();let cookie='cpe_session=malformed';
    if(state!=='malformed'){
      const now=new Date();await db.session.create({data:{tokenHash:tokenHash(token),userId:a,createdAt:new Date(now.getTime()-60000),expiresAt:state==='expired'?now:new Date(now.getTime()+60000),revokedAt:state==='revoked'?now:null}});
      cookie=`cpe_session=${token}`;
    }
    if(state==='inactive')await db.user.update({where:{id:a},data:{isActive:false}});
    try{
      for(const path of paths)expect((await request(app).get(path).set('Cookie',cookie)).status).toBe(401);
      expect((await request(app).post('/api/v1/borrow-requests').set('Cookie',cookie).set('Origin',origin).send({assetId:randomUUID()})).status).toBe(401);
    }finally{if(state==='inactive')await db.user.update({where:{id:a},data:{isActive:true}});}
  });
});
