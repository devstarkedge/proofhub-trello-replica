// Mirrored from backend/utils/workspaceOptions.js — keep both in sync (two-
// package repo, no shared module linking). The backend re-validates every
// value independently; this copy only drives which fields render and what
// they're labeled.
import { Building2, Users, User } from 'lucide-react';

export const WORKSPACE_TYPES = [
  {
    value: 'company',
    label: 'Company',
    description: 'A full organization with departments, industry, and team size',
    icon: Building2
  },
  {
    value: 'team',
    label: 'Team',
    description: 'A focused team working on projects together',
    icon: Users
  },
  {
    value: 'personal',
    label: 'Personal',
    description: 'Just for you — minimal setup, one default space for your work',
    icon: User
  }
];

export const INDUSTRY_OPTIONS = [
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'education', label: 'Education' },
  { value: 'retail_ecommerce', label: 'Retail & E-commerce' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'marketing_advertising', label: 'Marketing & Advertising' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'media_entertainment', label: 'Media & Entertainment' },
  { value: 'nonprofit', label: 'Nonprofit' },
  { value: 'government', label: 'Government' },
  { value: 'other', label: 'Other' }
];

export const COMPANY_SIZE_OPTIONS = [
  { value: 'solo', label: 'Just me' },
  { value: '2-10', label: '2–10 people' },
  { value: '11-50', label: '11–50 people' },
  { value: '51-200', label: '51–200 people' },
  { value: '201-500', label: '201–500 people' },
  { value: '501-1000', label: '501–1000 people' },
  { value: '1000+', label: '1000+ people' }
];

// Which Step 2 fields each workspace type requires — mirrors
// backend/utils/workspaceOptions.js's WORKSPACE_TYPE_RULES exactly. The
// backend is the one that actually gates creation; this copy only decides
// what Step 2 renders and marks as required.
export const WORKSPACE_TYPE_RULES = {
  company: { requiresIndustry: true, requiresCompanySize: true, requiresDepartment: true, autoDepartmentName: null },
  team: { requiresIndustry: false, requiresCompanySize: false, requiresDepartment: true, autoDepartmentName: null },
  personal: { requiresIndustry: false, requiresCompanySize: false, requiresDepartment: false, autoDepartmentName: 'General' }
};
