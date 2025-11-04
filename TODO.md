# Cache Invalidation Fix Plan

## Overview
Fix cache invalidation across all controllers to ensure UI updates immediately when data changes, instead of waiting for cache TTL to expire.

## Steps to Complete

### 1. Add cache invalidation to boardController.js
- [x] Import invalidateCache in boardController.js
- [x] Add invalidation in createBoard for `/api/boards` and `/api/boards/department/${department}`
- [x] Add invalidation in updateBoard for `/api/boards` and `/api/boards/${id}`
- [x] Add invalidation in deleteBoard for `/api/boards` and `/api/boards/department/${department}`

### 2. Add cache invalidation to listController.js
- [x] Import invalidateCache in listController.js
- [x] Add invalidation in createList for `/api/lists/board/${board}`
- [x] Add invalidation in updateList for `/api/lists/board/${list.board}`
- [x] Add invalidation in updateListPosition for `/api/lists/board/${list.board}`
- [x] Add invalidation in deleteList for `/api/lists/board/${list.board}`

### 3. Add cache invalidation to commentController.js
- [x] Import invalidateCache in commentController.js
- [x] Add invalidation in createComment for related card/board caches
- [x] Add invalidation in updateComment for related card/board caches
- [x] Add invalidation in deleteComment for related card/board caches

### 4. Add cache invalidation to departmentController.js
- [x] Import invalidateCache in departmentController.js
- [x] Add invalidation in createDepartment for `/api/departments`
- [x] Add invalidation in updateDepartment for `/api/departments` and `/api/departments/${id}`
- [x] Add invalidation in deleteDepartment for `/api/departments`
- [x] Add invalidation in addMemberToDepartment for `/api/departments/${id}`
- [x] Add invalidation in removeMemberFromDepartment for `/api/departments/${id}`

### 5. Add cache invalidation to teamController.js
- [x] Import invalidateCache in teamController.js
- [x] Add invalidation in createTeam for `/api/teams`
- [x] Add invalidation in updateTeam for `/api/teams` and `/api/teams/${id}`
- [x] Add invalidation in deleteTeam for `/api/teams`
- [x] Add invalidation in addMember for `/api/teams/${id}`

### 6. Review cache middleware skip paths
- [x] Review DYNAMIC_PATHS and skipPaths in cache.js
- [x] Adjust if needed based on new invalidation patterns

## Testing
- [ ] Test board creation/update/deletion cache invalidation
- [ ] Test list operations cache invalidation
- [ ] Test comment operations cache invalidation
- [ ] Test department operations cache invalidation
- [ ] Test team operations cache invalidation
- [ ] Verify UI updates immediately after data changes
- [ ] Monitor performance impact

## Completion Criteria
- All data update operations invalidate relevant caches
- UI reflects changes immediately without waiting for cache expiration
- No performance degradation from excessive invalidation
