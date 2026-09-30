// Populate options for `<estimation|logged|billed>Time.user`.
//
// Time entries outlive the users who created them. When the referenced user
// has been deleted, a plain populate resolves `user` to null, which drops the
// owner id and breaks every consumer that reads `entry.user._id`. `transform`
// runs for missing docs too, so we keep the original id and a placeholder name.
export const timeEntryUserPopulate = (path) => ({
  path,
  select: 'name email avatar',
  transform: (doc, id) => doc || { _id: id, name: 'Deleted user' },
});
