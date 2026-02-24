import mongoose from 'mongoose';

const policySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  effect: { type: String, enum: ['ALLOW', 'DENY'], required: true },
  condition: { type: mongoose.Schema.Types.Mixed, required: true }, 
  // Evaluated dynamically. Example json logic:
  // { "==": [{ "var": "user.department" }, { "var": "resource.department" }] }
}, { timestamps: true });

export default mongoose.model('Policy', policySchema);
