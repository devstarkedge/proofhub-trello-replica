# FlowTask ↔ Chat Application Integration Specification

> **Version:** 1.0.0  
> **Last Updated:** 2026-02-06  
> **Status:** Authoritative — Single Source of Truth  
> **Audience:** FlowTask Backend Team, Chat Application Team, DevOps, Security  

---

## Table of Contents

1. [Purpose & System of Record](#1-purpose--system-of-record)  
2. [Integration Model](#2-integration-model)  
3. [Core Domain Events from FlowTask](#3-core-domain-events-from-flowtask)  
4. [Channel Mapping Logic](#4-channel-mapping-logic)  
5. [FlowTask Bot Rules](#5-flowtask-bot-rules)  
6. [Security & Permissions](#6-security--permissions)  
7. [Data Ownership Rules](#7-data-ownership-rules)  
8. [Error Handling & Recovery](#8-error-handling--recovery)  
9. [Appendices](#9-appendices)  

---

## 1. Purpose & System of Record

### 1.1 Why This Integration Exists

FlowTask is an enterprise task-management platform encompassing project boards, hierarchical task tracking, team collaboration, announcements, sales pipeline management, and finance analytics. The Chat Application extends FlowTask by providing real-time messaging, threaded discussions, and contextual notifications — directly linked to the projects and tasks users already work in.

The integration exists to:

- **Eliminate context switching** — surface task updates, comments, and status changes inside chat channels automatically.  
- **Provide a single notification funnel** — consolidate in-app, email, push, and chat notifications through one event pipeline.  
- **Enable conversational workflows** — allow users to act on tasks (update status, log time, assign members) from within chat.  
- **Maintain organizational boundaries** — enforce FlowTask's department and role-based access control in every chat interaction.

### 1.2 FlowTask as the System of Record

FlowTask is the **authoritative source** for the following domains. The Chat Application must never create, modify, or delete these entities directly — only consume events emitted by FlowTask.

| Domain | FlowTask Model | Description |
|---|---|---|
| **Projects** | `Board` | Kanban-style project boards with lists, cards, members, and metadata. |
| **Tasks** | `Card` | Individual work items (cards) within project lists. |
| **Subtasks** | `Subtask` / `SubtaskNano` | Hierarchical sub-items beneath tasks. |
| **Users** | `User` | Employee accounts with role, department, verification status. |
| **Departments** | `Department` | Organizational units containing managers, members, and projects. |
| **Teams** | `Team` | Cross-functional groups within departments. |
| **Roles & Permissions** | `Role` | RBAC permission schema (admin, manager, hr, employee, custom). |
| **Announcements** | `Announcement` | Organization-wide or targeted announcements. |
| **Sales Data** | `SalesRow` / `SalesPermission` | Bidding and sales pipeline data with granular access control. |
| **Finance Pages** | `FinancePage` | Custom finance analytics pages with approval workflow. |

### 1.3 Entity Hierarchy

```
Organization
 └── Department
      ├── Team
      │    └── Members (User[])
      ├── Board (Project)
      │    ├── Members (User[])
      │    ├── List (Status Column)
      │    │    └── Card (Task)
      │    │         ├── Assignees (User[])
      │    │         ├── Labels (Label[])
      │    │         ├── Comments (Comment[])
      │    │         ├── Attachments (Attachment[])
      │    │         ├── Time Entries (loggedTime[], billedTime[], estimationTime[])
      │    │         ├── Subtask
      │    │         │    └── SubtaskNano
      │    │         └── Recurrence (RecurringTask)
      │    └── Labels (Board-scoped)
      └── Announcements
```

---

## 2. Integration Model

### 2.1 Architecture Overview

The integration uses an **event-driven architecture** with two complementary transport layers:

| Layer | Transport | Use Case |
|---|---|---|
| **Real-Time** | Socket.IO (WebSocket with polling fallback) | Internal UI updates and Chat App real-time feed |
| **Webhook** | HTTP POST with HMAC signature verification | External system integration and guaranteed delivery |

```
┌─────────────┐       Socket.IO        ┌──────────────┐
│  FlowTask   │ ─────────────────────▶ │   Chat App   │
│  Backend    │                         │   Backend    │
│             │   HTTP POST (Webhook)   │              │
│             │ ─────────────────────▶ │              │
└──────┬──────┘                         └──────┬───────┘
       │                                        │
       │  MongoDB (shared read-replica)         │  Own Database
       ▼                                        ▼
┌─────────────┐                         ┌──────────────┐
│  FlowTask   │                         │   Chat App   │
│  Database   │                         │   Database   │
└─────────────┘                         └──────────────┘
```

### 2.2 Socket.IO Room Topology

FlowTask maintains the following Socket.IO rooms. The Chat Application should subscribe to relevant rooms upon user connection.

| Room Pattern | Join Condition | Events Emitted |
|---|---|---|
| `user-{userId}` | Automatic on socket connect | `notification`, personal alerts |
| `board-{boardId}` | User joins a project view | `card-updated`, `comment-added`, `comment-updated`, `comment-deleted`, `subtask-updated`, `attachment-added`, `attachment-deleted`, `time-logged`, `estimation-updated` |
| `team-{teamId}` | User joins a team view | Team-level updates |
| `department-{departmentId}` | Automatic (from JWT `department` claim) | Department-scoped announcements |
| `admin` | `role === 'admin'` in JWT | Admin-only alerts, finance page events, user registration |
| `managers` | `role === 'manager'` in JWT | Manager alerts, finance page events |
| `announcements` | User opens announcements view | `announcement-created`, `announcement-updated`, `announcement-deleted` |
| `finance` | User opens finance view | `finance:data:refresh`, `finance:page:*` |
| `sales` | User opens sales view | Sales data updates |
| `card-{cardId}` | User opens a specific card | Card-specific real-time updates |
| `announcement-{announcementId}` | User opens announcement detail | Announcement-specific updates |
| `user-shortcuts-{userId}` | User opens shortcuts view | Personal shortcut updates |

### 2.3 Socket.IO Connection Authentication

```
Client → Server handshake:
{
  auth: {
    userId: string,    // FlowTask User._id
    token: string      // JWT Bearer token
  }
}

Server verifies:
1. userId is present (required — disconnect if missing)
2. JWT token is verified via jwt.verify(token, JWT_SECRET)
3. Decoded token provides: { _id, role, department }
4. User auto-joins: user-{userId}, role rooms, department rooms
```

### 2.4 Webhook Delivery Contract

For external integrations, FlowTask delivers events via HTTP POST with the following contract:

| Header | Value | Purpose |
|---|---|---|
| `Content-Type` | `application/json` | Payload format |
| `X-FlowTask-Event` | Event name (e.g., `PROJECT_CREATED`) | Event routing |
| `X-FlowTask-Event-Version` | `1.0` | Schema versioning |
| `X-FlowTask-Signature` | `sha256=<HMAC-SHA256>` | Payload integrity (HMAC with shared secret) |
| `X-FlowTask-Delivery-Id` | UUID v4 | Idempotency key for deduplication |
| `X-FlowTask-Timestamp` | ISO 8601 | Event emission time |

**Delivery Guarantees:**

- **At-least-once delivery** — events may be delivered more than once; consumers must be idempotent.  
- **Retry policy** — 3 attempts with exponential backoff (1s, 5s, 30s).  
- **Timeout** — 10 seconds per delivery attempt.  
- **Expected response** — HTTP 2xx within timeout; any other response triggers retry.

### 2.5 Event Versioning Strategy

All events include a `version` field in the payload. When the schema changes:

1. **Additive changes** (new optional fields): increment minor version (e.g., `1.0` → `1.1`). No consumer changes required.  
2. **Breaking changes** (field removal, type change): increment major version (e.g., `1.0` → `2.0`). Both versions emitted in parallel for a deprecation period of 90 days.  
3. **Consumer responsibility** — check `version` field and handle unknown fields gracefully.

---

## 3. Core Domain Events from FlowTask

Each event below documents: the event name, trigger condition, payload schema, and expected consuming behavior in the Chat Application.

### 3.1 PROJECT_CREATED

**Trigger:** `POST /api/boards` → `boardController.createBoard` completes successfully.  
**Source Notification:** `notificationService.notifyProjectCreated(board, creatorId)` — notifies project members and department managers.  
**Socket Room:** Emitted to `board-{boardId}` and department managers via `department-{departmentId}`.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"PROJECT_CREATED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of creation |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.projectId` | `ObjectId (string)` | Board `_id` |
| `data.name` | `string` | Project name (max 100 chars) |
| `data.description` | `string \| null` | Project description |
| `data.departmentId` | `ObjectId (string)` | Owning department `_id` |
| `data.departmentName` | `string` | Department name |
| `data.ownerId` | `ObjectId (string)` | Creator/owner User `_id` |
| `data.ownerName` | `string` | Owner display name |
| `data.ownerEmail` | `string` | Owner email |
| `data.members` | `ObjectId[] (string[])` | Initial member User IDs |
| `data.visibility` | `"public" \| "private"` | Board visibility setting |
| `data.status` | `"planning" \| "in-progress" \| "completed" \| "on-hold"` | Initial project status |
| `data.priority` | `"low" \| "medium" \| "high" \| "urgent"` | Project priority |
| `data.startDate` | `ISO 8601 \| null` | Planned start date |
| `data.dueDate` | `ISO 8601 \| null` | Planned due date |
| `data.teamId` | `ObjectId (string) \| null` | Associated team `_id` |

**Chat App Consuming Behavior:**

1. Create a new chat channel named per the [Channel Naming Rules](#42-channel-naming-rules).  
2. Set the channel topic to the project description (truncated to 250 chars).  
3. Add all `data.members` plus `data.ownerId` to the channel.  
4. Post a system message: *"Project **{name}** created by {ownerName} • Status: {status} • Priority: {priority}"*.  
5. Pin the system message for channel context.

---

### 3.2 PROJECT_UPDATED

**Trigger:** `PUT /api/boards/:id` → `boardController.updateBoard` completes successfully.  
**Source Notification:** `notificationService.notifyProjectUpdated(board, updaterId, changesSummary)`.  
**Slack Hook:** `slackHooks.onProjectUpdated(board, changes, triggeredBy)`.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"PROJECT_UPDATED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of update |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.projectId` | `ObjectId (string)` | Board `_id` |
| `data.updatedBy` | `ObjectId (string)` | User who made the update |
| `data.updatedByName` | `string` | Updater display name |
| `data.changes` | `object` | Key-value pairs of changed fields |
| `data.changes.name` | `string \| undefined` | New name (if changed) |
| `data.changes.description` | `string \| undefined` | New description (if changed) |
| `data.changes.status` | `string \| undefined` | New status (if changed) |
| `data.changes.priority` | `string \| undefined` | New priority (if changed) |
| `data.changes.dueDate` | `ISO 8601 \| undefined` | New due date (if changed) |
| `data.changes.visibility` | `string \| undefined` | New visibility (if changed) |
| `data.changesSummary` | `string` | Human-readable summary of changes |

**Chat App Consuming Behavior:**

1. If `changes.name` exists → rename the mapped chat channel.  
2. If `changes.description` exists → update the channel topic.  
3. If `changes.status` exists → post a system message: *"Project status changed to **{newStatus}** by {updatedByName}"*.  
4. If `changes.visibility` changes from `public` → `private` → restrict channel accordingly.

---

### 3.3 PROJECT_DELETED

**Trigger:** `DELETE /api/boards/:id` → `boardController.deleteBoard`.  
**Source Notification:** Notifies project members and department managers.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"PROJECT_DELETED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of deletion |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.projectId` | `ObjectId (string)` | Deleted Board `_id` |
| `data.name` | `string` | Project name at time of deletion |
| `data.departmentId` | `ObjectId (string)` | Department `_id` |
| `data.deletedBy` | `ObjectId (string)` | User who deleted |
| `data.deletedByName` | `string` | Deleter display name |

**Chat App Consuming Behavior:**

1. Post a final system message: *"Project **{name}** has been deleted by {deletedByName}"*.  
2. Archive the mapped chat channel (do **not** hard-delete — preserve message history).  
3. Remove the channel from active navigation.

---

### 3.4 PROJECT_MEMBER_ASSIGNED

**Trigger:** `PUT /api/boards/:id` with `members` array update, or member addition via board controller.  
**Socket Emitter:** `emitUserAssigned(userId, departmentId)` / `emitBulkUsersAssigned(userIds, departmentId)`.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"PROJECT_MEMBER_ASSIGNED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of assignment |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.projectId` | `ObjectId (string)` | Board `_id` |
| `data.projectName` | `string` | Board name |
| `data.memberIds` | `ObjectId[] (string[])` | Newly assigned User IDs |
| `data.assignedBy` | `ObjectId (string)` | User who assigned |
| `data.assignedByName` | `string` | Assigner display name |
| `data.departmentId` | `ObjectId (string)` | Board's department |

**Chat App Consuming Behavior:**

1. Add each user in `data.memberIds` to the mapped chat channel.  
2. Post a system message: *"{assignedByName} added {count} member(s) to the project"*.  
3. Send a personal welcome message to each new member in the channel.

---

### 3.5 PROJECT_MEMBER_REMOVED

**Trigger:** Member removal from `Board.members[]` via board update.  
**Socket Emitter:** `emitUserUnassigned(userId, departmentId)` / `emitBulkUsersUnassigned(userIds, departmentId)`.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"PROJECT_MEMBER_REMOVED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of removal |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.projectId` | `ObjectId (string)` | Board `_id` |
| `data.projectName` | `string` | Board name |
| `data.memberIds` | `ObjectId[] (string[])` | Removed User IDs |
| `data.removedBy` | `ObjectId (string)` | User who removed |
| `data.removedByName` | `string` | Remover display name |

**Chat App Consuming Behavior:**

1. Remove each user in `data.memberIds` from the mapped chat channel.  
2. Post a system message: *"{removedByName} removed {count} member(s) from the project"*.  
3. **Do not** delete the user's message history — it remains in the channel archive.

---

### 3.6 TASK_CREATED

**Trigger:** `POST /api/cards` → `cardController.createCard`.  
**Socket Emitter:** `emitToBoard(boardId, 'card-updated', ...)`.  
**Slack Hook:** `slackHooks.onTaskAssigned(task, board, assignees, triggeredBy)` — when assignees are set at creation.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"TASK_CREATED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of creation |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.taskId` | `ObjectId (string)` | Card `_id` |
| `data.title` | `string` | Task title (max 200 chars) |
| `data.description` | `string \| null` | Task description (max 5000 chars) |
| `data.projectId` | `ObjectId (string)` | Board `_id` |
| `data.projectName` | `string` | Board name |
| `data.listId` | `ObjectId (string)` | List `_id` (status column) |
| `data.listName` | `string` | List title |
| `data.createdById` | `ObjectId (string)` | Creator User `_id` |
| `data.createdByName` | `string` | Creator display name |
| `data.assigneeIds` | `ObjectId[] (string[])` | Assigned User IDs |
| `data.priority` | `"low" \| "medium" \| "high" \| "critical" \| null` | Task priority |
| `data.status` | `string \| null` | Task status (list-defined) |
| `data.dueDate` | `ISO 8601 \| null` | Due date |
| `data.startDate` | `ISO 8601 \| null` | Start date |
| `data.labels` | `Array<{id, name, color}>` | Attached labels |
| `data.createdFrom` | `"calendar" \| "project" \| "board" \| "slack" \| "api" \| null` | Creation source |

**Chat App Consuming Behavior:**

1. Post a message in the project channel: *"New task: **{title}** created by {createdByName} • Priority: {priority} • Due: {dueDate}"*.  
2. If assignees exist, mention them in the message.  
3. Create a message thread for ongoing task discussion (linked to `taskId`).

---

### 3.7 TASK_UPDATED

**Trigger:** `PUT /api/cards/:id` → `cardController.updateCard`.  
**Source Notification:** `notificationService.notifyTaskUpdated(card, updaterId, changes)`.  
**Slack Hook:** `slackHooks.onTaskUpdated(task, board, changes, triggeredBy)`.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"TASK_UPDATED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of update |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.taskId` | `ObjectId (string)` | Card `_id` |
| `data.projectId` | `ObjectId (string)` | Board `_id` |
| `data.updatedBy` | `ObjectId (string)` | Updater User `_id` |
| `data.updatedByName` | `string` | Updater display name |
| `data.changes` | `object` | Changed fields key-value map |
| `data.changes.title` | `string \| undefined` | New title |
| `data.changes.description` | `string \| undefined` | New description |
| `data.changes.priority` | `string \| undefined` | New priority |
| `data.changes.assignees` | `ObjectId[] \| undefined` | New assignee list |
| `data.changes.labels` | `ObjectId[] \| undefined` | New label list |
| `data.changes.dueDate` | `ISO 8601 \| undefined` | New due date |
| `data.changes.startDate` | `ISO 8601 \| undefined` | New start date |
| `data.changedFields` | `string[]` | List of field names that changed |

**Chat App Consuming Behavior:**

1. Post an update in the task's discussion thread: *"{updatedByName} updated {changedFields.join(', ')}"*.  
2. If `changes.title` exists → update the thread topic.  
3. If `changes.assignees` changed → add/remove users from the thread.  
4. Suppress updates from the same user within a 30-second window to avoid noise (debounce).

---

### 3.8 TASK_DELETED

**Trigger:** `DELETE /api/cards/:id` → `cardController.deleteCard`.  
**Source Notification:** `notificationService.notifyTaskDeleted(card, deleterId)`.  
**Slack Hook:** `slackHooks.onTaskDeleted(task, board, triggeredBy)`.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"TASK_DELETED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of deletion |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.taskId` | `ObjectId (string)` | Deleted Card `_id` |
| `data.title` | `string` | Task title at time of deletion |
| `data.projectId` | `ObjectId (string)` | Board `_id` |
| `data.projectName` | `string` | Board name |
| `data.deletedBy` | `ObjectId (string)` | Deleter User `_id` |
| `data.deletedByName` | `string` | Deleter display name |
| `data.assigneeIds` | `ObjectId[] (string[])` | Previously assigned users |

**Chat App Consuming Behavior:**

1. Post a final message in the task thread: *"Task **{title}** deleted by {deletedByName}"*.  
2. Lock the thread (prevent new replies).  
3. Mark the thread as archived/resolved.

---

### 3.9 TASK_STATUS_CHANGED

**Trigger:** Card update where `status` field is modified, or card moved to a different list.  
**API Routes:** `PUT /api/cards/:id` (status field change) or `PUT /api/cards/:id/move` (list move).  
**Slack Hook:** `slackHooks.onTaskStatusChanged(task, board, oldStatus, newStatus, triggeredBy)`.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"TASK_STATUS_CHANGED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of change |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.taskId` | `ObjectId (string)` | Card `_id` |
| `data.title` | `string` | Task title |
| `data.projectId` | `ObjectId (string)` | Board `_id` |
| `data.projectName` | `string` | Board name |
| `data.oldStatus` | `string` | Previous status / list title |
| `data.newStatus` | `string` | New status / list title |
| `data.changedBy` | `ObjectId (string)` | User `_id` |
| `data.changedByName` | `string` | User display name |
| `data.assigneeIds` | `ObjectId[] (string[])` | Current assignees |
| `data.isCompleted` | `boolean` | `true` if new status indicates completion (e.g., `"done"`) |

**Chat App Consuming Behavior:**

1. Post in the project channel and task thread: *"{changedByName} moved **{title}** from {oldStatus} → **{newStatus}**"*.  
2. If `isCompleted === true` → add a ✅ reaction to the task thread root message.  
3. If completion triggered → invoke `slackHooks.onTaskCompleted` behavior (notify watchers and board owner).  
4. Update any task status indicators in the channel.

---

### 3.10 TASK_DUE_DATE_CHANGED

**Trigger:** Card update where `dueDate` field is modified.  
**Activity Logger:** `activityLogger.detectChangesAndGenerateActivities` → `due_date_changed`.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"TASK_DUE_DATE_CHANGED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of change |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.taskId` | `ObjectId (string)` | Card `_id` |
| `data.title` | `string` | Task title |
| `data.projectId` | `ObjectId (string)` | Board `_id` |
| `data.oldDueDate` | `ISO 8601 \| null` | Previous due date |
| `data.newDueDate` | `ISO 8601 \| null` | New due date |
| `data.changedBy` | `ObjectId (string)` | User `_id` |
| `data.changedByName` | `string` | User display name |
| `data.assigneeIds` | `ObjectId[] (string[])` | Current assignees |

**Chat App Consuming Behavior:**

1. Post in task thread: *"{changedByName} changed due date: {oldDueDate} → **{newDueDate}**"*.  
2. If `newDueDate` is within 24 hours → post an urgent reminder in the project channel.  
3. Update any scheduled reminder messages linked to this task.

---

### 3.11 TASK_COMMENT_ADDED

**Trigger:** `POST /api/comments` → `commentController.addComment`.  
**Source Notification:** `notificationService.notifyCommentAdded(card, comment, commenterId)`.  
**Slack Hook:** `slackHooks.onCommentAdded(comment, task, board, triggeredBy)`.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"TASK_COMMENT_ADDED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of creation |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.commentId` | `ObjectId (string)` | Comment `_id` |
| `data.taskId` | `ObjectId (string)` | Card `_id` |
| `data.projectId` | `ObjectId (string)` | Board `_id` |
| `data.projectName` | `string` | Board name |
| `data.taskTitle` | `string` | Card title |
| `data.authorId` | `ObjectId (string)` | Comment author User `_id` |
| `data.authorName` | `string` | Author display name |
| `data.text` | `string` | Plain text content (max 10000 chars) |
| `data.htmlContent` | `string` | Rich HTML content |
| `data.contextType` | `"card" \| "subtask" \| "subtaskNano" \| "announcement"` | Where the comment was posted |
| `data.contextRef` | `ObjectId (string)` | Reference to the context entity |
| `data.parentCommentId` | `ObjectId (string) \| null` | Parent comment (for threaded replies) |
| `data.mentions` | `Array<{type, targetId, targetModel, name}>` | `@User`, `@Role`, `@Team` mentions |
| `data.attachments` | `Array<{url, original_name, file_size, mimetype}>` | Comment attachments |

**Chat App Consuming Behavior:**

1. Post the comment in the task's discussion thread.  
2. Convert `htmlContent` to chat-compatible markup.  
3. For each mention:
   - `@User` → direct mention with notification.
   - `@Role` → mention all users with that role.
   - `@Team` → mention all team members.
4. If `parentCommentId` is not null → create a threaded reply.  
5. Attach any files from `data.attachments`.

---

### 3.12 TIME_ENTRY_ADDED

**Trigger:** `POST /api/cards/:id/time-tracking` → `cardController.addTimeEntry`.  
**Socket Emitter:** `emitTimeLogged(boardId, cardId, timeEntry)` and `emitFinanceDataRefresh(context)`.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"TIME_ENTRY_ADDED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of entry |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.entryId` | `ObjectId (string)` | Time entry sub-document `_id` |
| `data.taskId` | `ObjectId (string)` | Card `_id` |
| `data.projectId` | `ObjectId (string)` | Board `_id` |
| `data.userId` | `ObjectId (string)` | User who logged time |
| `data.userName` | `string` | User display name |
| `data.hours` | `number` | Hours logged (≥ 0) |
| `data.minutes` | `number` | Minutes logged (0–59) |
| `data.description` | `string \| null` | Time entry description (max 500 chars) |
| `data.entryType` | `"logged" \| "billed" \| "estimation"` | Type of time entry |
| `data.date` | `ISO 8601` | Date of entry |

**Chat App Consuming Behavior:**

1. Post in the task thread: *"{userName} logged {hours}h {minutes}m — {description}"*.  
2. If total logged time exceeds estimation → post a warning in the project channel.  
3. Update any running time-tracking widgets in the chat interface.

---

### 3.13 USER_REGISTERED

**Trigger:** `POST /api/auth/register` → `authController.register`.  
**Source Notification:** `notificationService.notifyUserRegistered(user, recipients)` — recipients are all admin and manager users.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"USER_REGISTERED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of registration |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.userId` | `ObjectId (string)` | New User `_id` |
| `data.name` | `string` | User full name (max 50 chars) |
| `data.email` | `string` | User email |
| `data.role` | `string` | Assigned role (default: `"employee"`) |
| `data.departmentId` | `ObjectId (string) \| null` | Department selected during registration |
| `data.departmentName` | `string \| null` | Department name |
| `data.isVerified` | `boolean` | Always `false` at registration |

**Chat App Consuming Behavior:**

1. Post in the admin notification channel: *"🆕 New registration: **{name}** ({email}) • Department: {departmentName} • Awaiting verification"*.  
2. If `departmentId` is set → also post in the department's manager channel.  
3. **Do not** create a user account in Chat App until `USER_VERIFIED` is received.

---

### 3.14 USER_VERIFIED

**Trigger:** `PUT /api/users/:id/verify` → `userController.verifyUser` (admin-only).  
**Source Notification:** `notificationService.notifyUserVerified(user, recipients)`.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"USER_VERIFIED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of verification |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.userId` | `ObjectId (string)` | Verified User `_id` |
| `data.name` | `string` | User full name |
| `data.email` | `string` | User email |
| `data.role` | `string` | User role |
| `data.departmentIds` | `ObjectId[] (string[])` | User's department(s) |
| `data.departmentNames` | `string[]` | Department names |
| `data.teamId` | `ObjectId (string) \| null` | User's team |
| `data.verifiedBy` | `ObjectId (string)` | Admin who verified |
| `data.verifiedByName` | `string` | Admin display name |

**Chat App Consuming Behavior:**

1. **Create the user's Chat App account** (this is the activation trigger).  
2. Add the user to department-level and team-level channels.  
3. Post in the admin notification channel: *"✅ **{name}** has been verified by {verifiedByName}"*.  
4. Send a welcome direct message to the user with onboarding instructions.

---

### 3.15 ANNOUNCEMENT_CREATED

**Trigger:** `POST /api/announcements` → `announcementController.createAnnouncement`.  
**Slack Hook:** `slackHooks.onAnnouncementPosted(announcement, recipients, triggeredBy)`.  
**Socket Room:** Emitted to `announcements` room and targeted `department-{id}` rooms.

| Field | Type | Description |
|---|---|---|
| `event` | `string` | `"ANNOUNCEMENT_CREATED"` |
| `version` | `string` | `"1.0"` |
| `timestamp` | `ISO 8601` | Time of creation |
| `deliveryId` | `string (UUID)` | Unique delivery identifier |
| `data.announcementId` | `ObjectId (string)` | Announcement `_id` |
| `data.title` | `string` | Title (max 200 chars) |
| `data.description` | `string` | Full content |
| `data.category` | `"HR" \| "General" \| "Urgent" \| "System Update" \| "Events" \| "Custom"` | Category |
| `data.customCategory` | `string \| null` | Custom category name (if `"Custom"`) |
| `data.createdById` | `ObjectId (string)` | Author User `_id` |
| `data.createdByName` | `string` | Author display name |
| `data.subscribers.type` | `"all" \| "departments" \| "users" \| "managers" \| "custom"` | Audience type |
| `data.subscribers.departments` | `ObjectId[] (string[])` | Target department IDs |
| `data.subscribers.users` | `ObjectId[] (string[])` | Target user IDs |
| `data.subscribers.roles` | `string[]` | Target roles |
| `data.isPinned` | `boolean` | Whether announcement is pinned |
| `data.allowComments` | `boolean` | Whether comments are enabled |
| `data.expiresAt` | `ISO 8601` | Expiry date |
| `data.scheduledFor` | `ISO 8601 \| null` | Scheduled broadcast time |
| `data.attachments` | `Array<{url, original_name, file_size, mimetype}>` | Files attached |

**Chat App Consuming Behavior:**

1. Determine target channels based on `subscribers.type`:
   - `"all"` → post in a global announcements channel.
   - `"departments"` → post in each department channel.
   - `"users"` → send direct messages.
   - `"managers"` → post in the managers-only channel.
   - `"custom"` → combine department and role-based targeting.
2. Format the message with category badge, title, and content preview.  
3. If `isPinned === true` → pin the message in the target channel.  
4. If `allowComments === true` → enable threaded replies on the message.  
5. If `scheduledFor` is in the future → queue the message for scheduled delivery.

---

## 4. Channel Mapping Logic

### 4.1 Mapping Rules

Every FlowTask Board (project) maps to exactly **one** chat channel. The mapping is deterministic and bidirectional.

| FlowTask Entity | Chat Channel | Mapping Key |
|---|---|---|
| Board (Project) | Project Channel | `Board._id` |
| Department | Department Channel | `Department._id` |
| Team | Team Channel | `Team._id` |
| Global | `#flowtask-general` | Singleton |
| Admin-Only | `#flowtask-admin` | Singleton, role-gated |
| Managers-Only | `#flowtask-managers` | Singleton, role-gated |
| Announcements | `#flowtask-announcements` | Singleton |

### 4.2 Channel Naming Rules

Channel names are generated deterministically from FlowTask entity metadata.

```
Pattern: flowtask-{department_slug}-{project_slug}

Rules:
1. department_slug = Department.name → lowercase → replace spaces with hyphens → strip non-alphanumeric (except hyphens)
2. project_slug   = Board.name → lowercase → replace spaces with hyphens → strip non-alphanumeric (except hyphens)
3. Truncate total length to 80 characters (platform limit)
4. If collision detected → append "-{last4chars_of_boardId}"

Examples:
  Department: "Engineering"  + Project: "FlowTask V2"  → #flowtask-engineering-flowtask-v2
  Department: "Sales"        + Project: "Q1 Pipeline"  → #flowtask-sales-q1-pipeline
  Department: "HR"           + Project: "Onboarding"   → #flowtask-hr-onboarding
```

**Department and Team channels:**

```
Department Channel: flowtask-dept-{department_slug}
Team Channel:       flowtask-team-{team_slug}
```

### 4.3 Member Synchronization Logic

Channel membership is kept in sync with FlowTask project membership through event processing.

**Membership Sources (Union):**

```
Channel Members = Board.owner
               ∪ Board.members[]
               ∪ Card.assignees[] (across all cards in the board)
               ∪ Subtask.assignees[] (across all subtasks)
               ∪ SubtaskNano.assignees[] (across all nano-subtasks)
```

**Sync Rules:**

1. On `PROJECT_CREATED` → add `owner` + `members[]` to channel.  
2. On `PROJECT_MEMBER_ASSIGNED` → add new members to channel.  
3. On `PROJECT_MEMBER_REMOVED` → remove members, **unless** they are still assigned to tasks within the project.  
4. On `TASK_CREATED` / `TASK_UPDATED` with assignee changes → add new assignees to channel (additive only — never remove based on task unassignment alone).  
5. Full sync reconciliation runs in the background **once daily** to correct any drift.

### 4.4 Real-Time Consistency Guarantees

| Guarantee | Implementation |
|---|---|
| **Ordering** | Events within a single Socket.IO room are delivered in emission order |
| **Eventual consistency** | If a WebSocket message is missed, the next API poll or daily reconciliation corrects it |
| **Conflict resolution** | FlowTask is authoritative — if Chat App state differs from FlowTask state, FlowTask wins |
| **Latency target** | Socket.IO events: < 200ms; Webhooks: < 2s |

---

## 5. FlowTask Bot Rules

The **FlowTask Bot** is a system-level actor in the Chat Application that posts automated notifications and enables interactive commands.

### 5.1 Admin Notifications

The Admin role receives notifications about **all** organizational activity regardless of department.

| Trigger | Event | Channel | Message Template |
|---|---|---|---|
| New project created (any department) | `PROJECT_CREATED` | `#flowtask-admin` | *"📁 New project **{name}** created in {departmentName} by {ownerName}"* |
| Sales module update | `SALES_DATA_UPDATED` | `#flowtask-admin` | *"💰 Sales data updated: {changesSummary}"* |
| New user registration | `USER_REGISTERED` | `#flowtask-admin` | *"🆕 **{name}** ({email}) registered • Dept: {departmentName} • Action required: verify"* |
| User verified | `USER_VERIFIED` | `#flowtask-admin` | *"✅ **{name}** verified by {verifiedByName}"* |
| Announcement created | `ANNOUNCEMENT_CREATED` | `#flowtask-admin` | *"📢 New announcement: **{title}** ({category}) by {createdByName}"* |
| High-priority task alert | `TASK_CREATED` (priority = critical) | `#flowtask-admin` | *"🚨 Critical task: **{title}** in {projectName}"* |
| Finance page pending approval | `FINANCE_PAGE_PENDING` | `#flowtask-admin` | *"📊 Finance page **{pageName}** awaiting approval from {creatorName}"* |

### 5.2 Manager Notifications

Managers receive notifications scoped to their **assigned departments** and conditional module access.

| Trigger | Event | Channel | Condition | Message Template |
|---|---|---|---|---|
| New project in assigned department | `PROJECT_CREATED` | `#flowtask-dept-{slug}` | `Board.department ∈ Manager.department[]` | *"📁 New project **{name}** by {ownerName}"* |
| Task overdue in managed project | `TASK_OVERDUE` | `#flowtask-dept-{slug}` | Manager's department | *"⚠️ Overdue: **{title}** in {projectName} • Assigned: {assigneeNames}"* |
| Sales data update | `SALES_DATA_UPDATED` | `#flowtask-managers` | `SalesPermission.moduleVisible === true` for the manager | *"💰 Sales update: {summary}"* |
| User verified in same department | `USER_VERIFIED` | `#flowtask-dept-{slug}` | `User.department ∩ Manager.department ≠ ∅` | *"✅ **{name}** verified and added to {departmentName}"* |
| Announcement (department-scoped) | `ANNOUNCEMENT_CREATED` | `#flowtask-dept-{slug}` | `subscribers.departments` includes manager's department | *"📢 **{title}** — {category}"* |
| Finance page status change | `FINANCE_PAGE_STATUS_CHANGED` | `#flowtask-managers` | Always (managers room) | *"📊 Finance page **{pageName}** {action} by admin"* |

### 5.3 Employee Notifications

Employees receive notifications scoped to their **assigned tasks and projects**.

| Trigger | Event | Channel | Condition |
|---|---|---|---|
| Assigned to task | `TASK_CREATED` or `TASK_UPDATED` | Project channel + DM | `User._id ∈ Card.assignees` |
| Task updated | `TASK_UPDATED` | Project channel thread | User is assignee and not the updater |
| Mentioned in comment | `TASK_COMMENT_ADDED` | DM + thread | `User._id` in `comment.mentions` |
| Task due soon | `TASK_DUE_SOON` | DM | Reminder scheduler trigger |
| Task overdue | `TASK_OVERDUE` | DM | Recurring scheduler trigger |
| Deadline reminder | `DEADLINE_APPROACHING` | DM | `slackHooks.onDeadlineReminder` |

### 5.4 Bot Command Interface

The FlowTask Bot responds to the following commands within chat (derived from SlackSlashCommandHandler):

| Command | Description | Permission |
|---|---|---|
| `/flowtask tasks` | List your assigned tasks | All authenticated users |
| `/flowtask status <taskId>` | Get task status and details | Task assignee or project member |
| `/flowtask log <taskId> <hours>h <minutes>m` | Log time to a task | Task assignee |
| `/flowtask projects` | List projects in your departments | All authenticated users |
| `/flowtask help` | Show available commands | All authenticated users |

---

## 6. Security & Permissions

### 6.1 Authentication

All integration communication is authenticated to prevent unauthorized event injection or consumption.

| Layer | Mechanism | Details |
|---|---|---|
| **REST API** | JWT Bearer Token | `Authorization: Bearer <token>` in every request. Token signed with `JWT_SECRET`, default TTL 7 days. |
| **Socket.IO** | JWT in handshake auth | Verified on connection via `jwt.verify(token, JWT_SECRET)`. Decoded payload provides `{ _id, role, department }`. |
| **Webhooks (inbound to FlowTask)** | HMAC-SHA256 Signature | Signature in `X-Slack-Signature` header; verified against `SLACK_SIGNING_SECRET`. Request body must match exactly. |
| **Webhooks (outbound to Chat App)** | HMAC-SHA256 Signature | Signature in `X-FlowTask-Signature` header; computed over raw JSON body with shared secret. |

### 6.2 Token Structure

```json
{
  "id": "ObjectId — User._id",
  "role": "string — admin | manager | hr | employee | custom",
  "department": ["ObjectId — Department._id[]"],
  "iat": 1738800000,
  "exp": 1739404800
}
```

### 6.3 Role-Based Access Control

FlowTask enforces RBAC via middleware chain. The Chat Application must replicate these rules when processing events.

| Role | System Permissions | Chat App Implications |
|---|---|---|
| **admin** | Full access: `canManageSystem`, `canManageUsers`, `canManageRoles`, all CRUD operations | Access to all channels; receive all bot notifications; can execute all bot commands |
| **manager** | `canCreateProject`, `canCreateTask`, `canCreateAnnouncement`, `canAssignMembers`, `canDeleteTasks`, `canDeleteProjects` | Access to department channels; manage project channels in their departments; receive department-scoped bot notifications |
| **hr** | `canCreateDepartment`, `canCreateTask`, `canCreateAnnouncement`, `canAssignMembers` | Access to HR channels and department management channels |
| **employee** | `canCreateTask`, `canCreateReminder` | Access only to assigned project channels; receive task-level notifications only |
| **custom** | Per-role `permissions` object from `Role.permissions` schema | Evaluate each permission flag individually; deny by default |

### 6.4 Granular Permission Schema

The `Role.permissions` embedded document provides 12 fine-grained permission flags:

| Permission Flag | Type | Default (employee) | Description |
|---|---|---|---|
| `canCreateDepartment` | `boolean` | `false` | Create new departments |
| `canCreateTask` | `boolean` | `true` | Create tasks/cards |
| `canCreateProject` | `boolean` | `false` | Create project boards |
| `canCreateAnnouncement` | `boolean` | `false` | Create announcements |
| `canCreateReminder` | `boolean` | `true` | Create personal reminders |
| `canAssignMembers` | `boolean` | `false` | Assign users to projects/tasks |
| `canDeleteTasks` | `boolean` | `false` | Delete tasks |
| `canDeleteProjects` | `boolean` | `false` | Delete projects |
| `canManageRoles` | `boolean` | `false` | Create/edit/delete roles |
| `canManageUsers` | `boolean` | `false` | Manage user accounts |
| `canManageSystem` | `boolean` | `false` | System-level administration |

### 6.5 Sales Module Permission

Sales data access requires **separate, explicit permission** via the `SalesPermission` model.

| Permission | Type | Default | Description |
|---|---|---|---|
| `moduleVisible` | `boolean` | `false` | Can see the sales module at all |
| `canCreate` | `boolean` | `false` | Can create sales entries |
| `canUpdate` | `boolean` | `false` | Can update sales entries |
| `canDelete` | `boolean` | `false` | Can delete sales entries |
| `canExport` | `boolean` | `false` | Can export sales data |
| `canImport` | `boolean` | `false` | Can import sales data |
| `canManageDropdowns` | `boolean` | `false` | Can manage dropdown options |
| `canViewActivityLog` | `boolean` | `true` | Can view sales activity history |

**Chat App Rule:** Sales-related bot notifications must **only** be delivered to users where `SalesPermission.moduleVisible === true`.

### 6.6 Event Authentication Flow

```
┌─────────────┐     1. Emit Event       ┌──────────────┐
│  FlowTask   │ ──────────────────────▶ │   Chat App   │
│  Backend    │   X-FlowTask-Signature   │   Backend    │
└─────────────┘                          └──────┬───────┘
                                                 │
                                    2. Verify HMAC signature
                                    3. Check X-FlowTask-Event-Version
                                    4. Validate data.userId exists in local store
                                    5. Verify role/department from FlowTask API (cache 5min)
                                    6. Process event
                                                 │
                                    7. Return HTTP 200 (or 4xx/5xx)
                                                 ▼
```

### 6.7 Preventing Unauthorized Event Execution

| Threat | Mitigation |
|---|---|
| Forged webhook events | HMAC signature verification; reject if `X-FlowTask-Signature` does not match |
| Replay attacks | Check `X-FlowTask-Timestamp` is within 5-minute window; reject stale events |
| Duplicate events | Deduplicate by `X-FlowTask-Delivery-Id` (idempotency key) |
| Privilege escalation via events | Chat App re-validates user role and department from FlowTask `/api/users/:id` endpoint before executing role-gated operations |
| Token theft | JWT tokens have 7-day expiry; revocation requires password change or admin action; Socket.IO disconnects on invalid token |
| Cross-department data leak | Events include `departmentId`; Chat App must filter based on user's `department[]` array |

---

## 7. Data Ownership Rules

Clear ownership boundaries prevent data conflicts and ensure each system is authoritative over its domain.

### 7.1 FlowTask Owns (Read-Only for Chat App)

| Data | Model | Notes |
|---|---|---|
| **Projects** | `Board` | Structure, metadata, membership, status, priority, dates |
| **Tasks** | `Card` | Title, description, assignees, status, priority, due dates, labels |
| **Subtasks** | `Subtask`, `SubtaskNano` | Hierarchical task breakdown |
| **Users** | `User` | Identity, role, department, verification status, settings |
| **Departments** | `Department` | Organizational structure, managers, members |
| **Teams** | `Team` | Cross-functional groups |
| **Roles & Permissions** | `Role` | RBAC definitions |
| **Announcements** | `Announcement` | Content, targeting, scheduling, expiry |
| **Sales Data** | `SalesRow`, `SalesColumn`, `SalesDropdownOption` | Pipeline data |
| **Sales Permissions** | `SalesPermission` | Module access grants |
| **Time Entries** | `Card.loggedTime[]`, `Card.billedTime[]`, `Card.estimationTime[]` | Work tracking data |
| **Activity History** | `Activity` | Audit trail (90-day TTL) |
| **Notifications** | `Notification` | FlowTask in-app notification records |
| **Labels** | `Label` | Project-scoped classification tags |
| **Reminders** | `Reminder` | User-created task reminders |
| **Recurring Tasks** | `RecurringTask` | Task recurrence definitions |
| **Finance Pages** | `FinancePage` | Finance analytics configuration |
| **Attachments** (FlowTask) | `Attachment` | Files uploaded in FlowTask context |

### 7.2 Chat App Owns (Not Stored in FlowTask)

| Data | Notes |
|---|---|
| **Chat Messages** | All text messages sent within chat channels and threads |
| **Message Reactions** | Emoji reactions within the chat platform |
| **Chat Threads** | Thread structure and reply chains |
| **Files Uploaded in Chat** | Files shared directly in chat (not via FlowTask upload) |
| **Read Receipts** | Message read state per user |
| **Channel Settings** | Chat-specific channel configuration (notification preferences, bookmarks) |
| **User Chat Preferences** | Chat-specific user settings (theme, notification sounds) |
| **Chat Bot Interaction State** | Slash command history, interactive message state |
| **Typing Indicators** | Ephemeral real-time typing status |
| **Message Search Index** | Full-text index of chat messages |

### 7.3 Shared / Synced Data

| Data | Source of Truth | Sync Direction | Sync Mechanism |
|---|---|---|---|
| User profile (name, avatar, email) | **FlowTask** | FlowTask → Chat | `USER_VERIFIED` / profile update events |
| Channel membership | **FlowTask** (based on project membership) | FlowTask → Chat | `PROJECT_MEMBER_*` events + daily reconciliation |
| Channel name/topic | **FlowTask** (based on project name/description) | FlowTask → Chat | `PROJECT_UPDATED` event |
| Announcement read status | **Both** (independent tracking) | Bidirectional sync | FlowTask tracks `seenBy[]`/`readBy[]`; Chat tracks own read status |
| Notification delivery status | **Both** | Independent | FlowTask: `Notification.isRead`; Chat: own read/delivered status |

---

## 8. Error Handling & Recovery

### 8.1 Duplicate Event Handling

Events may be delivered more than once due to retry logic or network issues. The Chat Application must implement idempotent event processing.

**Idempotency Strategy:**

```
1. Extract X-FlowTask-Delivery-Id from webhook headers (or deliveryId from payload)
2. Check local processed_events table:
   - If deliveryId exists AND was processed successfully → return 200 immediately (skip processing)
   - If deliveryId exists AND processing failed → retry processing
   - If deliveryId does not exist → process normally
3. After successful processing, insert deliveryId with timestamp into processed_events table
4. Purge processed_events entries older than 7 days
```

**Database Schema for Idempotency:**

| Column | Type | Description |
|---|---|---|
| `delivery_id` | `VARCHAR(36) PRIMARY KEY` | The `X-FlowTask-Delivery-Id` value |
| `event_name` | `VARCHAR(50)` | Event type (e.g., `PROJECT_CREATED`) |
| `status` | `ENUM('processing', 'completed', 'failed')` | Processing state |
| `received_at` | `TIMESTAMP` | When the event was first received |
| `processed_at` | `TIMESTAMP NULL` | When processing completed |
| `attempts` | `INT DEFAULT 1` | Number of processing attempts |
| `last_error` | `TEXT NULL` | Last error message (if failed) |

### 8.2 Retry & Backoff Strategy

**Outbound (FlowTask → Chat App Webhook):**

| Attempt | Delay | Timeout |
|---|---|---|
| 1 | Immediate | 10s |
| 2 | 1 second | 10s |
| 3 | 5 seconds | 10s |
| 4 | 30 seconds | 10s |
| 5 (final) | 5 minutes | 10s |

After 5 failed attempts:
1. Log the failed event to a **dead-letter queue** (DLQ).  
2. Emit an `INTEGRATION_DELIVERY_FAILED` alert to the admin notification channel.  
3. Provide a manual retry endpoint: `POST /api/integrations/retry/:deliveryId`.

**Inbound (Chat App → FlowTask API):**

| Scenario | Strategy |
|---|---|
| HTTP 429 (rate limited) | Respect `Retry-After` header; exponential backoff starting at 1s |
| HTTP 5xx (server error) | Retry up to 3 times with exponential backoff (1s, 5s, 30s) |
| HTTP 4xx (client error) | Do not retry; log and alert |
| Network timeout | Retry up to 3 times with 10s timeout |

### 8.3 Partial Failure Recovery

When a batch event affects multiple users and some deliveries succeed while others fail:

```
Pattern: Promise.allSettled (used in SlackNotificationService.sendToMultipleUsers)

1. Process each user delivery independently
2. Collect results: { successful: N, failed: M, results: [...] }
3. For failed deliveries:
   a. Log the failure with user ID and error
   b. Queue individual retries for failed users only
   c. Do not re-process successful deliveries
4. If > 50% of deliveries fail → escalate to admin alert
```

### 8.4 Event Ordering & Causality

| Scenario | Handling |
|---|---|
| `TASK_UPDATED` arrives before `TASK_CREATED` | Check if task exists in Chat App; if not, queue the update and process after creation event arrives (max hold: 60s, then discard with warning) |
| `PROJECT_DELETED` arrives before `PROJECT_MEMBER_REMOVED` | Process deletion immediately; member removal events for a deleted project are no-ops |
| `USER_VERIFIED` arrives before `USER_REGISTERED` | Process verification immediately; create user account if it doesn't exist |
| Rapid successive updates to same entity | Debounce within a 5-second window; apply only the latest state |

### 8.5 Data Reconciliation

A scheduled reconciliation process ensures eventual consistency:

| Frequency | Scope | Process |
|---|---|---|
| **Every 6 hours** | Channel membership | Fetch `GET /api/boards/:id` for each active project; compare members with channel membership; add/remove as needed |
| **Daily (02:00 UTC)** | User accounts | Fetch `GET /api/users` (verified only); compare with Chat App user list; deactivate removed users, add new ones |
| **Daily (03:00 UTC)** | Channel inventory | Fetch `GET /api/boards` (non-archived); compare with channel list; create missing channels, archive orphaned ones |
| **Weekly** | Full audit | Comprehensive comparison of all synchronized data; generate discrepancy report for admin review |

### 8.6 Circuit Breaker Pattern

If the Chat App detects sustained failures communicating with FlowTask:

```
States:
  CLOSED (normal) → track failure count
  OPEN (circuit tripped) → reject all calls for cooldown period
  HALF-OPEN (testing) → allow single probe request

Thresholds:
  - Open after: 5 consecutive failures or > 50% failure rate in 60s window
  - Cooldown period: 30 seconds
  - Half-open probe: single lightweight request (GET /api/health or GET /api/auth/verify)
  - Close after: 2 consecutive successful probes
```

---

## 9. Appendices

### 9.1 API Endpoint Reference

Complete list of FlowTask API endpoints relevant to the Chat App integration.

#### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | User registration |
| `POST` | `/api/auth/login` | Public | User login, returns JWT |
| `GET` | `/api/auth/me` | Bearer | Get current user profile |
| `GET` | `/api/auth/verify` | Bearer | Verify token validity |
| `POST` | `/api/auth/refresh` | Bearer | Refresh JWT token |
| `POST` | `/api/auth/admin-create-user` | Bearer + admin | Admin creates a new user |

#### Projects (Boards)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/boards` | Bearer | List user's boards |
| `GET` | `/api/boards/:id` | Bearer | Get board details |
| `GET` | `/api/boards/department/:departmentId` | Bearer | Boards by department |
| `GET` | `/api/boards/:id/workflow-complete` | Bearer | Full board + lists + cards (optimized) |
| `GET` | `/api/boards/:id/activity` | Bearer | Project activity log |
| `POST` | `/api/boards` | Bearer | Create board |
| `PUT` | `/api/boards/:id` | Bearer | Update board |
| `DELETE` | `/api/boards/:id` | Bearer | Delete board |

#### Tasks (Cards)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/cards/list/:listId` | Bearer | Cards in a list (paginated) |
| `GET` | `/api/cards/board/:boardId` | Bearer | Cards in a board (paginated) |
| `GET` | `/api/cards/department/:departmentId` | Bearer | Cards by department |
| `GET` | `/api/cards/:id` | Bearer | Get card details |
| `GET` | `/api/cards/:id/activity` | Bearer | Card activity log |
| `POST` | `/api/cards` | Bearer | Create card |
| `PUT` | `/api/cards/:id` | Bearer | Update card |
| `PUT` | `/api/cards/:id/move` | Bearer | Move card between lists |
| `PUT` | `/api/cards/:id/archive` | Bearer | Archive card |
| `PUT` | `/api/cards/:id/restore` | Bearer | Restore archived card |
| `DELETE` | `/api/cards/:id` | Bearer | Delete card |
| `POST` | `/api/cards/:id/time-tracking` | Bearer | Add time entry |
| `PUT` | `/api/cards/:id/time-tracking/:entryId` | Bearer | Update time entry |
| `DELETE` | `/api/cards/:id/time-tracking/:entryId` | Bearer | Delete time entry |

#### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users` | Bearer + hr/admin | List all users |
| `GET` | `/api/users/verified` | Bearer + hr/admin | List verified users |
| `GET` | `/api/users/by-departments` | Bearer + hr/admin | Users grouped by department |
| `GET` | `/api/users/managers` | Bearer + hr/admin | List managers |
| `GET` | `/api/users/:id` | Bearer | Get user profile |
| `PUT` | `/api/users/:id` | Bearer + owner/admin | Update user |
| `PUT` | `/api/users/:id/verify` | Bearer + admin | Verify user (admin-only) |
| `PUT` | `/api/users/:id/assign` | Bearer + manager/hr/admin | Assign to department/team |
| `DELETE` | `/api/users/:id/decline` | Bearer + admin | Decline registration |
| `DELETE` | `/api/users/:id` | Bearer + admin | Delete user |

#### Departments

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/departments` | Bearer | List departments |
| `GET` | `/api/departments/:id` | Bearer | Get department details |
| `POST` | `/api/departments` | Bearer + admin/hr | Create department |
| `PUT` | `/api/departments/:id` | Bearer + admin | Update department |
| `DELETE` | `/api/departments/:id` | Bearer + admin | Delete department |

#### Announcements

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/announcements` | Bearer | List announcements |
| `GET` | `/api/announcements/unread-count` | Bearer | Unread count for user |
| `GET` | `/api/announcements/stats/overview` | Bearer | Announcement statistics |
| `GET` | `/api/announcements/:id` | Bearer | Get announcement |
| `POST` | `/api/announcements` | Bearer + admin/manager/hr | Create announcement |
| `PUT` | `/api/announcements/:id` | Bearer + creator/admin | Update announcement |
| `DELETE` | `/api/announcements/:id` | Bearer + creator/admin | Delete announcement |

#### Comments

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/comments/card/:cardId` | Bearer | Comments on a card (paginated) |
| `POST` | `/api/comments` | Bearer | Add comment |
| `PUT` | `/api/comments/:id` | Bearer + author | Edit comment |
| `DELETE` | `/api/comments/:id` | Bearer + author/admin | Delete comment |

#### Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/notifications` | Bearer | User's notifications (paginated) |
| `GET` | `/api/notifications/unread-count` | Bearer | Unread notification count |
| `PUT` | `/api/notifications/:id/read` | Bearer | Mark as read |
| `PUT` | `/api/notifications/mark-all-read` | Bearer | Mark all as read |

#### Slack Integration

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/slack/connection` | Bearer | Check Slack connection status |
| `GET` | `/api/slack/oauth/url` | Bearer | Get OAuth install URL |
| `GET` | `/api/slack/oauth/callback` | Public | OAuth callback handler |
| `PUT` | `/api/slack/preferences` | Bearer | Update Slack notification preferences |
| `POST` | `/api/slack/events` | Slack Signature | Slack Events API webhook |
| `POST` | `/api/slack/interactive` | Slack Signature | Interactive component handler |
| `POST` | `/api/slack/commands` | Slack Signature | Slash command handler |
| `GET` | `/api/slack/health` | Bearer + admin | Integration health check |

### 9.2 Glossary: FlowTask ↔ Chat Mapping

| FlowTask Concept | Chat App Concept | Notes |
|---|---|---|
| Board (Project) | Channel | 1:1 mapping via `Board._id` |
| Card (Task) | Thread / Topic | Task becomes a thread root message |
| List (Status Column) | Channel Section / Tag | Visual grouping within a channel |
| Comment | Thread Reply | Mapped to task thread |
| Subtask | Sub-thread / Checklist Item | Nested within task thread |
| Department | Channel Group / Category | Organizational grouping of channels |
| Team | Private Group Channel | Subset of department members |
| Announcement | Pinned Message / Broadcast | Posted to targeted channels |
| Label | Tag / Emoji Badge | Visual classification in messages |
| User | Chat User | Account synced on `USER_VERIFIED` |
| Role (`admin`, `manager`, etc.) | Chat Role / Permission Group | Maps to channel access rules |
| Notification | Chat Notification / DM | Delivered via bot direct message |
| Attachment | Shared File | Linked or re-hosted in chat |
| Time Entry | Bot Message | Logged time posted as system message |

### 9.3 Socket.IO Event Reference

Complete list of Socket.IO events emitted by FlowTask that the Chat App should listen to.

| Event Name | Room | Payload | Source |
|---|---|---|---|
| `notification` | `user-{userId}` | Full notification object | `emitNotification()` |
| `card-updated` | `board-{boardId}` | `{ cardId, updates, updatedBy }` | `emitCardUpdate()` |
| `comment-added` | `board-{boardId}` | `{ cardId, comment }` | `emitCommentAdded()` |
| `comment-updated` | `board-{boardId}` | `{ cardId, commentId, updates }` | `emitCommentUpdated()` |
| `comment-deleted` | `board-{boardId}` | `{ cardId, commentId }` | `emitCommentDeleted()` |
| `subtask-updated` | `board-{boardId}` | `{ cardId, subtaskId, updates }` | `emitSubtaskUpdated()` |
| `attachment-added` | `board-{boardId}` | `{ cardId, attachment }` | `emitAttachmentAdded()` |
| `attachment-deleted` | `board-{boardId}` | `{ cardId, attachmentId }` | `emitAttachmentDeleted()` |
| `time-logged` | `board-{boardId}` | `{ cardId, timeEntry }` | `emitTimeLogged()` |
| `estimation-updated` | `board-{boardId}` | `{ cardId, estimationEntry }` | `emitEstimationUpdated()` |
| `user-assigned` | Broadcast | `{ userId, departmentId }` | `emitUserAssigned()` |
| `user-unassigned` | Broadcast | `{ userId, departmentId }` | `emitUserUnassigned()` |
| `department-bulk-assigned` | Broadcast | `{ userIds, departmentId, count }` | `emitBulkUsersAssigned()` |
| `department-bulk-unassigned` | Broadcast | `{ userIds, departmentId, count }` | `emitBulkUsersUnassigned()` |
| `finance:page:pending` | `admin` | `{ page, creatorName, message }` | `emitFinancePagePending()` |
| `finance:page:published` | `admin`, `manager` | `{ page, message }` | `emitFinancePagePublished()` |
| `finance:page:status-changed` | `admin`, `manager` | `{ page, action, message }` | `emitFinancePageStatusChanged()` |
| `finance:page:updated` | `admin`, `manager` | `{ page, message }` | `emitFinancePageUpdated()` |
| `finance:page:deleted` | `admin`, `manager` | `{ pageId, pageName, message }` | `emitFinancePageDeleted()` |
| `finance:data:refresh` | `finance`, `admin`, `manager` | `{ type, timestamp, cardId?, boardId? }` | `emitFinanceDataRefresh()` |

### 9.4 Notification Type Reference

All notification types recognized by the FlowTask `Notification` model:

| Type | Priority | Trigger | Admin | Manager | Employee |
|---|---|---|---|---|---|
| `task_assigned` | medium | Task assigned to user | — | — | ✅ |
| `task_updated` | medium | Task fields changed | — | — | ✅ |
| `task_due_soon` | high | Due date approaching | — | — | ✅ |
| `task_overdue` | high | Past due date | — | ✅ | ✅ |
| `task_created` | medium | New task in project | — | ✅ | ✅ |
| `task_deleted` | medium | Task removed | — | — | ✅ |
| `task_moved` | low | Card moved between lists | — | — | ✅ |
| `task_completed` | medium | Task marked complete | — | ✅ | ✅ |
| `project_created` | medium | New project board | ✅ | ✅ | ✅ |
| `project_deleted` | medium | Project removed | ✅ | ✅ | — |
| `project_updates` | medium | Project settings changed | — | ✅ | ✅ |
| `comment_added` | medium | New comment on task | — | — | ✅ |
| `comment_mention` | high | `@User` mention in comment | — | — | ✅ |
| `comment_reaction` | low | Emoji reaction on comment | — | — | ✅ |
| `comment_reply` | medium | Reply to user's comment | — | — | ✅ |
| `comment_pinned` | low | Comment pinned | — | — | ✅ |
| `role_mention` | high | `@Role` mention in comment | ✅ | ✅ | ✅ |
| `team_mention` | high | `@Team` mention in comment | — | ✅ | ✅ |
| `team_invite` | medium | Added to a team | — | — | ✅ |
| `board_shared` | medium | Board shared with user | — | — | ✅ |
| `user_registered` | critical | New user registration | ✅ | ✅ | — |
| `user_verified` | medium | User account verified | ✅ | ✅ | — |
| `user_approved` | medium | User approved | ✅ | — | — |
| `user_declined` | medium | User registration declined | ✅ | — | — |
| `account_created` | medium | Admin-created user account | ✅ | — | — |
| `user_created` | medium | Legacy (same as registered) | ✅ | ✅ | — |
| `user_assigned` | medium | User assigned to dept/team | — | ✅ | ✅ |
| `user_unassigned` | medium | User removed from dept/team | — | ✅ | ✅ |
| `announcement_created` | low | New announcement | ✅ | ✅ | ✅ |
| `module_access` | medium | Sales module access granted | — | — | ✅ |
| `reminder_due_soon` | high | Reminder approaching | — | — | ✅ |
| `reminder_sent` | medium | Reminder delivered | — | — | ✅ |
| `reminder_completed` | low | Reminder marked done | — | — | ✅ |
| `reminder_missed` | high | Reminder not acted on | — | — | ✅ |
| `deadline_approaching` | high | Task deadline imminent | — | ✅ | ✅ |
| `status_change` | medium | Task status transition | — | — | ✅ |
| `system_alert` | critical | System-level alert | ✅ | — | — |
| `awaiting_client_response` | medium | Task blocked on client | — | ✅ | ✅ |

---

## Document Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0.0 | 2026-02-06 | FlowTask Team | Initial specification |

---

> **Note:** This document is the single source of truth for the FlowTask ↔ Chat Application integration. Any discrepancies between this document and implementation should be resolved in favor of this specification. Changes to this document require review from both FlowTask and Chat App team leads.
