# TODO: Implement HomePage UI after Login/Signup

## Overview
Repurpose Dashboard as HomePage with UI matching the provided image: Left sidebar navigation, top header, main grid of department/project cards. Post-login/signup redirects to HomePage. Clicking a project card navigates to department/project-specific WorkFlow.

## Steps

- [x] Step 1: Update App.jsx - Change "/" route to Dashboard (remove role restriction), add "/workflow/:deptId/:projectId" route to WorkFlow.

- [ ] Step 2: Update LoginPage.jsx - Change navigate('/') to navigate('/dashboard').

- [ ] Step 3: Update RegisterPage.jsx - Change navigate('/') to navigate('/dashboard').

- [x] Step 4: Create new Sidebar.jsx - Vertical left sidebar with nav items (Home, Projects, Teams, etc.), using Tailwind and Lucide icons.

- [x] Step 5: Create new ProjectCard.jsx - Reusable card component for projects/depts: Colored background, image placeholder, title, description, onClick navigation.

- [x] Step 6: Update Dashboard.jsx - Rename/repurpose to HomePage: Integrate Sidebar + Header + main grid. Fetch departments/boards via Database, render ProjectCard grid. Use responsive grid layout. (Used sample data for now)

- [x] Step 7: Update WorkFlow.jsx - Use useParams to get deptId/projectId, filter fetched boards/cards by these params (modify loadBoards or similar).

- [ ] Step 8: Update services/database.js - Add methods like getDepartments() and getBoardsByDepartment(deptId) if not present (wrap API calls to /api/departments and /api/boards?deptId=).

- [ ] Step 9: Backend additions - If needed, create routes/controllers for /api/departments (list depts with associated boards/projects).

- [ ] Step 10: Test - Run frontend (`npm run dev` in frontend/), login, verify UI, navigation, filtering in WorkFlow. Use browser_action if needed for visual check.

- [ ] Step 11: Update TODO.md - Mark completed steps and finalize.
