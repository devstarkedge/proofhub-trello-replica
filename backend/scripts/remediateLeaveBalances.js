#!/usr/bin/env node
/**
 * Remediate Leave Balances and Ledger History
 *
 * Diagnostic and safe remediation script for:
 * 1. Splitting historical manual debits out of `consumedAmount` into `debitedAmount`
 *    so manual debits no longer inflate an employee's "Used" leave count.
 * 2. Identifying and reconciling duplicate periodic accrual buckets caused by legacy
 *    policy activations for the same period.
 * 3. Migrating index from {workspaceId, user, leaveType, policyVersion, period}
 *    to unique {workspaceId, user, leaveType, period}.
 *
 * Usage:
 *   node backend/scripts/remediateLeaveBalances.js             # Dry-run inspection (default)
 *   node backend/scripts/remediateLeaveBalances.js --dry-run   # Explicit dry-run
 *   node backend/scripts/remediateLeaveBalances.js --apply     # Apply modifications
 *   node backend/scripts/remediateLeaveBalances.js --apply --workspaceId=65...
 */

import mongoose from 'mongoose';
import '../config/index.js';
import config from '../config/index.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import LeaveAccrualBucket from '../modules/leave/leaveAccrualBucket.model.js';
import LeaveLedger from '../modules/leave/leaveLedger.model.js';
import LeavePolicy from '../modules/leave/leavePolicy.model.js';
import LeavePolicyVersion from '../modules/leave/leavePolicyVersion.model.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isDryRun = !isApply || args.includes('--dry-run');

const workspaceArg = args.find((a) => a.startsWith('--workspaceId='));
const filterWorkspaceId = workspaceArg ? workspaceArg.split('=')[1] : null;

async function runRemediation() {
  console.log('='.repeat(70));
  console.log(`FlowTask Leave Balance Remediation Tool`);
  console.log(`Mode: ${isApply ? 'APPLY (changes will be committed)' : 'DRY RUN (no database changes)'}`);
  if (filterWorkspaceId) console.log(`Target Workspace: ${filterWorkspaceId}`);
  console.log('='.repeat(70));

  const mongoUri = config.mongoURI || process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Error: MongoDB URI not found in environment.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.\n');

  try {
    const workspaceFilter = filterWorkspaceId ? { _id: filterWorkspaceId } : {};
    const workspaces = await Workspace.find(workspaceFilter).select('_id name').lean();

    let totalDebitsFixed = 0;
    let totalDuplicatesResolved = 0;
    let totalBucketsChecked = 0;

    for (const ws of workspaces) {
      console.log(`\nScanning Workspace: "${ws.name}" (${ws._id})`);

      await workspaceContext.run({ workspaceId: ws._id }, async () => {
        // -------------------------------------------------------------
        // Step 1: Fix manual debits conflated with consumedAmount
        // -------------------------------------------------------------
        console.log('  1. Checking for manual debits embedded in consumedAmount...');

        // Find all manual debit ledger entries for this workspace
        const debitEntries = await LeaveLedger.find({
          workspaceId: ws._id,
          type: 'MANUAL_DEBIT',
          bucket: { $ne: null }
        }).lean();

        // Group debit amounts by bucket
        const debitsByBucket = {};
        for (const entry of debitEntries) {
          const bId = String(entry.bucket);
          debitsByBucket[bId] = (debitsByBucket[bId] || 0) + entry.amount;
        }

        const bucketIds = Object.keys(debitsByBucket);
        let wsDebitsFixed = 0;

        for (const bId of bucketIds) {
          totalBucketsChecked++;
          const bucket = await LeaveAccrualBucket.findById(bId);
          if (!bucket) continue;

          const totalDebitedFromLedger = debitsByBucket[bId];
          const currentDebitedOnBucket = bucket.debitedAmount || 0;

          // If the bucket's debitedAmount is less than the ledger's manual debits
          // and consumedAmount contains the missing amount, transfer it.
          const discrepancy = Math.round((totalDebitedFromLedger - currentDebitedOnBucket) * 100) / 100;
          if (discrepancy > 0 && bucket.consumedAmount > 0) {
            const transferAmount = Math.min(discrepancy, bucket.consumedAmount);
            console.log(`    Bucket ${bucket._id} (User: ${bucket.user}, LeaveType: ${bucket.leaveType}):`);
            console.log(`      Current: consumed=${bucket.consumedAmount}, debited=${currentDebitedOnBucket}`);
            console.log(`      Ledger total manual debits: ${totalDebitedFromLedger}`);
            console.log(`      Transferring ${transferAmount} from consumedAmount -> debitedAmount`);

            if (isApply) {
              bucket.consumedAmount = Math.max(0, Math.round((bucket.consumedAmount - transferAmount) * 100) / 100);
              bucket.debitedAmount = Math.round((currentDebitedOnBucket + transferAmount) * 100) / 100;
              await bucket.save();
              console.log(`      -> APPLIED: consumed=${bucket.consumedAmount}, debited=${bucket.debitedAmount}`);
            }

            wsDebitsFixed++;
            totalDebitsFixed++;
          }
        }

        console.log(`     Manual debit adjustments identified: ${wsDebitsFixed}`);

        // -------------------------------------------------------------
        // Step 2: Detect duplicate periodic buckets
        // -------------------------------------------------------------
        console.log('  2. Checking for duplicate periodic buckets (same period & leaveType)...');

        const duplicateGroups = await LeaveAccrualBucket.aggregate([
          { $match: { workspaceId: ws._id, period: { $ne: null, $type: 'string' } } },
          {
            $group: {
              _id: { user: '$user', leaveType: '$leaveType', period: '$period' },
              count: { $sum: 1 },
              buckets: { $push: '$$ROOT' }
            }
          },
          { $match: { count: { $gt: 1 } } }
        ]);

        console.log(`     Found ${duplicateGroups.length} duplicate bucket groups.`);

        for (const group of duplicateGroups) {
          const { user, leaveType, period } = group._id;
          console.log(`    Duplicate group for User ${user}, LeaveType ${leaveType}, Period ${period} (${group.count} buckets):`);

          // Sort buckets: active first, then highest creditedAmount, then most recent
          const buckets = group.buckets.sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (b.status === 'active' && a.status !== 'active') return 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          });

          const primaryBucket = buckets[0];
          const duplicateBuckets = buckets.slice(1);

          console.log(`      Primary bucket: ${primaryBucket._id} (credited=${primaryBucket.creditedAmount}, consumed=${primaryBucket.consumedAmount}, status=${primaryBucket.status})`);

          for (const dup of duplicateBuckets) {
            console.log(`      Duplicate bucket to reconcile/void: ${dup._id} (credited=${dup.creditedAmount}, consumed=${dup.consumedAmount}, status=${dup.status})`);

            if (isApply) {
              // If the duplicate had consumed/reserved leaves, merge them into the primary bucket
              if (dup.consumedAmount > 0 || dup.reservedAmount > 0 || (dup.debitedAmount || 0) > 0) {
                await LeaveAccrualBucket.updateOne(
                  { _id: primaryBucket._id },
                  {
                    $inc: {
                      consumedAmount: dup.consumedAmount || 0,
                      reservedAmount: dup.reservedAmount || 0,
                      debitedAmount: dup.debitedAmount || 0
                    }
                  }
                );
                // Repoint ledger entries from dup to primary
                await LeaveLedger.updateMany(
                  { bucket: dup._id },
                  { $set: { bucket: primaryBucket._id } }
                );
              }

              // Void or delete the redundant duplicate bucket
              await LeaveAccrualBucket.deleteOne({ _id: dup._id });
              console.log(`      -> APPLIED: Duplicate ${dup._id} removed and merged into ${primaryBucket._id}`);
            }
            totalDuplicatesResolved++;
          }
        }
      });
    }

    // -------------------------------------------------------------
    // Step 3: Index check & migration
    // -------------------------------------------------------------
    console.log('\n  3. Checking MongoDB indices on LeaveAccrualBucket collection...');
    const collection = LeaveAccrualBucket.collection;
    const indexes = await collection.indexes();
    const legacyIndexName = 'workspaceId_1_user_1_leaveType_1_policyVersion_1_period_1';
    const hasLegacyIndex = indexes.some((idx) => idx.name === legacyIndexName);

    if (hasLegacyIndex) {
      console.log(`     Found legacy index: ${legacyIndexName}`);
      if (isApply) {
        console.log(`     Dropping legacy index ${legacyIndexName}...`);
        await collection.dropIndex(legacyIndexName);
        console.log(`     Creating new unique index on {workspaceId: 1, user: 1, leaveType: 1, period: 1}...`);
        await LeaveAccrualBucket.syncIndexes();
        console.log('     -> APPLIED: Index migration completed.');
      } else {
        console.log(`     [Dry-run] Legacy index would be dropped and replaced with unique {workspaceId, user, leaveType, period}.`);
      }
    } else {
      console.log('     Legacy index not found or already migrated.');
      if (isApply) {
        await LeaveAccrualBucket.syncIndexes();
      }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('REMEDIATION SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total buckets inspected:            ${totalBucketsChecked}`);
    console.log(`Manual debits split from consumed:  ${totalDebitsFixed}`);
    console.log(`Duplicate periodic buckets fixed:   ${totalDuplicatesResolved}`);
    console.log(`Execution Mode:                     ${isApply ? 'APPLIED' : 'DRY RUN'}`);
    if (!isApply) {
      console.log('\nTo apply these fixes, run:');
      console.log('  node backend/scripts/remediateLeaveBalances.js --apply');
    }
    console.log('='.repeat(70) + '\n');
  } catch (error) {
    console.error('Remediation error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runRemediation();
