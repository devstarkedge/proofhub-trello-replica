# Add New Member Feature Implementation

## Backend Changes
- [ ] Add `adminCreateUser` function to `backend/controllers/authController.js`
- [ ] Add POST route `/admin-create-user` to `backend/routes/auth.js` with admin authorization

## Frontend Changes
- [ ] Update `frontend/src/pages/TeamManagement.jsx`:
  - [x] Add visibility check for admin-only button
  - [ ] Add "Add New Member" button in right column header
  - [ ] Add modal state and form state for new user creation
  - [ ] Implement form with Email, Password, Department, Role fields
  - [ ] Add form validation
  - [ ] Integrate API call to new backend endpoint
  - [ ] Add success/error toast notifications
  - [ ] Refresh data on successful creation

## Testing
- [ ] Test new user creation flow
- [ ] Verify role-based visibility
- [ ] Test form validation and error handling
- [ ] Test responsiveness and animations
