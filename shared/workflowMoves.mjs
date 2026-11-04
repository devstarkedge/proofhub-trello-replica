// Keep list membership, normalized positions and the card lookup consistent.
// Only the affected lists are copied, including during a single-card rollback.
export const referenceId = value => String(value?._id || value || '');

export function placeWorkflowCard(cardsByList, cardId, destination, position, updates = {}) {
  const target = referenceId(destination);
  let moved;
  const next = { ...cardsByList };
  for (const [listId, cards] of Object.entries(cardsByList)) {
    const card = cards.find(item => item._id === cardId);
    if (!card) continue;
    moved = { ...card, ...updates, list: target };
    next[listId] = cards.filter(item => item._id !== cardId).map((item, index) => ({ ...item, position: index }));
  }
  if (!moved || !target) return cardsByList;
  const cards = [...(next[target] || [])];
  cards.splice(Math.max(0, Math.min(position ?? cards.length, cards.length)), 0, moved);
  next[target] = cards.map((item, index) => ({ ...item, position: index }));
  return next;
}
