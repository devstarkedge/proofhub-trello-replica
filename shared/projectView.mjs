// Shared by workspace preferences and any project collection view.
export const PROJECT_SORT_OPTIONS = Object.freeze([
  { value: 'default', label: 'Default order' },
  { value: 'name_asc', label: 'A to Z' },
  { value: 'name_desc', label: 'Z to A' },
  { value: 'recent', label: 'Recently Added' },
]);
export const isProjectSort = value => PROJECT_SORT_OPTIONS.some(option => option.value === value);
export const normalizeSearch = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const createdTime = project => Date.parse(project.createdAt) || 0;

export function sortProjects(projects = [], sort = 'default') {
  if (!isProjectSort(sort) || sort === 'default') return projects;
  return [...projects].sort((a, b) => {
    const primary = sort === 'recent'
      ? createdTime(b) - createdTime(a)
      : compareText(normalizeSearch(a.name), normalizeSearch(b.name)) * (sort === 'name_desc' ? -1 : 1);
    return primary || compareText(String(a._id), String(b._id));
  });
}

export function orderDepartments(departments, savedOrder = []) {
  const byId = new Map(departments.map(department => [String(department._id), department]));
  const result = [];
  for (const id of savedOrder) {
    if (byId.has(id)) {
      result.push(byId.get(id));
      byId.delete(id);
    }
  }
  return [...result, ...byId.values()];
}

export function promoteDepartments(departments, matchingIds) {
  // Stable partition: temporary ranking never mutates saved order or API data.
  return [
    ...departments.filter(department => matchingIds.has(String(department._id))),
    ...departments.filter(department => !matchingIds.has(String(department._id))),
  ];
}

export function normalizePreferences(value) {
  return {
    departmentOrder: Array.isArray(value?.departmentOrder)
      ? [...new Set(value.departmentOrder.filter(id => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)))]
      : [],
    projectSort: isProjectSort(value?.projectSort) ? value.projectSort : 'default',
  };
}
