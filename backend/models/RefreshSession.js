import mongoose from 'mongoose';

// Identity sessions deliberately span workspaces. Only token hashes persist.
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  tokenVersion: { type: Number, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });
export default mongoose.model('RefreshSession', schema);
