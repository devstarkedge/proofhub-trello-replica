import SalesRow from '../models/SalesRow.js';
import SalesColumn from '../models/SalesColumn.js';
import SalesDropdownOption from '../models/SalesDropdownOption.js';
import SalesPermission from '../models/SalesPermission.js';
import SalesActivityLog from '../models/SalesActivityLog.js';
import { io, emitToUser } from '../server.js';
import slackNotificationService from '../services/slack/SlackNotificationService.js';
import notificationService from '../utils/notificationService.js';
import ExcelJS from 'exceljs';

// Field label mapping for better activity log readability
const fieldLabels = {
  date: 'Date',
  monthName: 'Month',
  bidLink: 'Bid Link',
  platform: 'Platform',
  profile: 'Profile',
  technology: 'Technology',
  clientRating: 'Client Rating',
  clientHireRate: 'Client % Hire Rate',
  clientBudget: 'Client Budget',
  clientSpending: 'Client Spending',
  clientLocation: 'Client Location',
  replyFromClient: 'Reply From Client',
  followUps: 'Follow Ups',
  followUpDate: 'Follow Up Date',
  connects: 'Connects',
  rate: 'Rate',
  proposalScreenshot: 'Proposal Screenshot',
  status: 'Status',
  comments: 'Comments',
  rowColor: 'Row Color'
};

// Helper function to track changes between old and new values
const trackChanges = (oldRow, newData) => {
  const changes = [];
  const fieldsToTrack = Object.keys(fieldLabels);
  
  fieldsToTrack.forEach(field => {
    if (newData[field] === undefined) return;

    const oldVal = oldRow[field];
    const newVal = newData[field];

    // For date fields, only consider a change when day/month/year differ
    if (field === 'date' || field === 'followUpDate') {
      const oldDate = oldVal ? new Date(oldVal) : null;
      const newDate = newVal ? new Date(newVal) : null;

      const sameDate = (() => {
        if (!oldDate && !newDate) return true;
        if (!oldDate || !newDate) return false;
        return oldDate.getFullYear() === newDate.getFullYear()
          && oldDate.getMonth() === newDate.getMonth()
          && oldDate.getDate() === newDate.getDate();
      })();

      if (!sameDate) {
        changes.push({ field, fieldLabel: fieldLabels[field], oldValue: oldVal, newValue: newVal });
      }
      return;
    }

    // Default comparison for other fields
    if (oldVal !== newVal) {
      changes.push({ field, fieldLabel: fieldLabels[field], oldValue: oldVal, newValue: newVal });
    }
  });
  
  return changes;
};


// Helper to identify standard schema fields (excluding system fields)
const STANDARD_FIELDS = [
  'date', 'monthName', 'bidLink', 'platform', 'profile', 'technology',
  'clientRating', 'clientHireRate', 'clientBudget', 'clientSpending',
  'clientLocation', 'replyFromClient', 'followUps', 'followUpDate',
  'connects', 'rate', 'proposalScreenshot', 'status', 'comments',
  'rowColor'
];

// Helper to flatten row (merge customFields into root) for response
const flattenRow = (row) => {
  if (!row) return null;
  // Handle Mongoose document vs POJO
  // flattenMaps: true ensures Map types are converted to plain objects
  const obj = row.toObject ? row.toObject({ getters: true, virtuals: true, flattenMaps: true }) : row;
  const { customFields, ...rest } = obj;
  return { ...rest, ...(customFields || {}) };
};

// Helper to separate standard and custom fields for save
const prepareRowForSave = (data) => {
  const standard = {};
  const custom = {};
  
  Object.keys(data).forEach(key => {
    if (STANDARD_FIELDS.includes(key)) {
      standard[key] = data[key];
    } else if (!['_id', 'createdAt', 'updatedAt', '__v', 'createdBy', 'updatedBy', 'lockedBy', 'lockedAt'].includes(key)) {
      custom[key] = data[key];
    }
  });

  return { standard, custom };
};

/**
 * @desc    Get all sales rows with pagination, filtering, and search
 * @route   GET /api/sales/rows
 * @access  Private (requires sales module permission)
 */
export const getSalesRows = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      platform,
      technology,
      status,
      location,
      minRating,
      minHireRate,
      budget,
      dateFrom,
      dateTo,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = { isDeleted: false };

    // Search across multiple fields
    if (search) {
      query.$or = [
        { bidLink: { $regex: search, $options: 'i' } },
        { comments: { $regex: search, $options: 'i' } },
        { platform: { $regex: search, $options: 'i' } },
        { profile: { $regex: search, $options: 'i' } },
        { technology: { $regex: search, $options: 'i' } },
        // Also search in custom fields?? This is hard with Map... 
        // For now, we likely miss custom fields in search unless we query specifically.
      ];
    }

    // Apply filters
    if (platform) query.platform = platform;
    if (technology) query.technology = technology;
    if (status) query.status = status;
    if (location) query.clientLocation = location;
    if (minRating) query.clientRating = { $gte: parseInt(minRating) };
    if (minHireRate) query.clientHireRate = { $gte: parseInt(minHireRate) };
    if (budget) query.clientBudget = budget;
    
    // Date range filter
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [rows, total] = await Promise.all([
      SalesRow.find(query)
        .populate('createdBy', 'name email avatar')
        .populate('updatedBy', 'name email avatar')
        .populate('lockedBy', 'name email avatar')
        .sort(sortConfig)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      SalesRow.countDocuments(query)
    ]);

    // Flatten rows for frontend
    const flattenedRows = rows.map(flattenRow);

    res.json({
      success: true,
      data: flattenedRows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get sales rows error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales rows',
      error: error.message
    });
  }
};

/**
 * @desc    Get single sales row by ID
 * @route   GET /api/sales/rows/:id
 * @access  Private (requires sales module permission)
 */
export const getSalesRowById = async (req, res) => {
  try {
    const row = await SalesRow.findById(req.params.id)
      .populate('createdBy', 'name email avatar')
      .populate('updatedBy', 'name email avatar')
      .populate('lockedBy', 'name email avatar')
      .lean();

    if (!row || row.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Sales row not found'
      });
    }

    res.json({
      success: true,
      data: flattenRow(row)
    });
  } catch (error) {
    console.error('Get sales row error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales row',
      error: error.message
    });
  }
};

/**
 * @desc    Create new sales row
 * @route   POST /api/sales/rows
 * @access  Private (requires canCreate permission)
 */
export const createSalesRow = async (req, res) => {
  try {
    const userId = req.user._id;
    const { standard, custom } = prepareRowForSave(req.body);

    // Initialize row with standard fields
    const row = new SalesRow({
      ...standard,
      createdBy: userId,
      updatedBy: userId
    });

    // Explicitly set custom fields to ensure Map is populated correctly
    // This avoids issues where Mongoose might not cast the object to Map correctly during create()
    if (Object.keys(custom).length > 0) {
      Object.entries(custom).forEach(([key, value]) => {
        row.customFields.set(key, value);
      });
    }

    await row.save();
    
    // Populate user fields
    await row.populate('createdBy updatedBy', 'name email avatar');
    const flatRow = flattenRow(row);

    // Log activity
    await SalesActivityLog.logActivity({
      salesRow: row._id,
      user: userId,
      action: 'created',
      description: `Created new sales row for ${row.platform}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Emit real-time event with flattened row
    io.to('sales').emit('sales:row:created', { row: flatRow });

    res.status(201).json({
      success: true,
      message: 'Sales row created successfully',
      data: flatRow
    });
  } catch (error) {
    console.error('Create sales row error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to create sales row',
      error: error.message
    });
  }
};

/**
 * @desc    Update sales row
 * @route   PUT /api/sales/rows/:id
 * @access  Private (requires canUpdate permission)
 */
export const updateSalesRow = async (req, res) => {
  try {
    const userId = req.user._id;
    const row = await SalesRow.findById(req.params.id);

    if (!row || row.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Sales row not found'
      });
    }

    // Check if row is locked by another user
    if (row.isLocked() && row.lockedBy.toString() !== userId.toString()) {
      const lockedByUser = await row.populate('lockedBy', 'name');
      return res.status(423).json({
        success: false,
        message: `This row is currently being edited by ${lockedByUser.lockedBy.name}`,
        lockedBy: lockedByUser.lockedBy
      });
    }

    // Separate standard and custom fields
    const { standard, custom } = prepareRowForSave(req.body);

    // Track changes for activity log (complex due to custom fields, keeping simple for now)
    const changes = trackChanges(flattenRow(row), { ...standard, ...custom });

    // Update standard fields
    Object.assign(row, standard);
    
    // Update custom fields - merge with existing or overwrite? 
    // Usually overwrite the keys provided, keep others? Or simplistic merge.
    // Mongoose Map needs explicit setting
    if (Object.keys(custom).length > 0) {
      // row.customFields is a Map
      Object.entries(custom).forEach(([key, value]) => {
        row.customFields.set(key, value);
      });
      // Mark as modified just in case
      row.markModified('customFields');
    }

    row.updatedBy = userId;
    
    // Release lock if it was locked
    if (row.lockedBy) {
      row.releaseLock(userId);
    }

    await row.save();
    await row.populate('createdBy updatedBy', 'name email avatar');

    const flatRow = flattenRow(row);

    // Log activity if there were changes
    if (changes.length > 0) {
      await SalesActivityLog.logActivity({
        salesRow: row._id,
        user: userId,
        action: 'updated',
        description: SalesActivityLog.formatChangeDescription(changes),
        changes,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    }

    // Emit real-time event
    io.to('sales').emit('sales:row:updated', { row: flatRow, changes });

    res.json({
      success: true,
      message: 'Sales row updated successfully',
      data: flatRow
    });
  } catch (error) {
    console.error('Update sales row error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update sales row',
      error: error.message
    });
  }
};

/**
 * @desc    Delete sales row (soft delete)
 * @route   DELETE /api/sales/rows/:id
 * @access  Private (requires canDelete permission)
 */
export const deleteSalesRow = async (req, res) => {
  try {
    const userId = req.user._id;
    const row = await SalesRow.findById(req.params.id);

    if (!row || row.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Sales row not found'
      });
    }

    // Soft delete
    row.isDeleted = true;
    row.deletedAt = new Date();
    row.deletedBy = userId;
    await row.save();

    // Log activity
    await SalesActivityLog.logActivity({
      salesRow: row._id,
      user: userId,
      action: 'deleted',
      description: `Deleted sales row for ${row.platform}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Emit real-time event
    io.to('sales').emit('sales:row:deleted', { rowId: row._id });

    res.json({
      success: true,
      message: 'Sales row deleted successfully'
    });
  } catch (error) {
    console.error('Delete sales row error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete sales row',
      error: error.message
    });
  }
};

/**
 * @desc    Bulk update sales rows
 * @route   POST /api/sales/rows/bulk-update
 * @access  Private (requires canUpdate permission)
 */
export const bulkUpdateRows = async (req, res) => {
  try {
    const { rowIds, updates } = req.body;
    const userId = req.user._id;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Row IDs array is required'
      });
    }

    const { standard, custom } = prepareRowForSave(updates);

    // Build update object
    const mongoUpdate = { 
      $set: { ...standard, updatedBy: userId } 
    };

    // For custom fields, we need to set them individually in the Map using dot notation if possible,
    // but updateMany with Map values is tricky. 
    // updateMany({ ... }, { $set: { "customFields.key": value } }) works.
    if (Object.keys(custom).length > 0) {
      Object.entries(custom).forEach(([key, value]) => {
        mongoUpdate.$set[`customFields.${key}`] = value;
      });
    }

    const result = await SalesRow.updateMany(
      { _id: { $in: rowIds }, isDeleted: false },
      mongoUpdate
    );

    // Log activity for each updated row
    const logPromises = rowIds.map(rowId =>
      SalesActivityLog.logActivity({
        salesRow: rowId,
        user: userId,
        action: 'updated',
        description: `Bulk update: ${Object.keys(updates).join(', ')}`,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      })
    );
    await Promise.all(logPromises);

    // Emit real-time event
    // Note: We emit the raw updates here. Frontend store handles optimistic update.
    // Ideally frontend fetching fresh rows on bulk update handles the flattening.
    io.to('sales').emit('sales:rows:bulk-updated', { rowIds, updates });

    res.json({
      success: true,
      message: `Successfully updated ${result.modifiedCount} rows`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk update rows',
      error: error.message
    });
  }
};

/**
 * @desc    Bulk delete sales rows
 * @route   POST /api/sales/rows/bulk-delete
 * @access  Private (requires canDelete permission)
 */
export const bulkDeleteRows = async (req, res) => {
  try {
    const { rowIds } = req.body;
    const userId = req.user._id;

    if (!rowIds || !Array.isArray(rowIds) || rowIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Row IDs array is required'
      });
    }

    const result = await SalesRow.updateMany(
      { _id: { $in: rowIds }, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: userId
        }
      }
    );

    // Log activity for each deleted row
    const logPromises = rowIds.map(rowId =>
      SalesActivityLog.logActivity({
        salesRow: rowId,
        user: userId,
        action: 'deleted',
        description: 'Bulk delete operation',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      })
    );
    await Promise.all(logPromises);

    // Emit real-time event
    io.to('sales').emit('sales:rows:bulk-deleted', { rowIds });

    res.json({
      success: true,
      message: `Successfully deleted ${result.modifiedCount} rows`,
      deletedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk delete rows',
      error: error.message
    });
  }
};

/**
 * @desc    Lock row for editing
 * @route   POST /api/sales/rows/:id/lock
 * @access  Private
 */
export const lockRow = async (req, res) => {
  try {
    const userId = req.user._id;
    const row = await SalesRow.findById(req.params.id);

    if (!row || row.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Sales row not found'
      });
    }

    const locked = row.acquireLock(userId);
    if (!locked) {
      await row.populate('lockedBy', 'name');
      return res.status(423).json({
        success: false,
        message: `Row is locked by ${row.lockedBy.name}`,
        lockedBy: row.lockedBy
      });
    }

    await row.save();

    // Emit real-time event
    io.to('sales').emit('sales:row:locked', {
      rowId: row._id,
      lockedBy: { _id: userId, name: req.user.name }
    });

    res.json({
      success: true,
      message: 'Row locked successfully'
    });
  } catch (error) {
    console.error('Lock row error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to lock row',
      error: error.message
    });
  }
};

/**
 * @desc    Unlock row
 * @route   POST /api/sales/rows/:id/unlock
 * @access  Private
 */
export const unlockRow = async (req, res) => {
  try {
    const userId = req.user._id;
    const row = await SalesRow.findById(req.params.id);

    if (!row || row.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'Sales row not found'
      });
    }

    const unlocked = row.releaseLock(userId);
    if (!unlocked) {
      return res.status(403).json({
        success: false,
        message: 'You can only unlock rows that you locked'
      });
    }

    await row.save();

    // Emit real-time event
    io.to('sales').emit('sales:row:unlocked', { rowId: row._id });

    res.json({
      success: true,
      message: 'Row unlocked successfully'
    });
  } catch (error) {
    console.error('Unlock row error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlock row',
      error: error.message
    });
  }
};

/**
 * @desc    Get activity log for a sales row
 * @route   GET /api/sales/rows/:id/activity
 * @access  Private (requires canViewActivityLog permission)
 */
export const getActivityLog = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      SalesActivityLog.find({ salesRow: req.params.id })
        .populate('user', 'name email avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      SalesActivityLog.countDocuments({ salesRow: req.params.id })
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get activity log error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity log',
      error: error.message
    });
  }
};

/**
 * @desc    Export sales rows to Excel/CSV
 * @route   GET /api/sales/rows/export
 * @access  Private (requires canExport permission)
 */
export const exportRows = async (req, res) => {
  try {
    const { format = 'csv', rowIds } = req.query;
    
    // Build query
    const query = { isDeleted: false };
    if (rowIds) {
      query._id = { $in: rowIds.split(',') };
    }

    const rawRows = await SalesRow.find(query)
      .populate('createdBy', 'name')
      .populate('updatedBy', 'name')
      .sort({ date: -1 })
      .lean();

    const rows = rawRows.map(flattenRow);

    // Helper for export formatting
    const formatExportDate = (date) => {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    };

    // Prepare data for ExcelJS
    const excludedFields = [
      '_id', '__v', 'customFields', 'isDeleted', 
      'lockedBy', 'lockedAt', 'createdBy', 'updatedBy', 
      'createdAt', 'updatedAt', 'id', 'dateCheck', 'rowColor',
      'date-check'
    ];

    // Determine all unique keys for columns (standard + custom)
    const allKeys = new Set();
    // Helper to get export object
    const getExportObj = (row) => {
      const base = {
        'Date': formatExportDate(row.date),
        'Month': row.monthName || '',
        'Bid Link': row.bidLink || '',
        'Platform': row.platform || '',
        'Profile': row.profile || '',
        'Technology': row.technology || '',
        'Client Rating': row.clientRating || '',
        'Client % Hire Rate': row.clientHireRate || '',
        'Client Budget': row.clientBudget || '',
        'Client Spending': row.clientSpending || '',
        'Client Location': row.clientLocation || '',
        'Reply From Client': row.replyFromClient || '',
        'Follow Ups': row.followUps || '',
        'Follow Up Date': formatExportDate(row.followUpDate),
        'Connects': row.connects || '',
        'Rate': row.rate || '',
        'Proposal Screenshot': row.proposalScreenshot || '',
        'Status': row.status || '',
        'Comments': row.comments || ''
      };
      // Add custom fields
      Object.keys(row).forEach(key => {
        if (!Object.keys(base).includes(key) && !excludedFields.includes(key)) {
           base[key] = row[key];
        }
      });
      return base;
    };

    // First pass: collect all keys
    const processedRows = rows.map(r => {
      const obj = getExportObj(r);
      Object.keys(obj).forEach(k => allKeys.add(k));
      return { data: obj, _original: r };
    });

    const columns = Array.from(allKeys).map(key => ({
      header: key,
      key: key,
      width: 20 // Default width
    }));

    // Create Workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Data');

    worksheet.columns = columns;

    // Add rows and style them
    processedRows.forEach((item) => {
      const rowNode = worksheet.addRow(item.data);
      
      // Apply row color if present
      if (item._original.rowColor) {
        let color = item._original.rowColor.replace('#', '');
        // Ensure 6 chars
        if (color.length === 3) color = color.split('').map(c => c+c).join('');
        // ExcelJS expects ARGB
        const argb = 'FF' + color;

        // Apply fill to each cell in the row
        rowNode.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: argb }
          };
        });
      }
    });

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    
    // Auto-filter
    worksheet.autoFilter = {
      from: {
        row: 1,
        column: 1
      },
      to: {
        row: 1,
        column: columns.length
      }
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Set headers based on format
    const filename = `sales_export_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    if (format === 'csv') {
       // Fallback for CSV - colors not possible
       const csvBuffer = await workbook.csv.writeBuffer();
       res.setHeader('Content-Disposition', `attachment; filename="${filename.replace('.xlsx', '.csv')}"`);
       res.setHeader('Content-Type', 'text/csv');
       res.send(csvBuffer);
       return;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    console.error('Export rows error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export rows',
      error: error.message
    });
  }
};

/**
 * @desc    Import sales rows from Excel/CSV
 * @route   POST /api/sales/rows/import
 * @access  Private (requires canImport permission)
 */
export const importRows = async (req, res) => {
  try {
    const { data } = req.body; // Array of row objects
    const userId = req.user._id;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Import data array is required'
      });
    }

    const results = {
      success: [],
      failed: []
    };

    // Process each row
    for (let i = 0; i < data.length; i++) {
      try {
        const { standard, custom } = prepareRowForSave(data[i]);
        
        // Initialize row with standard fields
        const row = new SalesRow({
          ...standard,
          createdBy: userId,
          updatedBy: userId
        });

        // Explicitly set custom fields
        if (Object.keys(custom).length > 0) {
          Object.entries(custom).forEach(([key, value]) => {
            row.customFields.set(key, value);
          });
        }

        await row.save();
        results.success.push({ index: i, id: row._id });

        // Log activity
        await SalesActivityLog.logActivity({
          salesRow: row._id,
          user: userId,
          action: 'created',
          description: 'Imported from file',
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });
      } catch (error) {
        results.failed.push({
          index: i,
          data: data[i],
          error: error.message
        });
      }
    }

    // Emit real-time event
    if (results.success.length > 0) {
      io.to('sales').emit('sales:rows:imported', {
        count: results.success.length
      });
    }

    res.json({
      success: true,
      message: `Imported ${results.success.length} rows, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    console.error('Import rows error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import rows',
      error: error.message
    });
  }
};

/**
 * @desc    Get dropdown options for a column
 * @route   GET /api/sales/dropdowns/:columnName
 * @access  Private
 */
export const getDropdownOptions = async (req, res) => {
  try {
    const { columnName } = req.params;
    
    const options = await SalesDropdownOption.find({
      columnName,
      isActive: true
    }).sort({ displayOrder: 1 });

    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    console.error('Get dropdown options error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dropdown options',
      error: error.message
    });
  }
};

/**
 * @desc    Add new dropdown option
 * @route   POST /api/sales/dropdowns/:columnName
 * @access  Private (requires canManageDropdowns permission)
 */
export const addDropdownOption = async (req, res) => {
  try {
    const { columnName } = req.params;
    const { value, label, color } = req.body;
    const userId = req.user._id;

    // Get next display order
    const lastOption = await SalesDropdownOption.findOne({ columnName })
      .sort({ displayOrder: -1 });
    const displayOrder = lastOption ? lastOption.displayOrder + 1 : 0;

    const option = await SalesDropdownOption.create({
      columnName,
      value: value || label.toLowerCase().replace(/\s+/g, '_'),
      label,
      color,
      displayOrder,
      createdBy: userId
    });

    // Emit real-time event
    io.to('sales').emit('sales:dropdown:updated', { columnName, option });

    res.status(201).json({
      success: true,
      message: 'Dropdown option added successfully',
      data: option
    });
  } catch (error) {
    console.error('Add dropdown option error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to add dropdown option',
      error: error.message
    });
  }
};

/**
 * @desc    Update dropdown option
 * @route   PUT /api/sales/dropdowns/:columnName/:id
 * @access  Private (requires canManageDropdowns permission)
 */
export const updateDropdownOption = async (req, res) => {
  try {
    const { columnName, id } = req.params;
    const updates = req.body;

    const option = await SalesDropdownOption.findOneAndUpdate(
      { _id: id, columnName },
      updates,
      { new: true, runValidators: true }
    );

    if (!option) {
      return res.status(404).json({
        success: false,
        message: 'Dropdown option not found'
      });
    }

    // Emit real-time event
    io.to('sales').emit('sales:dropdown:updated', { columnName, option });

    res.json({
      success: true,
      message: 'Dropdown option updated successfully',
      data: option
    });
  } catch (error) {
    console.error('Update dropdown option error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update dropdown option',
      error: error.message
    });
  }
};

/**
 * @desc    Delete dropdown option
 * @route   DELETE /api/sales/dropdowns/:columnName/:id
 * @access  Private (requires canManageDropdowns permission)
 */
export const deleteDropdownOption = async (req, res) => {
  try {
    const { columnName, id } = req.params;

    // Soft delete by marking as inactive
    const option = await SalesDropdownOption.findOneAndUpdate(
      { _id: id, columnName },
      { isActive: false },
      { new: true }
    );

    if (!option) {
      return res.status(404).json({
        success: false,
        message: 'Dropdown option not found'
      });
    }

    // Emit real-time event
    io.to('sales').emit('sales:dropdown:updated', { columnName });

    res.json({
      success: true,
      message: 'Dropdown option deleted successfully'
    });
  } catch (error) {
    console.error('Delete dropdown option error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete dropdown option',
      error: error.message
    });
  }
};

/**
 * @desc    Get custom columns
 * @route   GET /api/sales/columns
 * @access  Private
 */
export const getCustomColumns = async (req, res) => {
  try {
    const columns = await SalesColumn.find({ isVisible: true })
      .sort({ displayOrder: 1 });

    res.json({
      success: true,
      data: columns
    });
  } catch (error) {
    console.error('Get custom columns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch custom columns',
      error: error.message
    });
  }
};

/**
 * @desc    Create custom column
 * @route   POST /api/sales/columns
 * @access  Private (requires canManageDropdowns permission)
 */
export const createCustomColumn = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get next display order
    const lastColumn = await SalesColumn.findOne().sort({ displayOrder: -1 });
    const displayOrder = lastColumn ? lastColumn.displayOrder + 1 : 0;

    const column = await SalesColumn.create({
      ...req.body,
      displayOrder,
      createdBy: userId
    });

    // Emit real-time event
    io.to('sales').emit('sales:column:created', { column });

    res.status(201).json({
      success: true,
      message: 'Custom column created successfully',
      data: column
    });
  } catch (error) {
    console.error('Create custom column error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to create custom column',
      error: error.message
    });
  }
};

/**
 * @desc    Get user permissions
 * @route   GET /api/sales/permissions/:userId
 * @access  Private (Admin or self)
 */
export const getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Only allow admin or the user themselves
    if (req.user.role !== 'admin' && req.user._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get user details to check role
    const User = (await import('../models/User.js')).default;
    const targetUser = await User.findById(userId).select('role');
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userRole = (targetUser.role || '').toLowerCase();

    // Admin gets default full access
    if (userRole === 'admin') {
      const defaultPermissions = {
        moduleVisible: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canExport: true,
        canImport: true,
        canManageDropdowns: true, // Only admin can manage dropdowns
        canViewActivityLog: true
      };
      
      return res.json({
        success: true,
        data: defaultPermissions
      });
    }

    // For other roles, get permissions or return with moduleVisible false
    try {
      const permissions = await SalesPermission.getUserPermissions(userId);
      res.json({
        success: true,
        data: permissions
      });
    } catch (permError) {
      // If no permission record, return default deny
      res.json({
        success: true,
        data: {
          moduleVisible: false,
          canCreate: false,
          canUpdate: false,
          canDelete: false,
          canExport: false,
          canImport: false,
          canManageDropdowns: false,
          canViewActivityLog: false
        }
      });
    }
  } catch (error) {
    console.error('Get user permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch permissions',
      error: error.message
    });
  }
};

/**
 * @desc    Update user permissions (Admin only)
 * @route   PUT /api/sales/permissions/:userId
 * @access  Private (Admin only)
 */
export const updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user._id;
    
    const permission = await SalesPermission.findOneAndUpdate(
      { user: userId },
      {
        ...req.body,
        grantedBy: adminId
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    res.json({
      success: true,
      message: 'Permissions updated successfully',
      data: permission
    });

    // Notify the specific user (if connected) about permission changes
    try {
      emitToUser(userId, 'sales:permissions:updated', { userId, permissions: permission });
      // If module access granted, create in-app notification and send Slack notification
      if (permission.moduleVisible) {
        try {
          // In-app notification
          await notificationService.createNotification({
            type: 'module_access',
            title: 'Sales Access Granted',
            message: `You have been granted access to the Sales module by ${req.user.name}`,
            user: userId,
            sender: adminId,
            priority: 'high',
            metadata: { module: 'Sales', url: '/sales' }
          });
        } catch (notifErr) {
          console.error('Failed to create in-app notification for sales access:', notifErr);
        }

        try {
          // Slack notification (non-blocking)
          slackNotificationService.sendNotification({
            userId,
            type: 'module_access',
            moduleName: 'Sales',
            triggeredBy: { name: req.user.name, _id: adminId },
            notes: permission.notes,
            priority: 'high',
            forceImmediate: true
          }).catch(err => console.error('Slack notification error:', err));
        } catch (err) {
          console.error('Failed to enqueue Slack module access notification:', err);
        }
      }
    } catch (emitErr) {
      console.error('Failed to emit sales permissions update:', emitErr);
    }
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to update permissions',
      error: error.message
    });
  }
};
