import Card from '../models/Card.js';
import User from '../models/User.js';
import Team from '../models/Team.js';

export const getCompletionRate = async (req, res) => {
  try {
    const teamId = req.query.teamId || req.user.team;
    const totalTasks = await Card.countDocuments({ team: teamId });
    const completedTasks = await Card.countDocuments({ team: teamId, status: 'Done' });
    const rate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    res.json({ completionRate: rate, total: totalTasks, completed: completedTasks });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const getOverdueTasks = async (req, res) => {
  try {
    const teamId = req.query.teamId || req.user.team;
    const overdue = await Card.find({
      team: teamId,
      dueDate: { $lt: new Date(), $ne: null },
      status: { $ne: 'Done' },
    }).populate('assignee', 'name').sort({ dueDate: 1 });
    res.json(overdue);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const getWorkloadByUser = async (req, res) => {
  try {
    const teamId = req.query.teamId || req.user.team;
    const users = await User.find({ team: teamId }).select('name');
    const workload = await Promise.all(
      users.map(async (user) => {
        const assigned = await Card.countDocuments({ assignee: user._id, status: { $ne: 'Done' } });
        return { user: user.name, tasks: assigned };
      })
    );
    res.json(workload);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};
