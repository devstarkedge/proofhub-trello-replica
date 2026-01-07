import Team from '../models/Team.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { invalidateCache } from '../middleware/cache.js';
import { slackHooks } from '../utils/slackHooks.js';

// @desc    Get teams for current user
// @route   GET /api/teams
// @access  Private
export const getTeams = asyncHandler(async (req, res, next) => {
  let teams;

  if (req.query.department) {
    // Filter teams by department if department query parameter is provided
    teams = await Team.find({
      members: req.user.id,
      department: req.query.department
    })
      .populate('owner', 'name email')
      .populate('members', 'name email')
      .populate('department', 'name')
      .sort('name');
  } else {
    // Get all teams for the user if no department filter
    teams = await Team.find({ members: req.user.id })
      .populate('owner', 'name email')
      .populate('members', 'name email')
      .populate('department', 'name')
      .sort('name');
  }

  res.status(200).json({
    success: true,
    count: teams.length,
    data: teams
  });
});

// @desc    Get single team
// @route   GET /api/teams/:id
// @access  Private
export const getTeam = asyncHandler(async (req, res, next) => {
  const team = await Team.findById(req.params.id)
    .populate('owner', 'name email')
    .populate('members', 'name email')
    .populate('department', 'name');

  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Invalidate relevant caches
  invalidateCache(`/api/teams/${req.params.id}`);

  res.status(200).json({
    success: true,
    data: team
  });
});

// @desc    Create team
// @route   POST /api/teams
// @access  Private/Manager
export const createTeam = asyncHandler(async (req, res, next) => {
  const { name, description, department } = req.body;

  // Check if team exists in department
  const existingTeam = await Team.findOne({ name, department });
  if (existingTeam) {
    return next(new ErrorResponse('Team already exists in this department', 400));
  }

  const team = await Team.create({
    name,
    description,
    department,
    owner: req.user.id,
    members: [req.user.id]
  });

  // Update user with team
  await User.findByIdAndUpdate(req.user.id, { team: team._id });

  // Invalidate relevant caches
  invalidateCache('/api/teams');

  res.status(201).json({
    success: true,
    data: team
  });
});

// @desc    Update team
// @route   PUT /api/teams/:id
// @access  Private/Manager
export const updateTeam = asyncHandler(async (req, res, next) => {
  const { name, description, members } = req.body;

  const team = await Team.findById(req.params.id);

  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Only owner or admin can update
  if (team.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to update this team', 403));
  }

  // Update fields
  if (name) team.name = name;
  if (description !== undefined) team.description = description;
  if (members) team.members = members;

  await team.save();

  // Invalidate relevant caches
  invalidateCache('/api/teams');
  invalidateCache(`/api/teams/${req.params.id}`);

  res.status(200).json({
    success: true,
    data: team
  });
});

// @desc    Add member to team
// @route   POST /api/teams/:id/members
// @access  Private/Manager
export const addMember = asyncHandler(async (req, res, next) => {
  const { userId } = req.body;

  const team = await Team.findById(req.params.id);
  const user = await User.findById(userId);

  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Only owner or admin can add members
  if (team.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to add members', 403));
  }

  if (!team.members.includes(userId)) {
    team.members.push(userId);
    await team.save();

    // Update user
    user.team = team._id;
    await user.save();

    // Create notification
    await Notification.create({
      type: 'team_assigned',
      title: 'Added to Team',
      message: `You have been added to ${team.name}`,
      user: userId,
      sender: req.user.id
    });
    
    // Send Slack notification
    slackHooks.onTeamMemberAdded(team, user, req.user).catch(console.error);
  }

  res.status(200).json({
    success: true,
    data: team
  });
});

// @desc    Delete team
// @route   DELETE /api/teams/:id
// @access  Private/Manager
export const deleteTeam = asyncHandler(async (req, res, next) => {
  const team = await Team.findById(req.params.id);

  if (!team) {
    return next(new ErrorResponse('Team not found', 404));
  }

  // Only owner or admin can delete
  if (team.owner.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to delete this team', 403));
  }

  // Soft delete - mark as inactive
  team.isActive = false;
  await team.save();

  // Remove team from users
  await User.updateMany(
    { team: req.params.id },
    { $unset: { team: 1 } }
  );

  // Invalidate relevant caches
  invalidateCache('/api/teams');

  res.status(200).json({
    success: true,
    message: 'Team deactivated successfully'
  });
});

// Legacy functions for compatibility
export const inviteUser = async (req, res) => {
  const { email } = req.body;
  const teamId = req.params.teamId;
  try {
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ msg: 'Team not found' });
    if (team.owner.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });

    // Simplified invite - just add user if exists
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: 'User not found' });

    if (!team.members.includes(user._id)) {
      team.members.push(user._id);
      await team.save();
      await User.findByIdAndUpdate(user._id, { team: team._id });

      await Notification.create({
        type: 'team_invite',
        title: 'Team Invitation',
        message: `You have been invited to join ${team.name}`,
        user: user._id,
        sender: req.user.id
      });
    }

    res.json({ msg: 'User added to team' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const joinTeam = async (req, res) => {
  const { token } = req.params;
  try {
    // Simplified - assume token is team ID for now
    const team = await Team.findById(token);
    if (!team) return res.status(404).json({ msg: 'Invalid token' });

    if (!team.members.includes(req.user.id)) {
      team.members.push(req.user.id);
      await team.save();
      await User.findByIdAndUpdate(req.user.id, { team: team._id });

      await Notification.create({
        type: 'team_join',
        title: 'Joined Team',
        message: `You joined ${team.name}`,
        user: req.user.id
      });
    }

    res.json({ msg: 'Joined team successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const removeMember = async (req, res) => {
  const { userId } = req.params;
  const teamId = req.params.teamId;
  try {
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ msg: 'Team not found' });
    if (team.owner.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });

    team.members = team.members.filter(id => id.toString() !== userId);
    await team.save();
    await User.findByIdAndUpdate(userId, { $unset: { team: 1 } });
    res.json({ msg: 'Member removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};
