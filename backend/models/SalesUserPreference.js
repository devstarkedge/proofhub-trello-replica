import mongoose from 'mongoose';

const salesUserPreferenceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  // Last-used values per dropdown field
  lastUsed: {
    platform: { type: String, default: '' },
    technology: { type: String, default: '' },
    profile: { type: String, default: '' },
    status: { type: String, default: '' },
    clientLocation: { type: String, default: '' },
    clientBudget: { type: String, default: '' },
    replyFromClient: { type: String, default: '' },
    followUps: { type: String, default: '' },
  },

  // Frequency counters per field per value — e.g. { platform: { "Upwork": 12, "Freelancer": 3 } }
  fieldFrequency: {
    type: Map,
    of: {
      type: Map,
      of: Number
    },
    default: new Map()
  },

  // Co-occurrence matrix — tracks which values appear together
  // e.g. { "platform:Upwork": { "technology:React": 8, "profile:Web Dev": 5 } }
  coOccurrence: {
    type: Map,
    of: {
      type: Map,
      of: Number
    },
    default: new Map()
  }
}, {
  timestamps: true
});

/**
 * Record field selections from a saved row.
 * Updates lastUsed, fieldFrequency, and coOccurrence atomically.
 *
 * @param {string} userId
 * @param {Object} fieldValues — e.g. { platform: 'Upwork', technology: 'React', ... }
 */
salesUserPreferenceSchema.statics.recordSelection = async function (userId, fieldValues) {
  const trackableFields = [
    'platform', 'technology', 'profile', 'status',
    'clientLocation', 'clientBudget', 'replyFromClient', 'followUps'
  ];

  // Filter to only non-empty trackable fields
  const entries = trackableFields
    .filter(f => fieldValues[f] && String(fieldValues[f]).trim())
    .map(f => [f, String(fieldValues[f]).trim()]);

  if (entries.length === 0) return;

  const update = {};
  const inc = {};

  // Update lastUsed
  for (const [field, value] of entries) {
    update[`lastUsed.${field}`] = value;
  }

  // Increment frequency counters
  for (const [field, value] of entries) {
    inc[`fieldFrequency.${field}.${value}`] = 1;
  }

  // Build co-occurrence increments for every pair
  for (let i = 0; i < entries.length; i++) {
    const keyA = `${entries[i][0]}:${entries[i][1]}`;
    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      const keyB = `${entries[j][0]}:${entries[j][1]}`;
      inc[`coOccurrence.${keyA}.${keyB}`] = 1;
    }
  }

  await this.findOneAndUpdate(
    { user: userId },
    { $set: update, $inc: inc },
    { upsert: true, returnDocument: 'after' }
  );
};

/**
 * Get suggestions for a specific field based on current form context.
 *
 * @param {string} userId
 * @param {string} targetField — the field to suggest values for
 * @param {Object} context — current form values (other fields)
 * @returns {string[]} — ordered list of suggested values (most relevant first)
 */
salesUserPreferenceSchema.statics.getSuggestions = async function (userId, targetField, context = {}) {
  const pref = await this.findOne({ user: userId }).lean();
  if (!pref) return [];

  const scores = new Map(); // value → score

  // 1. Frequency score (base)
  const freqMap = pref.fieldFrequency?.[targetField];
  if (freqMap) {
    for (const [val, count] of Object.entries(freqMap)) {
      scores.set(val, (scores.get(val) || 0) + count);
    }
  }

  // 2. Co-occurrence boost — for each filled context field, boost values that commonly co-occur
  const trackableFields = [
    'platform', 'technology', 'profile', 'status',
    'clientLocation', 'clientBudget', 'replyFromClient', 'followUps'
  ];

  for (const field of trackableFields) {
    if (field === targetField) continue;
    const ctxVal = context[field];
    if (!ctxVal || !String(ctxVal).trim()) continue;

    const coKey = `${field}:${String(ctxVal).trim()}`;
    const coMap = pref.coOccurrence?.[coKey];
    if (!coMap) continue;

    // Look for entries matching the target field
    const prefix = `${targetField}:`;
    for (const [key, count] of Object.entries(coMap)) {
      if (key.startsWith(prefix)) {
        const val = key.slice(prefix.length);
        scores.set(val, (scores.get(val) || 0) + count * 2); // 2x weight for co-occurrence
      }
    }
  }

  // 3. Recency boost — lastUsed gets a small bonus
  const lastVal = pref.lastUsed?.[targetField];
  if (lastVal) {
    scores.set(lastVal, (scores.get(lastVal) || 0) + 3);
  }

  // Sort by score descending, return top 5
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([val]) => val);
};

export default mongoose.model('SalesUserPreference', salesUserPreferenceSchema);
