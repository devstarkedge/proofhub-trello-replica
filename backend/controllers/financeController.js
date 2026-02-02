import Board from '../models/Board.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Department from '../models/Department.js';
import User from '../models/User.js';

/**
 * Finance Controller - OPTIMIZED VERSION
 * Centralized finance calculations with single source of truth
 * All finance data is grouped by Department by default
 * 
 * OPTIMIZATION: Uses bulk queries and in-memory processing
 * instead of N+1 sequential database queries
 */

// ============================================
// HELPER: Calculate Payment Based on Billing Type
// ============================================
const calculatePayment = (project, totalBilledMinutes) => {
  if (!project) return 0;
  
  const billedHours = totalBilledMinutes / 60;
  
  if (project.billingCycle === 'fixed') {
    return project.fixedPrice || 0;
  } else if (project.billingCycle === 'hr') {
    return billedHours * (project.hourlyPrice || 0);
  }
  
  return 0;
};

// ============================================
// HELPER: Check if date is within range
// ============================================
const isWithinDateRange = (entryDate, filterStartDate, filterEndDate) => {
  if (!filterStartDate && !filterEndDate) return true;
  if (!entryDate) return false;
  const date = new Date(entryDate);
  if (filterStartDate && date < filterStartDate) return false;
  if (filterEndDate && date > filterEndDate) return false;
  return true;
};

// ============================================
// HELPER: Resolve user name from entry/user map
// ============================================
const resolveUserName = (entry, usersById) => {
  if (entry?.userName) return entry.userName;
  const userId = entry?.user?.toString();
  if (userId && usersById?.has(userId)) return usersById.get(userId);
  if (entry?.user?.name) return entry.user.name;
  return 'Unknown';
};

// ============================================
// HELPER: Build userId -> name lookup from time entries
// ============================================
const collectUserIds = (timeArray, idSet) => {
  if (!timeArray || !Array.isArray(timeArray)) return;
  for (const entry of timeArray) {
    const userId = entry?.user?.toString();
    if (userId) idSet.add(userId);
  }
};

const buildUserNameMap = async (cards, subtasks, nanos) => {
  const userIds = new Set();
  (cards || []).forEach(card => {
    collectUserIds(card.billedTime, userIds);
    collectUserIds(card.loggedTime, userIds);
  });
  (subtasks || []).forEach(subtask => {
    collectUserIds(subtask.billedTime, userIds);
    collectUserIds(subtask.loggedTime, userIds);
  });
  (nanos || []).forEach(nano => {
    collectUserIds(nano.billedTime, userIds);
    collectUserIds(nano.loggedTime, userIds);
  });

  if (userIds.size === 0) return new Map();

  const users = await User.find({ _id: { $in: Array.from(userIds) } })
    .select('name')
    .lean();

  const usersById = new Map();
  users.forEach(user => usersById.set(user._id.toString(), user.name));
  return usersById;
};

// ============================================
// HELPER: Aggregate time entries with date filtering
// ============================================
const aggregateTimeEntries = (timeArray, filterStartDate, filterEndDate, usersById) => {
  if (!timeArray || !Array.isArray(timeArray)) return { totalMinutes: 0, byUser: {} };
  
  let totalMinutes = 0;
  const byUser = {};
  
  for (const entry of timeArray) {
    if (!isWithinDateRange(entry.date, filterStartDate, filterEndDate)) continue;
    
    const minutes = ((entry.hours || 0) * 60) + (entry.minutes || 0);
    totalMinutes += minutes;
    
    const userId = entry.user?.toString();
    if (userId) {
      if (!byUser[userId]) {
        byUser[userId] = { billedMinutes: 0, userName: resolveUserName(entry, usersById) };
      }
      byUser[userId].billedMinutes += minutes;
    }
  }
  
  return { totalMinutes, byUser };
};

// ============================================
// HELPER: Build lookup maps for O(1) access
// ============================================
const buildLookupMaps = (cards, subtasks, nanos) => {
  // Cards by board ID
  const cardsByBoard = new Map();
  for (const card of cards) {
    const boardId = card.board?.toString();
    if (!boardId) continue;
    if (!cardsByBoard.has(boardId)) cardsByBoard.set(boardId, []);
    cardsByBoard.get(boardId).push(card);
  }
  
  // Subtasks by card ID
  const subtasksByCard = new Map();
  for (const subtask of subtasks) {
    const cardId = subtask.task?.toString();
    if (!cardId) continue;
    if (!subtasksByCard.has(cardId)) subtasksByCard.set(cardId, []);
    subtasksByCard.get(cardId).push(subtask);
  }
  
  // Nanos by subtask ID
  const nanosBySubtask = new Map();
  for (const nano of nanos) {
    const subtaskId = nano.subtask?.toString();
    if (!subtaskId) continue;
    if (!nanosBySubtask.has(subtaskId)) nanosBySubtask.set(subtaskId, []);
    nanosBySubtask.get(subtaskId).push(nano);
  }
  
  return { cardsByBoard, subtasksByCard, nanosBySubtask };
};

// ============================================
// GET: Dashboard Summary Statistics (OPTIMIZED)
// ============================================
export const getFinanceSummary = async (req, res) => {
  try {
    const { startDate, endDate, departmentId } = req.query;
    
    // Parse date filters
    const filterStartDate = startDate ? new Date(startDate) : null;
    const filterEndDate = endDate ? new Date(endDate) : null;
    
    // Build project filter
    const projectFilter = { isArchived: false };
    if (departmentId) projectFilter.department = departmentId;
    
    // OPTIMIZATION: Fetch ALL data in parallel with single queries
    const [projects, allCards, allSubtasks, allNanos] = await Promise.all([
      Board.find(projectFilter)
        .populate('department', 'name')
        .populate('members', 'name email')
        .lean(),
      Card.find({ isArchived: false }).select('board billedTime loggedTime').lean(),
      Subtask.find({}).select('task billedTime loggedTime').lean(),
      SubtaskNano.find({}).select('subtask billedTime loggedTime').lean()
    ]);

    const usersById = await buildUserNameMap(allCards, allSubtasks, allNanos);
    
    // Build lookup maps for O(1) access
    const { cardsByBoard, subtasksByCard, nanosBySubtask } = buildLookupMaps(
      allCards, allSubtasks, allNanos
    );
    
    // Aggregate all data in memory
    let totalRevenue = 0;
    let totalLoggedMinutes = 0;
    let totalBilledMinutes = 0;
    const userRevenue = {};
    const projectRevenue = {};
    
    for (const project of projects) {
      const projectId = project._id.toString();
      const cards = cardsByBoard.get(projectId) || [];
      
      let projectBilledMinutes = 0;
      let projectLoggedMinutes = 0;
      
      for (const card of cards) {
        const cardId = card._id.toString();
        
        // Card billed time
        const cardBilled = aggregateTimeEntries(card.billedTime, filterStartDate, filterEndDate, usersById);
        projectBilledMinutes += cardBilled.totalMinutes;
        
        // Merge user data
        for (const [userId, data] of Object.entries(cardBilled.byUser)) {
          if (!userRevenue[userId]) userRevenue[userId] = { billedMinutes: 0, userName: data.userName };
          userRevenue[userId].billedMinutes += data.billedMinutes;
        }
        
        // Card logged time
        const cardLogged = aggregateTimeEntries(card.loggedTime, filterStartDate, filterEndDate, usersById);
        projectLoggedMinutes += cardLogged.totalMinutes;
        
        // Process subtasks
        const subtasks = subtasksByCard.get(cardId) || [];
        for (const subtask of subtasks) {
          const subtaskId = subtask._id.toString();
          
          const subtaskBilled = aggregateTimeEntries(subtask.billedTime, filterStartDate, filterEndDate, usersById);
          projectBilledMinutes += subtaskBilled.totalMinutes;
          
          for (const [userId, data] of Object.entries(subtaskBilled.byUser)) {
            if (!userRevenue[userId]) userRevenue[userId] = { billedMinutes: 0, userName: data.userName };
            userRevenue[userId].billedMinutes += data.billedMinutes;
          }
          
          const subtaskLogged = aggregateTimeEntries(subtask.loggedTime, filterStartDate, filterEndDate, usersById);
          projectLoggedMinutes += subtaskLogged.totalMinutes;
          
          // Process nano-subtasks
          const nanos = nanosBySubtask.get(subtaskId) || [];
          for (const nano of nanos) {
            const nanoBilled = aggregateTimeEntries(nano.billedTime, filterStartDate, filterEndDate, usersById);
            projectBilledMinutes += nanoBilled.totalMinutes;
            
            for (const [userId, data] of Object.entries(nanoBilled.byUser)) {
              if (!userRevenue[userId]) userRevenue[userId] = { billedMinutes: 0, userName: data.userName };
              userRevenue[userId].billedMinutes += data.billedMinutes;
            }
            
            const nanoLogged = aggregateTimeEntries(nano.loggedTime, filterStartDate, filterEndDate, usersById);
            projectLoggedMinutes += nanoLogged.totalMinutes;
          }
        }
      }
      
      // Calculate project payment
      const projectPayment = calculatePayment(project, projectBilledMinutes);
      totalRevenue += projectPayment;
      totalBilledMinutes += projectBilledMinutes;
      totalLoggedMinutes += projectLoggedMinutes;
      
      projectRevenue[projectId] = {
        name: project.name,
        department: project.department?.name || 'Unassigned',
        payment: projectPayment,
        billedMinutes: projectBilledMinutes,
        loggedMinutes: projectLoggedMinutes
      };
    }
    
    // Find top earning user
    let topEarningUser = null;
    let maxUserRevenue = 0;
    for (const [userId, data] of Object.entries(userRevenue)) {
      if (data.billedMinutes > maxUserRevenue) {
        maxUserRevenue = data.billedMinutes;
        topEarningUser = { userId, userName: data.userName, billedMinutes: data.billedMinutes };
      }
    }
    
    // Find top revenue project
    let topRevenueProject = null;
    let maxProjectRevenue = 0;
    for (const [projectId, data] of Object.entries(projectRevenue)) {
      if (data.payment > maxProjectRevenue) {
        maxProjectRevenue = data.payment;
        topRevenueProject = { projectId, ...data };
      }
    }
    
    res.json({
      success: true,
      data: {
        totalRevenue,
        totalLoggedTime: {
          hours: Math.floor(totalLoggedMinutes / 60),
          minutes: totalLoggedMinutes % 60,
          totalMinutes: totalLoggedMinutes
        },
        totalBilledTime: {
          hours: Math.floor(totalBilledMinutes / 60),
          minutes: totalBilledMinutes % 60,
          totalMinutes: totalBilledMinutes
        },
        unbilledTime: {
          hours: Math.floor((totalLoggedMinutes - totalBilledMinutes) / 60),
          minutes: (totalLoggedMinutes - totalBilledMinutes) % 60,
          totalMinutes: totalLoggedMinutes - totalBilledMinutes
        },
        topEarningUser,
        topRevenueProject
      }
    });
  } catch (error) {
    console.error('Finance Summary Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: User-Centric Finance Data (OPTIMIZED)
// ============================================
export const getUserFinanceData = async (req, res) => {
  try {
    const { startDate, endDate, departmentId, userId } = req.query;
    
    // Parse date filters
    const filterStartDate = startDate ? new Date(startDate) : null;
    const filterEndDate = endDate ? new Date(endDate) : null;
    
    // Build project filter
    const projectFilter = { isArchived: false };
    if (departmentId) projectFilter.department = departmentId;
    
    // OPTIMIZATION: Fetch ALL data in parallel with single queries
    const [projects, allCards, allSubtasks, allNanos] = await Promise.all([
      Board.find(projectFilter)
        .populate('department', 'name')
        .lean(),
      Card.find({ isArchived: false }).select('board billedTime loggedTime').lean(),
      Subtask.find({}).select('task billedTime loggedTime').lean(),
      SubtaskNano.find({}).select('subtask billedTime loggedTime').lean()
    ]);

    const usersById = await buildUserNameMap(allCards, allSubtasks, allNanos);
    
    // Build lookup maps
    const { cardsByBoard, subtasksByCard, nanosBySubtask } = buildLookupMaps(
      allCards, allSubtasks, allNanos
    );
    
    // Create project lookup for quick access
    const projectMap = new Map();
    for (const project of projects) {
      projectMap.set(project._id.toString(), project);
    }
    
    // Group data by user
    const userData = {};
    
    // Helper to process time entries and update user data
    const processTimeEntries = (billedTime, loggedTime, project) => {
      const projectId = project._id.toString();
      
      // Process billed time
      if (billedTime) {
        for (const entry of billedTime) {
          if (!isWithinDateRange(entry.date, filterStartDate, filterEndDate)) continue;
          
          const uId = entry.user?.toString();
          if (!uId) continue;
          if (userId && uId !== userId) continue;
          
          if (!userData[uId]) {
            userData[uId] = {
              userId: uId,
              userName: resolveUserName(entry, usersById),
              projects: {},
              totalBilledMinutes: 0,
              totalLoggedMinutes: 0
            };
          }
          
          const minutes = ((entry.hours || 0) * 60) + (entry.minutes || 0);
          userData[uId].totalBilledMinutes += minutes;
          
          if (!userData[uId].projects[projectId]) {
            userData[uId].projects[projectId] = {
              projectId: projectId,
              projectName: project.name,
              department: project.department?.name || 'Unassigned',
              billingCycle: project.billingCycle,
              hourlyPrice: project.hourlyPrice,
              fixedPrice: project.fixedPrice,
              billedMinutes: 0,
              loggedMinutes: 0
            };
          }
          userData[uId].projects[projectId].billedMinutes += minutes;
        }
      }
      
      // Process logged time
      if (loggedTime) {
        for (const entry of loggedTime) {
          if (!isWithinDateRange(entry.date, filterStartDate, filterEndDate)) continue;
          
          const uId = entry.user?.toString();
          if (!uId) continue;
          if (userId && uId !== userId) continue;
          
          if (!userData[uId]) {
            userData[uId] = {
              userId: uId,
              userName: resolveUserName(entry, usersById),
              projects: {},
              totalBilledMinutes: 0,
              totalLoggedMinutes: 0
            };
          }
          
          const minutes = ((entry.hours || 0) * 60) + (entry.minutes || 0);
          userData[uId].totalLoggedMinutes += minutes;
          
          if (userData[uId].projects[projectId]) {
            userData[uId].projects[projectId].loggedMinutes += minutes;
          }
        }
      }
    };
    
    // Process all data
    for (const project of projects) {
      const projectId = project._id.toString();
      const cards = cardsByBoard.get(projectId) || [];
      
      for (const card of cards) {
        const cardId = card._id.toString();
        processTimeEntries(card.billedTime, card.loggedTime, project);
        
        const subtasks = subtasksByCard.get(cardId) || [];
        for (const subtask of subtasks) {
          const subtaskId = subtask._id.toString();
          processTimeEntries(subtask.billedTime, subtask.loggedTime, project);
          
          const nanos = nanosBySubtask.get(subtaskId) || [];
          for (const nano of nanos) {
            processTimeEntries(nano.billedTime, nano.loggedTime, project);
          }
        }
      }
    }
    
    // Transform to array and calculate payments
    const result = Object.values(userData).map(user => {
      const projectsArray = Object.values(user.projects).map(proj => ({
        ...proj,
        billedTime: {
          hours: Math.floor(proj.billedMinutes / 60),
          minutes: proj.billedMinutes % 60
        },
        loggedTime: {
          hours: Math.floor(proj.loggedMinutes / 60),
          minutes: proj.loggedMinutes % 60
        },
        payment: proj.billingCycle === 'hr' 
          ? (proj.billedMinutes / 60) * (proj.hourlyPrice || 0)
          : proj.fixedPrice || 0
      }));
      
      return {
        ...user,
        projects: projectsArray,
        totalBilledTime: {
          hours: Math.floor(user.totalBilledMinutes / 60),
          minutes: user.totalBilledMinutes % 60
        },
        totalLoggedTime: {
          hours: Math.floor(user.totalLoggedMinutes / 60),
          minutes: user.totalLoggedMinutes % 60
        },
        totalPayment: projectsArray.reduce((sum, p) => sum + p.payment, 0)
      };
    });
    
    // Group by department
    const groupedByDepartment = {};
    result.forEach(user => {
      user.projects.forEach(proj => {
        const dept = proj.department;
        if (!groupedByDepartment[dept]) {
          groupedByDepartment[dept] = [];
        }
        groupedByDepartment[dept].push({
          ...user,
          project: proj
        });
      });
    });
    
    res.json({
      success: true,
      data: result,
      groupedByDepartment
    });
  } catch (error) {
    console.error('User Finance Data Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: Project-Centric Finance Data (OPTIMIZED)
// ============================================
export const getProjectFinanceData = async (req, res) => {
  try {
    const { startDate, endDate, departmentId, projectId } = req.query;
    
    // Parse date filters
    const filterStartDate = startDate ? new Date(startDate) : null;
    const filterEndDate = endDate ? new Date(endDate) : null;
    
    // Build project filter
    const projectFilter = { isArchived: false };
    if (departmentId) projectFilter.department = departmentId;
    if (projectId) projectFilter._id = projectId;
    
    // OPTIMIZATION: Fetch ALL data in parallel with single queries
    const [projects, allCards, allSubtasks, allNanos] = await Promise.all([
      Board.find(projectFilter)
        .populate('department', 'name')
        .populate('members', 'name email avatar')
        .populate('owner', 'name email avatar')
        .lean(),
      Card.find({ isArchived: false }).select('board billedTime loggedTime title updatedAt').lean(),
      Subtask.find({}).select('task billedTime loggedTime title updatedAt').lean(),
      SubtaskNano.find({}).select('subtask billedTime loggedTime title updatedAt').lean()
    ]);

    const usersById = await buildUserNameMap(allCards, allSubtasks, allNanos);
    
    // Build lookup maps
    const { cardsByBoard, subtasksByCard, nanosBySubtask } = buildLookupMaps(
      allCards, allSubtasks, allNanos
    );
    
    const result = [];
    
    for (const project of projects) {
      const projectId = project._id.toString();
      const cards = cardsByBoard.get(projectId) || [];
      
      let projectBilledMinutes = 0;
      let projectLoggedMinutes = 0;
      let lastActivity = null;
      
      for (const card of cards) {
        const cardId = card._id.toString();
        
        // Track last activity
        if (!lastActivity || new Date(card.updatedAt) > new Date(lastActivity.date)) {
          lastActivity = { type: 'task', title: card.title, date: card.updatedAt };
        }
        
        // Aggregate times with date filtering
        const cardBilled = aggregateTimeEntries(card.billedTime, filterStartDate, filterEndDate, usersById);
        projectBilledMinutes += cardBilled.totalMinutes;
        
        const cardLogged = aggregateTimeEntries(card.loggedTime, filterStartDate, filterEndDate, usersById);
        projectLoggedMinutes += cardLogged.totalMinutes;
        
        // Process subtasks
        const subtasks = subtasksByCard.get(cardId) || [];
        for (const subtask of subtasks) {
          const subtaskId = subtask._id.toString();
          
          if (!lastActivity || new Date(subtask.updatedAt) > new Date(lastActivity.date)) {
            lastActivity = { type: 'subtask', title: subtask.title, date: subtask.updatedAt };
          }
          
          const subtaskBilled = aggregateTimeEntries(subtask.billedTime, filterStartDate, filterEndDate, usersById);
          projectBilledMinutes += subtaskBilled.totalMinutes;
          
          const subtaskLogged = aggregateTimeEntries(subtask.loggedTime, filterStartDate, filterEndDate, usersById);
          projectLoggedMinutes += subtaskLogged.totalMinutes;
          
          // Process nano-subtasks
          const nanos = nanosBySubtask.get(subtaskId) || [];
          for (const nano of nanos) {
            if (!lastActivity || new Date(nano.updatedAt) > new Date(lastActivity.date)) {
              lastActivity = { type: 'nano-subtask', title: nano.title, date: nano.updatedAt };
            }
            
            const nanoBilled = aggregateTimeEntries(nano.billedTime, filterStartDate, filterEndDate, usersById);
            projectBilledMinutes += nanoBilled.totalMinutes;
            
            const nanoLogged = aggregateTimeEntries(nano.loggedTime, filterStartDate, filterEndDate, usersById);
            projectLoggedMinutes += nanoLogged.totalMinutes;
          }
        }
      }
      
      // Calculate payment
      const payment = calculatePayment(project, projectBilledMinutes);
      
      // Get coordinators (members with specific roles) - for now use all members
      const coordinators = project.members || [];
      
      result.push({
        projectId: project._id,
        projectName: project.name,
        department: project.department?.name || 'Unassigned',
        departmentId: project.department?._id,
        startDate: project.startDate,
        endDate: project.dueDate,
        estimatedTime: project.estimatedTime,
        projectSource: project.projectSource,
        upworkId: project.upworkId,
        projectCategory: project.projectCategory,
        billingCycle: project.billingCycle,
        hourlyPrice: project.hourlyPrice,
        fixedPrice: project.fixedPrice,
        status: project.status,
        clientInfo: project.clientDetails,
        coordinators: coordinators.slice(0, 5), // Limit for performance
        coordinatorCount: coordinators.length,
        loggedTime: {
          hours: Math.floor(projectLoggedMinutes / 60),
          minutes: projectLoggedMinutes % 60,
          totalMinutes: projectLoggedMinutes
        },
        billedTime: {
          hours: Math.floor(projectBilledMinutes / 60),
          minutes: projectBilledMinutes % 60,
          totalMinutes: projectBilledMinutes
        },
        payment,
        lastActivity
      });
    }
    
    // Group by department
    const groupedByDepartment = {};
    result.forEach(project => {
      const dept = project.department;
      if (!groupedByDepartment[dept]) {
        groupedByDepartment[dept] = [];
      }
      groupedByDepartment[dept].push(project);
    });
    
    res.json({
      success: true,
      data: result,
      groupedByDepartment
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
    
    res.json({
      success: true,
      data: departments
    });
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
    // OPTIMIZATION: Fetch all filter options in parallel
    const [departments, users, projects] = await Promise.all([
      Department.find({ isActive: true })
        .select('name')
        .sort({ name: 1 })
        .lean(),
      User.find({ isActive: true })
        .select('name email')
        .sort({ name: 1 })
        .lean(),
      Board.find({ isArchived: false })
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
          { value: 'hr', label: 'Hourly' },
          { value: 'fixed', label: 'Fixed' }
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
// GET: Weekly Report Data (OPTIMIZED)
// ============================================
export const getWeeklyReportData = async (req, res) => {
  try {
    const { year, month, departmentId, viewType = 'users' } = req.query;
    
    const targetYear = parseInt(year) || new Date().getFullYear();
    const targetMonth = parseInt(month) ?? new Date().getMonth();
    
    // Calculate weeks of the month
    const weeks = getWeeksOfMonth(targetYear, targetMonth);
    
    // Build project filter
    const projectFilter = { isArchived: false };
    if (departmentId) projectFilter.department = departmentId;
    
    // OPTIMIZATION: Fetch ALL data in parallel with single queries
    const [projects, allCards, allSubtasks, allNanos] = await Promise.all([
      Board.find(projectFilter)
        .populate('department', 'name')
        .populate('members', 'name email avatar')
        .lean(),
      Card.find({ isArchived: false }).select('board billedTime loggedTime').lean(),
      Subtask.find({}).select('task billedTime loggedTime').lean(),
      SubtaskNano.find({}).select('subtask billedTime loggedTime').lean()
    ]);

    const usersById = await buildUserNameMap(allCards, allSubtasks, allNanos);
    
    // Build lookup maps
    const { cardsByBoard, subtasksByCard, nanosBySubtask } = buildLookupMaps(
      allCards, allSubtasks, allNanos
    );
    
    // Create project lookup for quick access
    const projectMap = new Map();
    for (const project of projects) {
      projectMap.set(project._id.toString(), project);
    }
    
    // Process each week
    const weeklyData = [];
    
    for (const week of weeks) {
      const weekResult = {
        week: week.week,
        label: week.label,
        startDate: week.start,
        endDate: week.end,
        totalPayment: 0,
        totalBilledMinutes: 0,
        totalLoggedMinutes: 0,
        items: []
      };
      
      if (viewType === 'users') {
        // User-centric weekly data
        const userData = {};
        
        for (const project of projects) {
          const projectId = project._id.toString();
          const cards = cardsByBoard.get(projectId) || [];
          
          for (const card of cards) {
            const cardId = card._id.toString();
            
            // Process billed time entries within week range
            if (card.billedTime) {
              for (const entry of card.billedTime) {
                const entryDate = new Date(entry.date);
                if (entryDate >= week.start && entryDate <= week.end) {
                  const uId = entry.user?.toString();
                  if (!uId) continue;
                  
                  if (!userData[uId]) {
                    userData[uId] = {
                      userId: uId,
                      userName: resolveUserName(entry, usersById),
                      billedMinutes: 0,
                      loggedMinutes: 0,
                      projects: new Set()
                    };
                  }
                  
                  const mins = ((entry.hours || 0) * 60) + (entry.minutes || 0);
                  userData[uId].billedMinutes += mins;
                  userData[uId].projects.add(projectId);
                  weekResult.totalBilledMinutes += mins;
                }
              }
            }
            
            // Process logged time entries within week range
            if (card.loggedTime) {
              for (const entry of card.loggedTime) {
                const entryDate = new Date(entry.date);
                if (entryDate >= week.start && entryDate <= week.end) {
                  const uId = entry.user?.toString();
                  if (!uId) continue;
                  
                  if (!userData[uId]) {
                    userData[uId] = {
                      userId: uId,
                      userName: resolveUserName(entry, usersById),
                      billedMinutes: 0,
                      loggedMinutes: 0,
                      projects: new Set()
                    };
                  }
                  
                  const mins = ((entry.hours || 0) * 60) + (entry.minutes || 0);
                  userData[uId].loggedMinutes += mins;
                  weekResult.totalLoggedMinutes += mins;
                }
              }
            }
            
            // Process subtasks
            const subtasks = subtasksByCard.get(cardId) || [];
            for (const subtask of subtasks) {
              const subtaskId = subtask._id.toString();
              
              if (subtask.billedTime) {
                for (const entry of subtask.billedTime) {
                  const entryDate = new Date(entry.date);
                  if (entryDate >= week.start && entryDate <= week.end) {
                    const uId = entry.user?.toString();
                    if (!uId) continue;
                    
                    if (!userData[uId]) {
                      userData[uId] = {
                        userId: uId,
                        userName: resolveUserName(entry, usersById),
                        billedMinutes: 0,
                        loggedMinutes: 0,
                        projects: new Set()
                      };
                    }
                    
                    const mins = ((entry.hours || 0) * 60) + (entry.minutes || 0);
                    userData[uId].billedMinutes += mins;
                    userData[uId].projects.add(projectId);
                    weekResult.totalBilledMinutes += mins;
                  }
                }
              }
              
              // Nano subtasks
              const nanos = nanosBySubtask.get(subtaskId) || [];
              for (const nano of nanos) {
                if (nano.billedTime) {
                  for (const entry of nano.billedTime) {
                    const entryDate = new Date(entry.date);
                    if (entryDate >= week.start && entryDate <= week.end) {
                      const uId = entry.user?.toString();
                      if (!uId) continue;
                      
                      if (!userData[uId]) {
                        userData[uId] = {
                          userId: uId,
                          userName: resolveUserName(entry, usersById),
                          billedMinutes: 0,
                          loggedMinutes: 0,
                          projects: new Set()
                        };
                      }
                      
                      const mins = ((entry.hours || 0) * 60) + (entry.minutes || 0);
                      userData[uId].billedMinutes += mins;
                      userData[uId].projects.add(projectId);
                      weekResult.totalBilledMinutes += mins;
                    }
                  }
                }
              }
            }
          }
        }
        
        // Calculate payments for users
        weekResult.items = Object.values(userData).map(u => {
          // Calculate average hourly rate across projects (simplified)
          const avgRate = 25; // Default rate, should be calculated from actual project rates
          const payment = (u.billedMinutes / 60) * avgRate;
          weekResult.totalPayment += payment;
          
          return {
            userId: u.userId,
            userName: u.userName,
            billedMinutes: u.billedMinutes,
            loggedMinutes: u.loggedMinutes,
            projectCount: u.projects.size,
            payment
          };
        }).sort((a, b) => b.payment - a.payment);
        
      } else {
        // Project-centric weekly data
        for (const project of projects) {
          const projectId = project._id.toString();
          let projectBilledMinutes = 0;
          let projectLoggedMinutes = 0;
          
          const cards = cardsByBoard.get(projectId) || [];
          
          for (const card of cards) {
            const cardId = card._id.toString();
            
            // Process billed time entries within week range
            if (card.billedTime) {
              for (const entry of card.billedTime) {
                const entryDate = new Date(entry.date);
                if (entryDate >= week.start && entryDate <= week.end) {
                  const mins = ((entry.hours || 0) * 60) + (entry.minutes || 0);
                  projectBilledMinutes += mins;
                }
              }
            }
            
            if (card.loggedTime) {
              for (const entry of card.loggedTime) {
                const entryDate = new Date(entry.date);
                if (entryDate >= week.start && entryDate <= week.end) {
                  const mins = ((entry.hours || 0) * 60) + (entry.minutes || 0);
                  projectLoggedMinutes += mins;
                }
              }
            }
            
            // Process subtasks
            const subtasks = subtasksByCard.get(cardId) || [];
            for (const subtask of subtasks) {
              const subtaskId = subtask._id.toString();
              
              if (subtask.billedTime) {
                for (const entry of subtask.billedTime) {
                  const entryDate = new Date(entry.date);
                  if (entryDate >= week.start && entryDate <= week.end) {
                    const mins = ((entry.hours || 0) * 60) + (entry.minutes || 0);
                    projectBilledMinutes += mins;
                  }
                }
              }
              
              // Nano subtasks
              const nanos = nanosBySubtask.get(subtaskId) || [];
              for (const nano of nanos) {
                if (nano.billedTime) {
                  for (const entry of nano.billedTime) {
                    const entryDate = new Date(entry.date);
                    if (entryDate >= week.start && entryDate <= week.end) {
                      const mins = ((entry.hours || 0) * 60) + (entry.minutes || 0);
                      projectBilledMinutes += mins;
                    }
                  }
                }
              }
            }
          }
          
          // Only include project if it has data for this week
          if (projectBilledMinutes > 0 || projectLoggedMinutes > 0) {
            const payment = calculatePayment(project, projectBilledMinutes);
            
            weekResult.items.push({
              projectId: project._id,
              projectName: project.name,
              department: project.department?.name || 'Unassigned',
              billingCycle: project.billingCycle,
              billedMinutes: projectBilledMinutes,
              loggedMinutes: projectLoggedMinutes,
              payment
            });
            
            weekResult.totalBilledMinutes += projectBilledMinutes;
            weekResult.totalLoggedMinutes += projectLoggedMinutes;
            weekResult.totalPayment += payment;
          }
        }
        
        weekResult.items.sort((a, b) => b.payment - a.payment);
      }
      
      weeklyData.push(weekResult);
    }
    
    // Calculate monthly totals
    const monthlyTotals = {
      totalPayment: weeklyData.reduce((sum, w) => sum + w.totalPayment, 0),
      totalBilledMinutes: weeklyData.reduce((sum, w) => sum + w.totalBilledMinutes, 0),
      totalLoggedMinutes: weeklyData.reduce((sum, w) => sum + w.totalLoggedMinutes, 0)
    };
    
    res.json({
      success: true,
      data: {
        year: targetYear,
        month: targetMonth,
        weeks: weeklyData,
        monthlyTotals
      }
    });
  } catch (error) {
    console.error('Weekly Report Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper: Get weeks of a month
const getWeeksOfMonth = (year, month) => {
  const weeks = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  let currentWeek = 1;
  let weekStart = new Date(firstDay);
  
  // Adjust to start from Monday
  const dayOfWeek = weekStart.getDay();
  if (dayOfWeek !== 1) {
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    weekStart.setDate(weekStart.getDate() + diff);
  }
  
  while (weekStart <= lastDay && currentWeek <= 5) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    
    weeks.push({
      week: currentWeek,
      label: `Week ${currentWeek}`,
      start: new Date(weekStart),
      end: weekEnd > lastDay ? new Date(lastDay.setHours(23, 59, 59, 999)) : weekEnd
    });
    
    weekStart.setDate(weekStart.getDate() + 7);
    currentWeek++;
  }
  
  return weeks;
};

// ============================================
// GET: User Contributions per Project (OPTIMIZED)
// ============================================
export const getUserContributions = async (req, res) => {
  try {
    const { projectId } = req.params;
    
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'Project ID required' });
    }
    
    // OPTIMIZATION: Fetch all data in parallel
    const [project, cards, subtasks] = await Promise.all([
      Board.findById(projectId)
        .populate('department', 'name')
        .lean(),
      Card.find({ board: projectId, isArchived: false }).lean(),
      Subtask.find({}).select('task billedTime loggedTime').lean()
    ]);
    
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }
    
    // Get all card IDs for this project
    const cardIds = new Set(cards.map(c => c._id.toString()));
    
    // Filter subtasks to only those belonging to this project's cards
    const projectSubtasks = subtasks.filter(s => cardIds.has(s.task?.toString()));
    const subtaskIds = new Set(projectSubtasks.map(s => s._id.toString()));
    
    // Get nano subtasks for project's subtasks
    const nanos = await SubtaskNano.find({
      subtask: { $in: Array.from(subtaskIds).map(id => id) }
    }).lean();

    const usersById = await buildUserNameMap(cards, projectSubtasks, nanos);
    
    // Aggregate user contributions
    const userContributions = {};
    
    // Process cards
    for (const card of cards) {
      if (card.billedTime) {
        for (const entry of card.billedTime) {
          const uId = entry.user?.toString();
          if (!uId) continue;
          
          if (!userContributions[uId]) {
            userContributions[uId] = {
              userId: uId,
              userName: resolveUserName(entry, usersById),
              billedMinutes: 0,
              loggedMinutes: 0,
              taskCount: 0,
              lastActivity: null
            };
          }
          
          userContributions[uId].billedMinutes += ((entry.hours || 0) * 60) + (entry.minutes || 0);
          userContributions[uId].taskCount++;
          
          if (!userContributions[uId].lastActivity || new Date(entry.date) > new Date(userContributions[uId].lastActivity)) {
            userContributions[uId].lastActivity = entry.date;
          }
        }
      }
      
      if (card.loggedTime) {
        for (const entry of card.loggedTime) {
          const uId = entry.user?.toString();
          if (!uId) continue;
          
          if (!userContributions[uId]) {
            userContributions[uId] = {
              userId: uId,
              userName: resolveUserName(entry, usersById),
              billedMinutes: 0,
              loggedMinutes: 0,
              taskCount: 0,
              lastActivity: null
            };
          }
          
          userContributions[uId].loggedMinutes += ((entry.hours || 0) * 60) + (entry.minutes || 0);
        }
      }
    }
    
    // Process subtasks
    for (const subtask of projectSubtasks) {
      if (subtask.billedTime) {
        for (const entry of subtask.billedTime) {
          const uId = entry.user?.toString();
          if (!uId) continue;
          
          if (!userContributions[uId]) {
            userContributions[uId] = {
              userId: uId,
              userName: resolveUserName(entry, usersById),
              billedMinutes: 0,
              loggedMinutes: 0,
              taskCount: 0,
              lastActivity: null
            };
          }
          
          userContributions[uId].billedMinutes += ((entry.hours || 0) * 60) + (entry.minutes || 0);
          userContributions[uId].taskCount++;
          
          if (!userContributions[uId].lastActivity || new Date(entry.date) > new Date(userContributions[uId].lastActivity)) {
            userContributions[uId].lastActivity = entry.date;
          }
        }
      }
    }
    
    // Process nano subtasks
    for (const nano of nanos) {
      if (nano.billedTime) {
        for (const entry of nano.billedTime) {
          const uId = entry.user?.toString();
          if (!uId) continue;
          
          if (!userContributions[uId]) {
            userContributions[uId] = {
              userId: uId,
              userName: resolveUserName(entry, usersById),
              billedMinutes: 0,
              loggedMinutes: 0,
              taskCount: 0,
              lastActivity: null
            };
          }
          
          userContributions[uId].billedMinutes += ((entry.hours || 0) * 60) + (entry.minutes || 0);
          userContributions[uId].taskCount++;
        }
      }
    }
    
    // Calculate payments
    const contributions = Object.values(userContributions).map(u => ({
      ...u,
      billedTime: {
        hours: Math.floor(u.billedMinutes / 60),
        minutes: u.billedMinutes % 60
      },
      loggedTime: {
        hours: Math.floor(u.loggedMinutes / 60),
        minutes: u.loggedMinutes % 60
      },
      payment: project.billingCycle === 'hr' 
        ? (u.billedMinutes / 60) * (project.hourlyPrice || 0)
        : 0 // Fixed projects don't have per-user payment
    })).sort((a, b) => b.billedMinutes - a.billedMinutes);
    
    res.json({
      success: true,
      data: {
        project: {
          id: project._id,
          name: project.name,
          department: project.department?.name,
          billingCycle: project.billingCycle,
          hourlyPrice: project.hourlyPrice,
          fixedPrice: project.fixedPrice
        },
        contributions,
        totalContributors: contributions.length
      }
    });
  } catch (error) {
    console.error('User Contributions Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// GET: Year-Wide Weekly Data for Week-Wise Reporting Mode
// ============================================
export const getYearWideWeeklyData = async (req, res) => {
  try {
    const { year, viewType = 'users', departmentId } = req.query;
    
    const targetYear = parseInt(year) || new Date().getFullYear();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Build project filter
    const projectFilter = { isArchived: false };
    if (departmentId) projectFilter.department = departmentId;
    
    // OPTIMIZATION: Fetch ALL data in parallel with single queries
    const [projects, allCards, allSubtasks, allNanos] = await Promise.all([
      Board.find(projectFilter)
        .populate('department', 'name')
        .populate('members', 'name email avatar')
        .lean(),
      Card.find({ isArchived: false }).select('board billedTime loggedTime').lean(),
      Subtask.find({}).select('task billedTime loggedTime').lean(),
      SubtaskNano.find({}).select('subtask billedTime loggedTime').lean()
    ]);
    
    // Build lookup maps
    const { cardsByBoard, subtasksByCard, nanosBySubtask } = buildLookupMaps(
      allCards, allSubtasks, allNanos
    );
    
    // Build user name map for resolving user names in time entries
    const usersById = await buildUserNameMap(allCards, allSubtasks, allNanos);
    
    // Create project lookup for quick access
    const projectMap = new Map();
    for (const project of projects) {
      projectMap.set(project._id.toString(), project);
    }
    
    // Result structure: months with week-wise breakdowns
    const monthsData = [];
    let yearTotalPayment = 0;
    
    // Process each month
    for (let month = 0; month < 12; month++) {
      const weeks = getWeeksOfMonth(targetYear, month);
      const monthResult = {
        month,
        monthName: monthNames[month],
        hasData: false,
        weeks: [],
        totalPayment: 0,
        items: []
      };
      
      if (viewType === 'users') {
        // User-centric data: aggregate by user -> month -> week
        // Also track project-level weekly data within each user
        const userData = {};
        
        for (const project of projects) {
          const projectId = project._id.toString();
          const cards = cardsByBoard.get(projectId) || [];
          
          for (const card of cards) {
            const cardId = card._id.toString();
            
            // Process billed time entries
            const processTimeEntry = (entry, isCard = true) => {
              const entryDate = new Date(entry.date);
              if (entryDate.getFullYear() !== targetYear) return;
              if (entryDate.getMonth() !== month) return;
              
              const uId = entry.user?.toString();
              if (!uId) return;
              
              // Find which week this entry belongs to
              let weekNum = null;
              for (const w of weeks) {
                if (entryDate >= w.start && entryDate <= w.end) {
                  weekNum = w.week;
                  break;
                }
              }
              if (!weekNum) return;
              
              if (!userData[uId]) {
                userData[uId] = {
                  userId: uId,
                  userName: resolveUserName(entry, usersById),
                  weeks: {},
                  projects: {} // Track project-level weekly data
                };
              }
              
              if (!userData[uId].weeks[weekNum]) {
                userData[uId].weeks[weekNum] = { billedMinutes: 0, payment: 0 };
              }
              
              // Track project-level data
              if (!userData[uId].projects[projectId]) {
                userData[uId].projects[projectId] = {
                  projectId: projectId,
                  projectName: project.name,
                  billingCycle: project.billingCycle,
                  hourlyPrice: project.hourlyPrice,
                  weeks: {}
                };
              }
              
              if (!userData[uId].projects[projectId].weeks[weekNum]) {
                userData[uId].projects[projectId].weeks[weekNum] = { billedMinutes: 0, payment: 0 };
              }
              
              const mins = ((entry.hours || 0) * 60) + (entry.minutes || 0);
              userData[uId].weeks[weekNum].billedMinutes += mins;
              userData[uId].projects[projectId].weeks[weekNum].billedMinutes += mins;
              
              // Calculate payment based on project billing
              if (project.billingCycle === 'hr') {
                const payment = (mins / 60) * (project.hourlyPrice || 0);
                userData[uId].weeks[weekNum].payment += payment;
                userData[uId].projects[projectId].weeks[weekNum].payment += payment;
              }
            };
            
            // Process card billed time
            if (card.billedTime) {
              for (const entry of card.billedTime) {
                processTimeEntry(entry);
              }
            }
            
            // Process subtasks
            const subtasks = subtasksByCard.get(cardId) || [];
            for (const subtask of subtasks) {
              const subtaskId = subtask._id.toString();
              
              if (subtask.billedTime) {
                for (const entry of subtask.billedTime) {
                  processTimeEntry(entry, false);
                }
              }
              
              // Process nano subtasks
              const nanos = nanosBySubtask.get(subtaskId) || [];
              for (const nano of nanos) {
                if (nano.billedTime) {
                  for (const entry of nano.billedTime) {
                    processTimeEntry(entry, false);
                  }
                }
              }
            }
          }
        }
        
        // Build week-wise data for this month
        for (let w = 1; w <= 5; w++) {
          let weekPayment = 0;
          let weekBilledMinutes = 0;
          
          Object.values(userData).forEach(u => {
            if (u.weeks[w]) {
              weekPayment += u.weeks[w].payment;
              weekBilledMinutes += u.weeks[w].billedMinutes;
            }
          });
          
          const weekExists = weeks.find(wk => wk.week === w);
          monthResult.weeks.push({
            week: w,
            payment: weekExists ? weekPayment : null,
            billedMinutes: weekExists ? weekBilledMinutes : null,
            hasData: weekExists && (weekPayment > 0 || weekBilledMinutes > 0)
          });
          
          if (weekExists && weekPayment > 0) {
            monthResult.totalPayment += weekPayment;
            monthResult.hasData = true;
          }
        }
        
        // Build user items with their week breakdown AND project breakdown
        monthResult.items = Object.values(userData)
          .filter(u => Object.keys(u.weeks).length > 0)
          .map(u => {
            const weekData = [];
            let userTotalPayment = 0;
            
            for (let w = 1; w <= 5; w++) {
              const weekInfo = u.weeks[w];
              const payment = weekInfo ? weekInfo.payment : null;
              weekData.push(payment);
              if (payment) userTotalPayment += payment;
            }
            
            // Process project-level weekly data
            const projectsData = Object.values(u.projects).map(proj => {
              const projWeekData = [];
              let projTotalPayment = 0;
              
              for (let w = 1; w <= 5; w++) {
                const weekInfo = proj.weeks[w];
                const payment = weekInfo ? weekInfo.payment : null;
                projWeekData.push(payment);
                if (payment) projTotalPayment += payment;
              }
              
              return {
                projectId: proj.projectId,
                projectName: proj.projectName,
                billingCycle: proj.billingCycle,
                hourlyPrice: proj.hourlyPrice,
                weeks: projWeekData,
                totalPayment: projTotalPayment
              };
            }).filter(p => p.totalPayment > 0);
            
            return {
              userId: u.userId,
              userName: u.userName,
              weeks: weekData,
              totalPayment: userTotalPayment,
              projects: projectsData  // Include project-level breakdown
            };
          })
          .sort((a, b) => b.totalPayment - a.totalPayment);
          
      } else {
        // Project-centric data: aggregate by project -> month -> week
        for (const project of projects) {
          const projectId = project._id.toString();
          const cards = cardsByBoard.get(projectId) || [];
          
          const projectWeeks = {};
          
          for (const card of cards) {
            const cardId = card._id.toString();
            
            const processTimeEntry = (entry) => {
              const entryDate = new Date(entry.date);
              if (entryDate.getFullYear() !== targetYear) return;
              if (entryDate.getMonth() !== month) return;
              
              // Find which week this entry belongs to
              let weekNum = null;
              for (const w of weeks) {
                if (entryDate >= w.start && entryDate <= w.end) {
                  weekNum = w.week;
                  break;
                }
              }
              if (!weekNum) return;
              
              if (!projectWeeks[weekNum]) {
                projectWeeks[weekNum] = { billedMinutes: 0 };
              }
              
              const mins = ((entry.hours || 0) * 60) + (entry.minutes || 0);
              projectWeeks[weekNum].billedMinutes += mins;
            };
            
            // Process card billed time
            if (card.billedTime) {
              for (const entry of card.billedTime) {
                processTimeEntry(entry);
              }
            }
            
            // Process subtasks
            const subtasks = subtasksByCard.get(cardId) || [];
            for (const subtask of subtasks) {
              const subtaskId = subtask._id.toString();
              
              if (subtask.billedTime) {
                for (const entry of subtask.billedTime) {
                  processTimeEntry(entry);
                }
              }
              
              // Process nano subtasks
              const nanos = nanosBySubtask.get(subtaskId) || [];
              for (const nano of nanos) {
                if (nano.billedTime) {
                  for (const entry of nano.billedTime) {
                    processTimeEntry(entry);
                  }
                }
              }
            }
          }
          
          // Only include project if it has data for this month
          if (Object.keys(projectWeeks).length > 0) {
            const weekData = [];
            let projectTotalPayment = 0;
            
            for (let w = 1; w <= 5; w++) {
              const weekInfo = projectWeeks[w];
              const weekExists = weeks.find(wk => wk.week === w);
              
              let payment = null;
              if (weekExists && weekInfo) {
                payment = calculatePayment(project, weekInfo.billedMinutes);
              }
              
              weekData.push(payment);
              if (payment) projectTotalPayment += payment;
            }
            
            if (projectTotalPayment > 0) {
              monthResult.items.push({
                projectId: project._id,
                projectName: project.name,
                department: project.department?.name || 'Unassigned',
                billingCycle: project.billingCycle,
                weeks: weekData,
                totalPayment: projectTotalPayment
              });
              
              monthResult.hasData = true;
            }
          }
        }
        
        // Update month week totals from project items
        for (let w = 0; w < 5; w++) {
          let weekPayment = 0;
          let hasSomeData = false;
          
          monthResult.items.forEach(item => {
            if (item.weeks[w] !== null) {
              weekPayment += item.weeks[w];
              hasSomeData = true;
            }
          });
          
          const weekExists = weeks.find(wk => wk.week === w + 1);
          monthResult.weeks.push({
            week: w + 1,
            payment: weekExists ? weekPayment : null,
            hasData: hasSomeData
          });
          
          if (weekExists) {
            monthResult.totalPayment += weekPayment;
          }
        }
        
        monthResult.items.sort((a, b) => b.totalPayment - a.totalPayment);
      }
      
      yearTotalPayment += monthResult.totalPayment;
      
      // Only include months that have data
      if (monthResult.hasData) {
        monthsData.push(monthResult);
      }
    }
    
    res.json({
      success: true,
      data: {
        year: targetYear,
        viewType,
        months: monthsData,
        yearTotal: yearTotalPayment
      }
    });
  } catch (error) {
    console.error('Year-Wide Weekly Data Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
