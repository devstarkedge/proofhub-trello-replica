import FinancePage from '../models/FinancePage.js';
import User from '../models/User.js';
import { 
  emitFinancePagePending, 
  emitFinancePagePublished, 
  emitFinancePageStatusChanged,
  emitFinancePageUpdated,
  emitFinancePageDeleted 
} from '../utils/socketEmitter.js';

/**
 * Finance Pages Controller
 * Handles custom finance page CRUD operations
 * and approval workflow for Admin
 */

// ============================================
// GET: All Pages (filtered by user role)
// ============================================
export const getFinancePages = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role?.toLowerCase();
    
    let pages = [];
    
    if (userRole === 'admin') {
      // Admin sees all pages
      pages = await FinancePage.find({ isArchived: false })
        .populate('createdBy', 'name email')
        .populate('approvedBy', 'name')
        .sort({ order: 1, createdAt: -1 });
    } else {
      // Manager sees: their own pages + approved public pages
      pages = await FinancePage.find({
        isArchived: false,
        $or: [
          { createdBy: userId },
          { isPublic: true, status: 'approved' }
        ]
      })
        .populate('createdBy', 'name email')
        .sort({ order: 1, createdAt: -1 });
    }
    
    res.json({
      success: true,
      data: pages
    });
  } catch (error) {
    console.error('Get Finance Pages Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: Single Page by ID
// ============================================
export const getFinancePageById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role?.toLowerCase();
    
    const page = await FinancePage.findById(id)
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name');
    
    if (!page || page.isArchived) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    
    // Check access: Admin can access all, others only their own or public approved
    if (userRole !== 'admin') {
      const isCreator = page.createdBy._id.toString() === userId.toString();
      const isPublicApproved = page.isPublic && page.status === 'approved';
      
      if (!isCreator && !isPublicApproved) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }
    
    res.json({
      success: true,
      data: page
    });
  } catch (error) {
    console.error('Get Finance Page Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// POST: Create New Page
// ============================================
export const createFinancePage = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role?.toLowerCase();
    const { name, description, pageType, columns, defaultFilters } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Page name is required' });
    }
    
    // Determine initial status
    // Admin-created pages are auto-approved
    const status = userRole === 'admin' ? 'approved' : 'pending';
    const isPublic = userRole === 'admin';
    
    const page = new FinancePage({
      name,
      description,
      pageType: pageType || 'users',
      columns: columns || [],
      defaultFilters: defaultFilters || {},
      createdBy: userId,
      status,
      isPublic,
      approvedBy: userRole === 'admin' ? userId : null,
      approvedAt: userRole === 'admin' ? new Date() : null
    });
    
    await page.save();
    
    // Populate for response
    await page.populate('createdBy', 'name email');
    
    // If created by Manager, emit socket event to notify Admin
    if (userRole === 'manager') {
      emitFinancePagePending(page, req.user.name);
    } else if (userRole === 'admin') {
      // Notify managers about new public page
      emitFinancePagePublished(page);
    }
    
    res.status(201).json({
      success: true,
      data: page,
      message: userRole === 'admin' 
        ? 'Page created and published' 
        : 'Page created and pending Admin approval'
    });
  } catch (error) {
    console.error('Create Finance Page Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// PUT: Update Page
// ============================================
export const updateFinancePage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role?.toLowerCase();
    const { name, description, pageType, columns, defaultFilters } = req.body;
    
    const page = await FinancePage.findById(id);
    
    if (!page || page.isArchived) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    
    // Only creator or Admin can update
    const isCreator = page.createdBy.toString() === userId.toString();
    if (!isCreator && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    // Update fields
    if (name) page.name = name;
    if (description !== undefined) page.description = description;
    if (pageType) page.pageType = pageType;
    if (columns) page.columns = columns;
    if (defaultFilters) page.defaultFilters = defaultFilters;
    
    await page.save();
    await page.populate('createdBy', 'name email');
    
    // Emit socket event for update
    emitFinancePageUpdated(page);
    
    res.json({
      success: true,
      data: page
    });
  } catch (error) {
    console.error('Update Finance Page Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// PUT: Approve/Reject Page (Admin only)
// ============================================
export const approveFinancePage = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'approve' or 'reject'
    const userId = req.user._id;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
    
    const page = await FinancePage.findById(id).populate('createdBy', 'name email');
    
    if (!page || page.isArchived) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    
    if (action === 'approve') {
      page.status = 'approved';
      page.isPublic = true;
    } else {
      page.status = 'rejected';
      page.isPublic = false;
    }
    
    page.approvedBy = userId;
    page.approvedAt = new Date();
    
    await page.save();
    await page.populate('approvedBy', 'name');
    
    // Emit socket event for real-time update
    emitFinancePageStatusChanged(page, action);
    
    res.json({
      success: true,
      data: page,
      message: action === 'approve' 
        ? 'Page approved and now visible to all managers' 
        : 'Page rejected'
    });
  } catch (error) {
    console.error('Approve Finance Page Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// DELETE: Delete Page from Database
// ============================================
export const deleteFinancePage = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role?.toLowerCase();
    
    const page = await FinancePage.findById(id);
    
    if (!page) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    
    // Only creator or Admin can delete
    const isCreator = page.createdBy.toString() === userId.toString();
    if (!isCreator && userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    // Store page info before deletion for socket emission
    const pageId = page._id;
    const pageName = page.name;
    
    // Permanently delete the page from database
    await FinancePage.findByIdAndDelete(id);
    
    // Emit socket event for deletion
    emitFinancePageDeleted(pageId, pageName);
    
    res.json({
      success: true,
      message: 'Page deleted successfully'
    });
  } catch (error) {
    console.error('Delete Finance Page Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: Pending Pages (Admin only)
// ============================================
export const getPendingPages = async (req, res) => {
  try {
    const pages = await FinancePage.find({ 
      status: 'pending', 
      isArchived: false 
    })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: pages
    });
  } catch (error) {
    console.error('Get Pending Pages Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// PUT: Reorder Pages
// ============================================
export const reorderFinancePages = async (req, res) => {
  try {
    const { pages } = req.body; // Array of { id, order }
    
    if (!pages || !Array.isArray(pages)) {
      return res.status(400).json({ success: false, message: 'Invalid pages array' });
    }
    
    // Update order for each page
    await Promise.all(
      pages.map(({ id, order }) => 
        FinancePage.findByIdAndUpdate(id, { order })
      )
    );
    
    res.json({
      success: true,
      message: 'Pages reordered successfully'
    });
  } catch (error) {
    console.error('Reorder Finance Pages Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
