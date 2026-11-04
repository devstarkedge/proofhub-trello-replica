export const announcementEmojis = ['👍', '❤️', '🎉', '🔥', '👀'];
export const entityId = value => String(value?._id || value || '');

// Immutable updates are shared by the web and desktop optimistic UI.
export function setAnnouncementReaction(reactions = [], emoji, user, present) {
  const merged = new Map();
  for (const reaction of reactions) {
    const users = merged.get(reaction.emoji) || new Map();
    for (const member of reaction.users || []) users.set(entityId(member), member);
    merged.set(reaction.emoji, users);
  }
  const users = merged.get(emoji) || new Map();
  if (present) users.set(entityId(user), user);
  else users.delete(entityId(user));
  merged.set(emoji, users);
  return [...merged].filter(([, members]) => members.size).map(([key, members]) => ({
    emoji: key, users: [...members.values()], count: members.size
  }));
}

export function filterAnnouncements(rows, { search = '', category = 'all', sort = 'latest', archived = false } = {}) {
  const term = search.trim().toLocaleLowerCase();
  return rows.filter(row => Boolean(row.isArchived) === archived &&
    (category === 'all' || row.category === category) &&
    (!term || `${row.title} ${row.description}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => {
      if (sort !== 'oldest' && sort !== 'scheduled') {
        const pinned = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
        if (pinned) return pinned;
        if (a.isPinned && b.isPinned) return (a.pinPosition || 3) - (b.pinPosition || 3);
      }
      if (sort === 'category' && a.category !== b.category) return a.category.localeCompare(b.category);
      const date = sort === 'oldest' ? +new Date(a.createdAt) - +new Date(b.createdAt) : +new Date(b.createdAt) - +new Date(a.createdAt);
      return date || entityId(b).localeCompare(entityId(a));
    });
}
