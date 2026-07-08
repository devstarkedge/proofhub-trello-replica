import Board from '../models/Board.js';
import Department from '../models/Department.js';
import User from '../models/User.js';
import {
  buildFinanceSummary,
  buildProjectFinanceReport,
  buildUserFinanceReport,
  buildWeeklyFinanceReport,
  buildUserContributionsReport,
  buildYearWideWeeklyReport,
  getFinancePermittedUserIds
} from '../services/finance/financeReportService.js';

/**
 * Finance Controller
 * Thin route handlers around the centralized finance report service.
 */

const sendReport = (res, payload, extra = {}) => {
  res.json({
    success: true,
    ...extra,
    ...payload
  });
};

// ============================================
// GET: Dashboard Summary Statistics
// ============================================
export const getFinanceSummary = async (req, res) => {
  try {
    const data = await buildFinanceSummary(req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Finance Summary Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: User-Centric Finance Data
// ============================================
export const getUserFinanceData = async (req, res) => {
  try {
    const report = await buildUserFinanceReport(req.query);
    sendReport(res, {
      data: report.data,
      groupedByDepartment: report.groupedByDepartment,
      summary: report.summary
    });
  } catch (error) {
    console.error('User Finance Data Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: Project-Centric Finance Data
// ============================================
export const getProjectFinanceData = async (req, res) => {
  try {
    const report = await buildProjectFinanceReport(req.query);
    sendReport(res, {
      data: report.data,
      groupedByDepartment: report.groupedByDepartment,
      summary: report.summary
    });
  } catch (error) {
    console.error('Project Finance Data Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: All Departments (for filtering)
// ============================================
export const getFinanceDepartments = async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true })
      .select('name description')
      .sort({ name: 1 })
      .lean();

    res.json({ success: true, data: departments });
  } catch (error) {
    console.error('Finance Departments Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: Filter Options
// ============================================
export const getFinanceFilterOptions = async (req, res) => {
  try {
    const permittedUserIds = await getFinancePermittedUserIds();

    const [departments, users, projects] = await Promise.all([
      Department.find({ isActive: true })
        .select('name')
        .sort({ name: 1 })
        .lean(),
      User.find({ _id: { $in: Array.from(permittedUserIds) }, isActive: true })
        .select('name email')
        .sort({ name: 1 })
        .lean(),
      Board.find({
        isArchived: false,
        isDeleted: { $ne: true },
        projectType: 'Hired Client',
        billingCycle: { $in: ['fixed', 'hr', 'hourly'] }
      })
        .select('name department billingCycle')
        .populate('department', 'name')
        .sort({ name: 1 })
        .lean()
    ]);

    res.json({
      success: true,
      data: {
        departments,
        users,
        projects,
        billingTypes: [
          { value: 'all', label: 'All' },
          { value: 'fixed', label: 'Fixed' },
          { value: 'hourly', label: 'Hourly' },
          { value: 'hr', label: 'Hourly (legacy)' }
        ],
        projectSources: [
          { value: 'Upwork', label: 'Upwork' },
          { value: 'Direct', label: 'Direct' },
          { value: 'Contra', label: 'Contra' }
        ]
      }
    });
  } catch (error) {
    console.error('Finance Filter Options Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: Weekly Report Data
// ============================================
export const getWeeklyReportData = async (req, res) => {
  try {
    const data = await buildWeeklyFinanceReport(req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Weekly Report Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: User Contributions per Project
// ============================================
export const getUserContributions = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Project ID required' });
    }

    const data = await buildUserContributionsReport(projectId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    return res.json({ success: true, data });
  } catch (error) {
    console.error('User Contributions Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: Year/Month Weekly Data for Week-Wise Reporting Mode
// ============================================
export const getYearWideWeeklyData = async (req, res) => {
  try {
    const data = await buildYearWideWeeklyReport(req.query);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Year-Wide Weekly Data Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
