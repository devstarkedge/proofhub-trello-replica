export const resolveDepartmentScope = ({ role, department, requestedDepartmentId }) => {
  const normalizedRole = (role || '').toLowerCase();
  const requested = requestedDepartmentId && requestedDepartmentId !== 'all'
    ? requestedDepartmentId
    : null;

  const departmentIds = Array.isArray(department)
    ? department
        .map((dept) => (dept && dept._id ? dept._id.toString() : dept))
        .filter(Boolean)
        .map((dept) => dept.toString())
    : department
      ? [(department && department._id ? department._id.toString() : department).toString()]
      : [];

  if (normalizedRole === 'admin') {
    return {
      departmentIds: requested ? [requested.toString()] : null
    };
  }

  if (normalizedRole === 'manager') {
    if (departmentIds.length === 0) {
      return { departmentIds: [] };
    }

    if (requested) {
      const requestedId = requested.toString();
      const isAllowed = departmentIds.includes(requestedId);
      if (!isAllowed) {
        throw new Error('Not authorized to access this department stats');
      }
      return { departmentIds: [requestedId] };
    }

    return { departmentIds };
  }

  throw new Error('Not authorized to access department stats');
};
