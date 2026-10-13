import { normalizeSearch } from '../../../shared/projectView.mjs';

export function createProjectSearchIndex(departments) {
  return departments.map(department => ({
    id: String(department._id),
    name: normalizeSearch(department.name),
    projects: (department.projects || []).map(project => ({
      id: String(project._id),
      text: `${normalizeSearch(project.name)}\n${normalizeSearch(project.description)}`,
    })),
  }));
}

export function searchProjectIndex(index, query) {
  query = normalizeSearch(query);
  const projects = {};
  const matchingDepartments = [];
  for (const department of index) {
    const departmentMatch = !!query && department.name.includes(query);
    const matches = department.projects.filter(project => !query || departmentMatch || project.text.includes(query));
    projects[department.id] = matches.map(project => project.id);
    if (departmentMatch || matches.length) matchingDepartments.push(department.id);
  }
  return { projects, matchingDepartments };
}
