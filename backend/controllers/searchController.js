import Card from '../models/Card.js';
import User from '../models/User.js';
import Team from '../models/Team.js';

export const globalSearch = async (req, res) => {
  const { q, type } = req.query;
  try {
    let results = {};
    if (!type || type === 'task') {
      const tasks = await Card.find({
        $and: [
          { $text: { $search: q } },
          // Add team filter if needed
        ],
      }).populate('assignee', 'name').populate('listId', 'title').limit(20);
      results.tasks = tasks;
    }
    if (!type || type === 'user') {
      const users = await User.find({
        $and: [
          { $text: { $search: q } },
          // Add team filter
        ],
      }).select('name email avatar').limit(20);
      results.users = users;
    }
    if (!type || type === 'team') {
      const teams = await Team.find({
        $and: [
          { $text: { $search: q } },
          // Add department filter
        ],
      }).populate('owner', 'name').limit(20);
      results.teams = teams;
    }
    res.json(results);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};
