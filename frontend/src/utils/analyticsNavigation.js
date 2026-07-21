const entityId = (value) => value?._id || value?.id || value;

export const analyticsProjectHref = (project) => {
  const departmentId = entityId(project?.departmentId || project?.department);
  const projectId = entityId(project?.projectId || project?.board || project?.id || project?._id);
  return departmentId && projectId ? `/workflow/${departmentId}/${projectId}` : '';
};

export const analyticsTaskHref = (task) => {
  const projectHref = analyticsProjectHref(task);
  const taskId = entityId(task?.taskId || task?.id || task?._id);
  return projectHref && taskId ? `${projectHref}/${taskId}` : '';
};
