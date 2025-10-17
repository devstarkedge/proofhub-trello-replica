# Project CRUD Implementation Plan

## Backend Changes
- [ ] Update boardController.js to remove project from department's projects array on delete
- [ ] Ensure proper authorization for board updates/deletes

## Frontend Changes
- [ ] Update WorkFlow.jsx to extract deptId/projectId from URL and display names
- [ ] Add edit and delete buttons to ProjectCard.jsx
- [ ] Create EditProjectModal.jsx component for editing projects
- [ ] Update AddProjectModal.jsx to support edit mode (or use new EditProjectModal)
- [ ] Add delete functionality to ProjectCard.jsx with confirmation
- [ ] Update HomePage.jsx to handle project updates/deletes
- [ ] Add updateBoard and deleteBoard methods to database.js service
- [ ] Update routes if needed for proper flow

## Testing
- [ ] Test CRUD operations on projects
- [ ] Verify workflow page displays correct department/project names
- [ ] Ensure proper authorization for edit/delete operations
