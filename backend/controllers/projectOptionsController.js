import mongoose from 'mongoose';
import ProjectDropdownOption from '../models/ProjectDropdownOption.js';
import Board from '../models/Board.js';

const DEFAULT_OPTIONS = {
  projectSource: [
    { value: 'Direct', label: 'Direct Client' },
    { value: 'Upwork', label: 'Upwork' },
    { value: 'Contra', label: 'Contra' }
  ],
  billingType: [
    { value: 'hr', label: 'Hourly Rate' },
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
  const existingCount = await ProjectDropdownOption.countDocuments({ type });
  if (existingCount > 0) return;

  const defaults = DEFAULT_OPTIONS[type] || [];
  if (defaults.length === 0) return;

  await ProjectDropdownOption.insertMany(
    defaults.map((opt, index) => ({
      type,
      value: opt.value,
      label: opt.label,
      displayOrder: index,
      createdBy: userId
    }))
  );
};

const getUsedValues = async (type) => {
  if (type === 'projectSource') {
    return Board.distinct('projectSource', { projectSource: { $ne: null } });
  }
  if (type === 'billingType') {
    return Board.distinct('billingCycle', { billingCycle: { $ne: null } });
  }
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
    if (!['projectSource', 'billingType'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option type'
      });
    }

    await ensureDefaults(type, req.user?._id);

    const [options, usedValues] = await Promise.all([
      ProjectDropdownOption.find({ type, isActive: true }).sort({ displayOrder: 1 }).lean(),
      getUsedValues(type)
    ]);

    const usedSet = new Set((usedValues || []).map((val) => String(val)));

    const data = options.map((option) => ({
      ...option,
      isUsed: usedSet.has(String(option.value)) || usedSet.has(String(option.label))
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

    if (!['projectSource', 'billingType'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option type'
      });
    }

    const normalizedLabel = normalizeLabel(label);
    if (!normalizedLabel) {
      return res.status(400).json({
        success: false,
        message: 'Option label is required'
      });
    }

    const normalizedValue = normalizeValue(value) || normalizeSlug(normalizedLabel) || normalizedLabel;

    const duplicate = await ProjectDropdownOption.findOne({
      type,
      $or: [
        { value: normalizedValue },
        { label: new RegExp(`^${normalizedLabel}$`, 'i') }
      ]
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Option already exists'
      });
    }

    const lastOption = await ProjectDropdownOption.findOne({ type }).sort({ displayOrder: -1 });
    const displayOrder = lastOption ? lastOption.displayOrder + 1 : 0;

    const option = await ProjectDropdownOption.create({
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
    res.status(400).json({
      success: false,
      message: 'Failed to add option',
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

    if (!['projectSource', 'billingType'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option type'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option id'
      });
    }

    const option = await ProjectDropdownOption.findOne({ _id: id, type });
    if (!option) {
      return res.status(404).json({
        success: false,
        message: 'Option not found'
      });
    }

    const lookupValues = Array.from(new Set([option.value, option.label].filter(Boolean)));
    let isInUse = false;

    if (type === 'projectSource') {
      isInUse = await Board.exists({ projectSource: { $in: lookupValues } });
    } else if (type === 'billingType') {
      isInUse = await Board.exists({ billingCycle: { $in: lookupValues } });
    }

    if (isInUse) {
      return res.status(409).json({
        success: false,
        message: 'This option is already used in existing projects and cannot be deleted.'
      });
    }

    await ProjectDropdownOption.deleteOne({ _id: id, type });

    res.json({
      success: true,
      message: 'Option deleted successfully'
    });
  } catch (error) {
    console.error('Delete project dropdown option error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete option',
      error: error.message
    });
  }
};
