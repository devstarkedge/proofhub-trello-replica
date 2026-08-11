/**
 * The single list of every workspace-owned collection, shared by
 * migrateWorkspaces.js and verifyWorkspaceScoping.js so the two can never
 * drift apart — one script backfills `workspaceId`, the other checks that
 * the backfill actually reached every row, both walking the same array.
 *
 * Deliberately excludes: User (spans multiple workspaces — see
 * WorkspaceMembership instead), Workspace/WorkspaceMembership themselves
 * (not workspace-*owned*, they're the tenant/membership records), and
 * AccessOverride/AuditLog (use the field name `workspace`, not
 * `workspaceId`, and are migrated separately by migratePermissionEngine.js
 * / already stamped by the services that write them).
 */
import Department from '../models/Department.js';
import Team from '../models/Team.js';
import Board from '../models/Board.js';
import Card from '../models/Card.js';
import List from '../models/List.js';
import Label from '../models/Label.js';
import Category from '../models/Category.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Comment from '../models/Comment.js';
import Attachment from '../models/Attachment.js';
import Notification from '../models/Notification.js';
import Activity from '../models/Activity.js';
import FinancePage from '../models/FinancePage.js';
import UserPermission from '../models/UserPermission.js';
import SalesPermission from '../models/SalesPermission.js';
import SalesRow from '../models/SalesRow.js';
import SalesColumn from '../models/SalesColumn.js';
import SalesDropdownOption from '../models/SalesDropdownOption.js';
import SalesActivityLog from '../models/SalesActivityLog.js';
import SalesUserPreference from '../models/SalesUserPreference.js';
import Milestone from '../models/Milestone.js';
import MilestoneApproval from '../models/MilestoneApproval.js';
import MilestoneRevenueRecognition from '../models/MilestoneRevenueRecognition.js';
import RecurringTask from '../models/RecurringTask.js';
import Reminder from '../models/Reminder.js';
import VersionHistory from '../models/VersionHistory.js';
import Announcement from '../models/Announcement.js';
import AnalyticsReportSchedule from '../models/AnalyticsReportSchedule.js';
import ProjectDropdownOption from '../models/ProjectDropdownOption.js';
import SalesTab from '../modules/salesTabs/salesTab.model.js';

// { model, name } pairs — `name` is used only for log/report output.
export const WORKSPACE_OWNED_MODELS = [
  { model: Department, name: 'Department' },
  { model: Team, name: 'Team' },
  { model: Board, name: 'Board' },
  { model: Card, name: 'Card' },
  { model: List, name: 'List' },
  { model: Label, name: 'Label' },
  { model: Category, name: 'Category' },
  { model: Subtask, name: 'Subtask' },
  { model: SubtaskNano, name: 'SubtaskNano' },
  { model: Comment, name: 'Comment' },
  { model: Attachment, name: 'Attachment' },
  { model: Notification, name: 'Notification' },
  { model: Activity, name: 'Activity' },
  { model: FinancePage, name: 'FinancePage' },
  { model: UserPermission, name: 'UserPermission' },
  { model: SalesPermission, name: 'SalesPermission' },
  { model: SalesRow, name: 'SalesRow' },
  { model: SalesColumn, name: 'SalesColumn' },
  { model: SalesDropdownOption, name: 'SalesDropdownOption' },
  { model: SalesActivityLog, name: 'SalesActivityLog' },
  { model: SalesUserPreference, name: 'SalesUserPreference' },
  { model: Milestone, name: 'Milestone' },
  { model: MilestoneApproval, name: 'MilestoneApproval' },
  { model: MilestoneRevenueRecognition, name: 'MilestoneRevenueRecognition' },
  { model: RecurringTask, name: 'RecurringTask' },
  { model: Reminder, name: 'Reminder' },
  { model: VersionHistory, name: 'VersionHistory' },
  { model: Announcement, name: 'Announcement' },
  { model: AnalyticsReportSchedule, name: 'AnalyticsReportSchedule' },
  { model: ProjectDropdownOption, name: 'ProjectDropdownOption' },
  { model: SalesTab, name: 'SalesTab' },
];

// Role is the one model in the list above using the { allowGlobal: true }
// plugin variant — system-role templates (isSystem: true) deliberately
// keep workspaceId: null forever and must never be backfilled.
export const ROLE_MODEL_NAME = 'Role';

export default WORKSPACE_OWNED_MODELS;
