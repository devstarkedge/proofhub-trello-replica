import mongoose from 'mongoose';
import ProjectDropdownOption from '../models/ProjectDropdownOption.js';
import Board from '../models/Board.js';
import { getActiveWorkspaceId } from '../modules/workspaces/workspaceContext.js';
import { requireProjectPermission } from '../services/projectAuthorization.js';

const OPTION_TYPES = ['projectSource', 'billingType', 'technology'];
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DEFAULT_OPTIONS = {
  projectSource: [
    { value: 'Direct', label: 'Direct Client' },
    { value: 'Upwork', label: 'Upwork' },
    { value: 'Contra', label: 'Contra' }
  ],
  // 'hr' and 'milestone' are NOT listed here — they're global system
  // options (workspaceId: null, isSystem: true), seeded once by
  // scripts/migrateBillingTypeOptions.js, not lazily per-workspace. Only
  // Fixed Price is a genuine per-workspace custom default.
  billingType: [
    { value: 'fixed', label: 'Fixed Price' }
  ]
};

const normalizeValue = (value) => value?.trim();
const normalizeLabel = (label) => label?.trim();
const normalizeSlug = (label) =>
  label
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const ensureDefaults = async (type, userId) => {
  const workspaceId = getActiveWorkspaceId();
  if (!workspaceId) throw new Error('Workspace context required');
  const defaults = DEFAULT_OPTIONS[type] || [];
  if (defaults.length === 0) return;

  await ProjectDropdownOption.bulkWrite(defaults.map((opt, index) => ({
    updateOne: {
      filter: { workspaceId, type, value: opt.value },
      update: {
        $setOnInsert: {
          workspaceId,
          type,
          value: opt.value,
          label: opt.label,
          displayOrder: index,
          createdBy: userId,
          isActive: true,
          isSystem: false
        }
      },
      upsert: true
    }
  })));
};

const getUsedValues = async (type) => {
  if (type === 'projectSource') {
    return Board.distinct('projectSource', { projectSource: { $ne: null } });
  }
  if (type === 'billingType') {
    return Board.distinct('billingCycle', { billingCycle: { $ne: null } });
  }
  if (type === 'technology') return Board.distinct('technologies');
  return [];
};

/**
 * @desc    Get project dropdown options
 * @route   GET /api/project-options/:type
 * @access  Private
 */
export const getProjectDropdownOptions = async (req, res) => {
  try {
    const { type } = req.params;
    if (!OPTION_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option type'
      });
    }

    if (type === 'technology' && req.user.role === 'employee') {
      return res.status(403).json({ success: false, message: 'Technology details are restricted' });
    }
    await ensureDefaults(type, req.user?._id);

    const [options, usedValues] = await Promise.all([
      ProjectDropdownOption.find({ type, isActive: true, ...(type === 'technology' ? { workspaceId: getActiveWorkspaceId() } : {}) }).sort({ displayOrder: 1 }).lean(),
      getUsedValues(type)
    ]);

    const usedSet = new Set((usedValues || []).map((val) => String(val)));

    const data = options.map((option) => ({
      ...option,
      isUsed: usedSet.has(String(option._id)) || usedSet.has(String(option.value)) || usedSet.has(String(option.label))
    }));

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get project dropdown options error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dropdown options',
      error: error.message
    });
  }
};

/**
 * @desc    Add project dropdown option
 * @route   POST /api/project-options/:type
 * @access  Private
 */
export const addProjectDropdownOption = async (req, res) => {
  try {
    const { type } = req.params;
    const { value, label } = req.body;

    if (!OPTION_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option type'
      });
    }

    if (type === 'technology' || req.user.role === 'employee') await requireProjectPermission(req, 'project.create');
    if (typeof label !== 'string' || (type === 'technology' && label.trim().length > 100) || (value != null && typeof value !== 'string')) {
      return res.status(400).json({ success: false, message: 'Option name must be text of up to 100 characters' });
    }
    const normalizedLabel = type === 'technology' ? normalizeLabel(label).normalize('NFC') : normalizeLabel(label);
    if (!normalizedLabel) {
      return res.status(400).json({
        success: false,
        message: 'Option label is required'
      });
    }

    // Technology names themselves form the unique key. Slugs lose meaningful
    // punctuation (C++, C#, .NET); a caller-supplied key must not evade uniqueness.
    const normalizedValue = type === 'technology' ? normalizedLabel.toLowerCase() : normalizeValue(value) || normalizeSlug(normalizedLabel) || normalizedLabel;
    const scope = type === 'technology' ? { workspaceId: getActiveWorkspaceId() } : {};

    const duplicate = await ProjectDropdownOption.findOne({
      type,
      ...scope,
      $or: [
        { value: normalizedValue },
        { label: new RegExp(`^${escapeRegex(normalizedLabel)}$`, 'i') }
      ]
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Option already exists'
      });
    }

    const lastOption = await ProjectDropdownOption.findOne({ type, ...scope }).sort({ displayOrder: -1 });
    const displayOrder = lastOption ? lastOption.displayOrder + 1 : 0;

    const option = await ProjectDropdownOption.create({
      ...scope,
      type,
      value: normalizedValue,
      label: normalizedLabel,
      displayOrder,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Option added successfully',
      data: option
    });
  } catch (error) {
    console.error('Add project dropdown option error:', error);
    res.status(error.code === 11000 ? 409 : error.statusCode || 400).json({
      success: false,
      message: error.code === 11000 ? 'Option already exists' : error.statusCode ? error.message : 'Failed to add option',
      error: error.message
    });
  }
};

/**
 * @desc    Delete project dropdown option
 * @route   DELETE /api/project-options/:type/:id
 * @access  Private
 */
export const deleteProjectDropdownOption = async (req, res) => {
  try {
    const { type, id } = req.params;

    if (!OPTION_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option type'
      });
    }

    if (type === 'technology' || req.user.role === 'employee') await requireProjectPermission(req, 'project.create');
    const scope = type === 'technology' ? { workspaceId: getActiveWorkspaceId() } : {};
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option id'
      });
    }

    const option = await ProjectDropdownOption.findOne({ _id: id, type, ...scope });
    if (!option) {
      return res.status(404).json({
        success: false,
        message: 'Option not found'
      });
    }

    if (option.isSystem) {
      return res.status(409).json({
        success: false,
        message: 'System billing options cannot be deleted.'
      });
    }

    const lookupValues = Array.from(new Set([option.value, option.label].filter(Boolean)));
    let isInUse = false;

    if (type === 'projectSource') {
      isInUse = await Board.exists({ projectSource: { $in: lookupValues } });
    } else if (type === 'billingType') {
      isInUse = await Board.exists({ billingCycle: { $in: lookupValues } });
    } else if (type === 'technology') {
      isInUse = await Board.exists({ technologies: option._id });
    }

    if (isInUse) {
      return res.status(409).json({
        success: false,
        message: type === 'technology' ? 'Remove this technology from saved projects before permanently deleting it from the workspace.' : 'This option is already used in existing projects and cannot be deleted.'
      });
    }

    const deleted = await ProjectDropdownOption.deleteOne({ _id: id, type, ...scope });
    if (!deleted.deletedCount) return res.status(404).json({ success: false, message: 'Option not found' });

    res.json({
      success: true,
      message: 'Option deleted successfully'
    });
  } catch (error) {
    console.error('Delete project dropdown option error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode ? error.message : 'Failed to delete option',
      error: error.message
    });
  }
};
