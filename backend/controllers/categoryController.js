import Category from "../models/Category.js";
import Department from "../models/Department.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";

// @desc    Get all categories for a department
// @route   GET /api/categories/department/:departmentId
// @access  Private
export const getCategoriesByDepartment = asyncHandler(async (req, res, next) => {
  const { departmentId } = req.params;

  const categories = await Category.find({
    department: departmentId,
    isActive: true
  })
    .populate('createdBy', 'name email')
    .sort('name');

  res.status(200).json({
    success: true,
    count: categories.length,
    data: categories,
  });
});

// @desc    Get single category
// @route   GET /api/categories/:id
// @access  Private
export const getCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id)
    .populate('department', 'name')
    .populate('createdBy', 'name email');

  if (!category) {
    return next(new ErrorResponse("Category not found", 404));
  }

  res.status(200).json({
    success: true,
    data: category,
  });
});

// @desc    Create category
// @route   POST /api/categories
// @access  Private
export const createCategory = asyncHandler(async (req, res, next) => {
  const { name, description, department } = req.body;

  // Check if department exists
  const dept = await Department.findById(department);
  if (!dept) {
    return next(new ErrorResponse("Department not found", 404));
  }

  // Check if category already exists for this department
  const existingCategory = await Category.findOne({
    name: name.trim(),
    department,
    isActive: true
  });
  if (existingCategory) {
    return next(new ErrorResponse("Category already exists for this department", 400));
  }

  const category = await Category.create({
    name: name.trim(),
    description,
    department,
    createdBy: req.user._id
  });

  // Populate department and creator info
  await category.populate('department', 'name');
  await category.populate('createdBy', 'name email');

  res.status(201).json({
    success: true,
    data: category,
  });
});

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private
export const updateCategory = asyncHandler(async (req, res, next) => {
  const { name, description } = req.body;

  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(new ErrorResponse("Category not found", 404));
  }

  // Check if updated name conflicts with existing category in same department
  if (name && name.trim() !== category.name) {
    const existingCategory = await Category.findOne({
      name: name.trim(),
      department: category.department,
      isActive: true,
      _id: { $ne: req.params.id }
    });
    if (existingCategory) {
      return next(new ErrorResponse("Category name already exists for this department", 400));
    }
  }

  // Update fields
  if (name) category.name = name.trim();
  if (description !== undefined) category.description = description;

  await category.save();

  // Populate department and creator info
  await category.populate('department', 'name');
  await category.populate('createdBy', 'name email');

  res.status(200).json({
    success: true,
    data: category,
  });
});

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private
export const deleteCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(new ErrorResponse("Category not found", 404));
  }

  // Soft delete - mark as inactive
  category.isActive = false;
  await category.save();

  res.status(200).json({
    success: true,
    message: "Category deleted successfully",
  });
});
