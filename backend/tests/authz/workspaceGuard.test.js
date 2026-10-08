import { describe, it, expect, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import workspaceScopePlugin from '../../modules/workspaces/workspaceScopePlugin.js';
import { run, runUnscoped } from '../../modules/workspaces/workspaceContext.js';
const a = new mongoose.Types.ObjectId(), b = new mongoose.Types.ObjectId();
const schema = new mongoose.Schema({ workspaceId: mongoose.Schema.Types.ObjectId, name: String }); schema.plugin(workspaceScopePlugin);
const Model = mongoose.model('AuthzWorkspaceGuardFixture',schema);
afterEach(() => vi.restoreAllMocks());
describe('tenant write boundary', () => {
  it('stamps new records and rejects foreign create/insertMany records',async () => {
    const doc=new Model({name:'safe'}); await run({workspaceId:a},() => doc.validate()); expect(String(doc.workspaceId)).toBe(String(a));
    await expect(run({workspaceId:a},() => new Model({ workspaceId:b,name:'foreign' }).validate())).rejects.toThrow('another workspace');
    await expect(run({workspaceId:a},() => Model.insertMany([{workspaceId:b,name:'foreign'}]))).rejects.toThrow('another workspace');
  });
  it.each([{ $set: { workspaceId:b } },{ $unset: { workspaceId:1 } },{ $rename: { name:'workspaceId' } },[{ $set:{name:'pipeline'} }],{ $setOnInsert:{workspaceId:b} }])('rejects an unsafe tenant update before collection access',async update => {
    const write=vi.spyOn(Model.collection,'updateMany').mockResolvedValue({ modifiedCount:1 });
    await expect(run({workspaceId:a},() => Model.updateMany({},update))).rejects.toThrow(); expect(write).not.toHaveBeenCalled();
  });
  it('unscoped creation still requires an explicit workspace',async () => {
    await expect(runUnscoped(() => new Model({name:'missing'}).validate())).rejects.toThrow('no workspaceId');
  });
});
