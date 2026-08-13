// Mirrored at frontend/src/components/Workspace/CreateWorkspaceWizard/shared/constants.js
// — keep both lists in sync (two-package repo, no shared module linking).
export const WORKSPACE_TYPES = ['company', 'team'];

export const INDUSTRY_OPTIONS = [
  'technology', 'finance', 'healthcare', 'education', 'retail_ecommerce',
  'manufacturing', 'marketing_advertising', 'consulting', 'real_estate',
  'media_entertainment', 'nonprofit', 'government', 'other'
];

export const COMPANY_SIZE_OPTIONS = ['solo', '2-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

// Which Step 2 fields each workspace type requires, enforced server-side in
// createWorkspace — the frontend mirrors this for conditional rendering, but
// this copy is the one that actually gates creation.
export const WORKSPACE_TYPE_RULES = {
  company: { requiresIndustry: true, requiresCompanySize: true, requiresDepartment: true, autoDepartmentName: null },
  team: { requiresIndustry: false, requiresCompanySize: false, requiresDepartment: true, autoDepartmentName: null }
};

export const isValidWorkspaceType = (type) => WORKSPACE_TYPES.includes(type);
export const isValidIndustry = (industry) => INDUSTRY_OPTIONS.includes(industry);
export const isValidCompanySize = (size) => COMPANY_SIZE_OPTIONS.includes(size);

// Company workspaces support custom roles; Team workspaces do not.
// Mirrored at frontend/src/components/Workspace/CreateWorkspaceWizard/shared/constants.js.
export const isCustomRoleCreationAllowed = (workspaceType) => workspaceType === 'company';
