import express from 'express';
import asyncHandler from '../../middleware/asyncHandler.js';
import { generatedReportOptions,createGeneratedReport,listGeneratedReports,viewGeneratedReport,downloadGeneratedReport,deleteGeneratedReport,retryGeneratedReportEmail } from './tracking.generatedReports.js';
const router=express.Router();
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
router.get('/options',asyncHandler(async(req,res)=>res.json({success:true,data:await generatedReportOptions(req.workspaceId,req.user.id,req.query)})));
router.get('/',asyncHandler(async(req,res)=>res.json({success:true,data:await listGeneratedReports(req.workspaceId,req.user.id)})));
router.post('/',asyncHandler(async(req,res)=>res.status(202).json({success:true,data:await createGeneratedReport(req.workspaceId,req.user.id,req.body||{})})));
router.get('/:id/download',asyncHandler(async(req,res)=>{
  const file=await downloadGeneratedReport(req.workspaceId,req.user.id,req.params.id);
  res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${file.filename}"`,'X-Content-Type-Options':'nosniff'}).send(file.content);
}));
router.get('/:id',asyncHandler(async(req,res)=>res.json({success:true,data:await viewGeneratedReport(req.workspaceId,req.user.id,req.params.id,req.query.page||1)})));
router.post('/:id/email',asyncHandler(async(req,res)=>res.status(202).json({success:true,data:await retryGeneratedReportEmail(req.workspaceId,req.user.id,req.params.id,req.body||{})})));
router.delete('/:id',asyncHandler(async(req,res)=>{await deleteGeneratedReport(req.workspaceId,req.user.id,req.params.id);res.json({success:true});}));
export default router;
