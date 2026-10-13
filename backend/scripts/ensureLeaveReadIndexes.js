// Additive only. Never syncIndexes/dropIndexes: unrelated indexes must survive.
import 'dotenv/config';
import mongoose from 'mongoose';
import LeaveRequest from '../modules/leave/leaveRequest.model.js';

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
try {
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  const indexes = LeaveRequest.schema.indexes().filter(([, options]) => ['leave_workspace_created', 'leave_requester_created', 'leave_department_created'].includes(options.name));
  const existing = await LeaveRequest.collection.indexes();
  for (const [keys, options] of indexes) {
    const present = existing.some((index) => JSON.stringify(index.key) === JSON.stringify(keys));
    if (present) { console.log(`${options.name}: already present`); continue; }
    if (!process.argv.includes('--apply')) { console.log(`${options.name}: missing (use --apply to create)`); continue; }
    await LeaveRequest.collection.createIndex(keys, options);
    console.log(`${options.name}: created`);
  }
} finally { await mongoose.disconnect(); }
