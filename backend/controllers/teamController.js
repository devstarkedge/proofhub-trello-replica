import Team from '../models/Team.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const createTeam = async (req, res) => {
  const { name, department } = req.body;
  try {
    const team = new Team({
      name,
      owner: req.user.id,
      department,
      members: [req.user.id],
    });
    await team.save();
    await User.findByIdAndUpdate(req.user.id, { team: team._id });
    res.status(201).json(team);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const inviteUser = async (req, res) => {
  const { email } = req.body;
  const teamId = req.params.teamId;
  try {
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ msg: 'Team not found' });
    if (team.owner.toString() !== req.user.id) return res.status(403).json({ msg: 'Not authorized' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    team.inviteTokens.push({ token, email, expiresAt });
    await team.save();

    const inviteLink = `${process.env.FRONTEND_URL}/join-team/${token}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Invitation to join ${team.name}`,
      html: `<p>You've been invited to join ${team.name}. Click <a href="${inviteLink}">here</a> to accept.</p>`,
    });

    res.json({ msg: 'Invitation sent' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};

export const joinTeam = async (req, res) => {
  const { token } = req.params;
  try {
    const team = await Team.findOne({ 'inviteTokens.token': token });
    if (!team) return res.status(404).json({ msg: 'Invalid token' });

    const invite = team.inviteTokens.find(t => t.token === token);
    if (new Date() > invite.expiresAt) return res.status(400).json({ msg: 'Token expired' });

    if (req.user.email !== invite.email) return res.status(403).json({ msg: 'Email mismatch' });

    team.members.push(req.user.id);
    team.inviteTokens = team.inviteTokens.filter(t => t.token !== token);
    await team.save();

    await User.findByIdAndUpdate(req.user.id, { team: team._id, $pull: { invites: team._id } });

    // Create notification
    const notification = new Notification({
      type: 'team_invite',
      message: `You joined ${team.name}`,
      user: req.user.id,
      relatedTeam: team._id,
    });
    await notification.save();

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

export const getTeams = async (req, res) => {
  try {
    const teams = await Team.find({ members: req.user.id }).populate('owner members department');
    res.json(teams);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
};
