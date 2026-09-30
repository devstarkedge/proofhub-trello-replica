/**
 * The shared "which departments/employees does this manager actually
 * manage" facade — the single source of truth every module needs,
 * instead of each reimplementing Department.managers-derived scoping (or
 * worse, trusting a membership's own `department` array as if it meant
 * "departments I manage," which it does not — that array is "departments
 * I belong to").
 *
 * This is a thin re-export, not a new implementation: the real resolver
 * lives in ../leave/leaveAuthorization.service.js, already built, tested,
 * and proven against a custom-role manager (a user whose role string is
 * NOT literally 'manager' but who IS listed in Department.managers gets
 * identical department-scoped access — see leaveDashboardScope.test.js).
 * Department-manager relationships are workspace-organizational data, not
 * a Leave concept — this facade exposes that resolver under a neutral
 * path so Attendance (and any future module) can depend on it without an
 * odd-looking cross-domain import, mirroring workCalendarFacade.js's own
 * precedent exactly. If department-manager resolution ever moves out from
 * under the Leave module, only this file's re-export target changes — no
 * consumer of the facade needs to know.
 */
export { getManagedDepartmentIds, getManagedEmployeeIds } from '../leave/leaveAuthorization.service.js';
