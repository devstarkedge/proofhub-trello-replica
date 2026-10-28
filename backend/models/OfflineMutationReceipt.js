import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: String, fingerprint: { type: String, required: true },
  state: { type: String, enum: ['pending', 'completed', 'rejected'], required: true },
  status: Number,
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });
export default mongoose.model('OfflineMutationReceipt', schema);
