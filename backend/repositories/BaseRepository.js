/**
 * Base Repository
 * 
 * Provides common CRUD operations for all Mongoose models.
 * All queries use .lean() by default for performance (returns plain JS objects).
 * 
 * Extend this class for entity-specific repositories:
 *   class CardRepository extends BaseRepository { ... }
 */

class BaseRepository {
  /**
   * @param {import('mongoose').Model} model - Mongoose model
   */
  constructor(model) {
    this.model = model;
  }

  /**
   * Find a single document by ID.
   * @param {string} id
   * @param {Object} [options]
   * @param {string|Object} [options.select] - Field projection
   * @param {Array<{path: string, select?: string}>} [options.populate] - Population config
   * @param {boolean} [options.lean=true] - Return plain JS object
   */
  async findById(id, options = {}) {
    const { select, populate, lean = true } = options;
    let query = this.model.findById(id);
    if (select) query = query.select(select);
    if (populate) {
      for (const pop of Array.isArray(populate) ? populate : [populate]) {
        query = query.populate(pop);
      }
    }
    if (lean) query = query.lean();
    return query;
  }

  /**
   * Find multiple documents matching a filter.
   * @param {Object} filter - MongoDB filter
   * @param {Object} [options]
   * @param {string|Object} [options.select]
   * @param {Array} [options.populate]
   * @param {Object} [options.sort]
   * @param {number} [options.limit]
   * @param {number} [options.skip]
   * @param {boolean} [options.lean=true]
   */
  async find(filter = {}, options = {}) {
    const { select, populate, sort, limit, skip, lean = true } = options;
    let query = this.model.find(filter);
    if (select) query = query.select(select);
    if (populate) {
      for (const pop of Array.isArray(populate) ? populate : [populate]) {
        query = query.populate(pop);
      }
    }
    if (sort) query = query.sort(sort);
    if (skip) query = query.skip(skip);
    if (limit) query = query.limit(limit);
    if (lean) query = query.lean();
    return query;
  }

  /**
   * Find a single document matching a filter.
   */
  async findOne(filter, options = {}) {
    const { select, populate, lean = true } = options;
    let query = this.model.findOne(filter);
    if (select) query = query.select(select);
    if (populate) {
      for (const pop of Array.isArray(populate) ? populate : [populate]) {
        query = query.populate(pop);
      }
    }
    if (lean) query = query.lean();
    return query;
  }

  /**
   * Create a new document.
   * Returns the created document (not lean — Mongoose doc with methods).
   */
  async create(data) {
    return this.model.create(data);
  }

  /**
   * Update a document by ID and return the updated version.
   */
  async updateById(id, update, options = {}) {
    const { select, populate, lean = true } = options;
    let query = this.model.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    if (select) query = query.select(select);
    if (populate) {
      for (const pop of Array.isArray(populate) ? populate : [populate]) {
        query = query.populate(pop);
      }
    }
    if (lean) query = query.lean();
    return query;
  }

  /**
   * Update a single document matching a filter.
   */
  async updateOne(filter, update) {
    return this.model.updateOne(filter, update);
  }

  /**
   * Update multiple documents matching a filter.
   */
  async updateMany(filter, update) {
    return this.model.updateMany(filter, update);
  }

  /**
   * Delete a document by ID.
   */
  async deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }

  /**
   * Delete multiple documents matching a filter.
   */
  async deleteMany(filter) {
    return this.model.deleteMany(filter);
  }

  /**
   * Count documents matching a filter.
   */
  async count(filter = {}) {
    return this.model.countDocuments(filter);
  }

  /**
   * Run a Mongoose aggregation pipeline.
   */
  async aggregate(pipeline) {
    return this.model.aggregate(pipeline);
  }

  /**
   * Check if a document exists matching the filter.
   */
  async exists(filter) {
    const doc = await this.model.exists(filter);
    return !!doc;
  }
}

export default BaseRepository;
