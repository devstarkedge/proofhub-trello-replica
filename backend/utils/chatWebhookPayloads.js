/**
 * Chat Webhook Payload Builders
 *
 * Transforms FlowTask Mongoose documents into the JSON payload schemas
 * defined in FLOWTASK_CHAT_INTEGRATION.md §3.
 *
 * Each builder produces a plain object safe for JSON serialization.
 */

function toId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return toId(value[0]);
  return (value._id || value.id)?.toString() || null;
}

function resolveWorkspaceId(...candidates) {
  for (const candidate of candidates) {
    const id = toId(candidate);
    if (id) return id;
  }
  return null;
}

// ─── Actor Payload ───────────────────────────────────────────────────────────

/**
 * Build actor object from a FlowTask user (req.user or populated user doc).
 */
export function buildActor(user) {
  if (!user) return null;
  return {
    id: (user._id || user.id)?.toString(),
    name: user.name || 'Unknown User',
    email: user.email || '',
    role: user.role || 'employee',
    avatar: user.avatar || null,
  };
}

// ─── Project / Board Payloads ────────────────────────────────────────────────

export function buildProjectCreatedPayload(board, actor) {
  const workspaceId = resolveWorkspaceId(board?.department);
  return {
    workspaceId,
    project: {
      id: board._id?.toString(),
      name: board.name,
      description: board.description || '',
      department: board.department?.toString() || null,
      departmentName: board.department?.name || null,
      owner: board.owner?.toString(),
      members: (board.members || []).map((m) => (m._id || m).toString()),
      visibility: board.visibility || 'private',
      status: board.status || 'planning',
      createdAt: board.createdAt || new Date().toISOString(),
    },
    actor: buildActor(actor),
  };
}

export function buildProjectUpdatedPayload(board, changes, actor) {
  const workspaceId = resolveWorkspaceId(board?.department);
  return {
    workspaceId,
    project: {
      id: board._id?.toString(),
      name: board.name,
      department: board.department?.toString() || null,
    },
    changes: changes || {},
    actor: buildActor(actor),
  };
}

export function buildProjectDeletedPayload(board, actor) {
  const workspaceId = resolveWorkspaceId(board?.department);
  return {
    workspaceId,
    project: {
      id: board._id?.toString(),
      name: board.name,
      department: board.department?.toString() || null,
    },
    actor: buildActor(actor),
  };
}

export function buildProjectMemberPayload(board, memberId, role, actor) {
  const workspaceId = resolveWorkspaceId(board?.department);
  return {
    workspaceId,
    project: {
      id: board._id?.toString(),
      name: board.name,
    },
    member: {
      userId: (memberId?._id || memberId)?.toString(),
      name: memberId?.name || null,
      email: memberId?.email || null,
      role: role || 'member',
    },
    actor: buildActor(actor),
  };
}

// ─── Task / Card Payloads ────────────────────────────────────────────────────

export function buildTaskCreatedPayload(card, board, actor) {
  const workspaceId = resolveWorkspaceId(board?.department, card?.department);
  return {
    workspaceId,
    task: {
      id: card._id?.toString(),
      title: card.title,
      description: card.description?.substring(0, 500) || '',
      status: card.status || null,
      priority: card.priority || null,
      dueDate: card.dueDate || null,
      assignees: (card.assignees || card.members || []).map((a) => (a._id || a).toString()),
      boardId: (card.board || board?._id)?.toString(),
    },
    project: {
      id: board?._id?.toString(),
      name: board?.name || '',
    },
    actor: buildActor(actor),
  };
}

export function buildTaskUpdatedPayload(card, changes, board, actor) {
  const workspaceId = resolveWorkspaceId(board?.department, card?.department);
  return {
    workspaceId,
    task: {
      id: card._id?.toString(),
      title: card.title,
      boardId: (card.board || board?._id)?.toString(),
    },
    changes: changes || {},
    project: {
      id: board?._id?.toString(),
      name: board?.name || '',
    },
    actor: buildActor(actor),
  };
}

export function buildTaskDeletedPayload(card, board, actor) {
  const workspaceId = resolveWorkspaceId(board?.department, card?.department);
  return {
    workspaceId,
    task: {
      id: card._id?.toString(),
      title: card.title,
      boardId: (card.board || board?._id)?.toString(),
    },
    project: {
      id: board?._id?.toString(),
      name: board?.name || '',
    },
    actor: buildActor(actor),
  };
}

export function buildTaskAssignedPayload(card, assignees, board, actor) {
  const workspaceId = resolveWorkspaceId(board?.department, card?.department);
  return {
    workspaceId,
    task: {
      id: card._id?.toString(),
      title: card.title,
      boardId: (card.board || board?._id)?.toString(),
    },
    assignees: (assignees || []).map((a) => ({
      userId: (a._id || a).toString(),
      name: a.name || null,
      email: a.email || null,
    })),
    project: {
      id: board?._id?.toString(),
      name: board?.name || '',
    },
    actor: buildActor(actor),
  };
}

export function buildTaskStatusChangedPayload(card, oldStatus, newStatus, board, actor) {
  const workspaceId = resolveWorkspaceId(board?.department, card?.department);
  return {
    workspaceId,
    task: {
      id: card._id?.toString(),
      title: card.title,
      boardId: (card.board || board?._id)?.toString(),
    },
    oldStatus,
    newStatus,
    project: {
      id: board?._id?.toString(),
      name: board?.name || '',
    },
    actor: buildActor(actor),
  };
}

export function buildTaskDueDateChangedPayload(card, oldDate, newDate, board, actor) {
  const workspaceId = resolveWorkspaceId(board?.department, card?.department);
  return {
    workspaceId,
    task: {
      id: card._id?.toString(),
      title: card.title,
      boardId: (card.board || board?._id)?.toString(),
    },
    oldDueDate: oldDate || null,
    newDueDate: newDate || null,
    project: {
      id: board?._id?.toString(),
      name: board?.name || '',
    },
    actor: buildActor(actor),
  };
}

// ─── Comment Payloads ────────────────────────────────────────────────────────

export function buildCommentAddedPayload(comment, card, board, actor) {
  const workspaceId = resolveWorkspaceId(board?.department, card?.department);
  return {
    workspaceId,
    comment: {
      id: comment._id?.toString(),
      text: (comment.text || comment.htmlContent || '').substring(0, 300),
      cardId: (comment.card || card?._id)?.toString(),
    },
    task: {
      id: card?._id?.toString(),
      title: card?.title || '',
      boardId: (card?.board || board?._id)?.toString(),
    },
    project: {
      id: board?._id?.toString(),
      name: board?.name || '',
    },
    actor: buildActor(actor),
  };
}

// ─── Time Entry Payload ──────────────────────────────────────────────────────

export function buildTimeEntryPayload(card, entry, board, actor) {
  const workspaceId = resolveWorkspaceId(board?.department, card?.department, entry?.department);
  return {
    workspaceId,
    timeEntry: {
      hours: entry.hours || 0,
      minutes: entry.minutes || 0,
      description: entry.description || entry.reason || '',
      date: entry.date || new Date().toISOString(),
    },
    task: {
      id: card._id?.toString(),
      title: card.title,
      boardId: (card.board || board?._id)?.toString(),
    },
    project: {
      id: board?._id?.toString(),
      name: board?.name || '',
    },
    actor: buildActor(actor),
  };
}

// ─── User Payloads ───────────────────────────────────────────────────────────

export function buildUserPayload(user, event) {
  const workspaceId = resolveWorkspaceId(user?.department);
  return {
    workspaceId,
    user: {
      id: (user._id || user.id)?.toString(),
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'employee',
      department: Array.isArray(user.department)
        ? user.department.map((d) => (d._id || d).toString())
        : user.department
          ? [user.department.toString()]
          : [],
      avatar: user.avatar || null,
      isActive: user.isActive !== false,
      isVerified: user.isVerified !== false,
    },
    event,
  };
}

export function buildUserUpdatedPayload(user, changes, actor) {
  return {
    ...buildUserPayload(user, 'USER_UPDATED'),
    changes: changes || {},
    actor: buildActor(actor),
  };
}

// ─── Announcement Payloads ───────────────────────────────────────────────────

export function buildAnnouncementPayload(announcement, actor) {
  const workspaceId = resolveWorkspaceId(
    announcement?.department,
    announcement?.departmentId,
    announcement?.subscribers?.departments,
  );
  return {
    workspaceId,
    announcement: {
      id: announcement._id?.toString(),
      title: announcement.title || '',
      description: (announcement.description || '').substring(0, 500),
      category: announcement.category || null,
      priority: announcement.priority || 'normal',
      createdAt: announcement.createdAt || new Date().toISOString(),
    },
    actor: buildActor(actor),
  };
}
