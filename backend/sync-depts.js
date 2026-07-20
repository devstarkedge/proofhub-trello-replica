import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
import crypto from 'crypto';
import Department from './models/Department.js';
import { buildDepartmentPayload } from './utils/chatWebhookPayloads.js';

dotenv.config();

const CHAT_WEBHOOK_URL = process.env.CHAT_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.FLOWTASK_WEBHOOK_SECRET;

function computeSignature(payload) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB');

    if (!CHAT_WEBHOOK_URL || !WEBHOOK_SECRET) {
      console.log('Webhook dispatcher is not enabled in .env (CHAT_WEBHOOK_URL or FLOWTASK_WEBHOOK_SECRET missing).');
      process.exit(1);
    }

    const departments = await Department.find({ isActive: true });
    console.log(`Found ${departments.length} departments to sync...`);

    for (const dept of departments) {
      console.log(`Dispatching DEPARTMENT_CREATED for ${dept.name}`);
      const payload = buildDepartmentPayload(dept, 'DEPARTMENT_CREATED', null);
      
      const deliveryId = crypto.randomUUID();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const workspaceId = payload.workspaceId || 'flowtask';
      
      const body = JSON.stringify(payload);
      const signaturePayload = `${timestamp}.${body}`;
      const signature = computeSignature(signaturePayload);

      const headers = {
        'Content-Type': 'application/json',
        'X-FlowTask-Signature': signature,
        'X-FlowTask-Timestamp': timestamp,
        'X-FlowTask-Delivery-Id': deliveryId,
        'X-FlowTask-Event': 'DEPARTMENT_CREATED',
        'X-FlowTask-Workspace': workspaceId,
      };

      try {
        const response = await axios.post(CHAT_WEBHOOK_URL, body, {
          headers,
          transformRequest: [(data) => data]
        });
        console.log(`  -> Sent! Status: ${response.status}`);
      } catch (e) {
        console.error(`  -> Failed: ${e.message}`);
        if (e.response) {
            console.error(`     Response:`, e.response.data);
        }
      }
    }

    console.log('Sync complete!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
