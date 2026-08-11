// Extracted from Avatar.jsx so it can be imported by non-Avatar consumers
// (e.g. CreateWorkspaceWizard's BrandingPreview) without violating the
// "a component file may only export components" react-refresh/vite rule.
const GRADIENTS = [
  'from-blue-500 via-indigo-500 to-purple-600',
  'from-green-400 via-emerald-500 to-teal-600',
  'from-orange-400 via-red-500 to-pink-600',
  'from-cyan-400 via-blue-500 to-indigo-600',
  'from-violet-400 via-purple-500 to-fuchsia-600',
  'from-amber-400 via-orange-500 to-red-600',
  'from-teal-400 via-cyan-500 to-blue-600',
  'from-rose-400 via-pink-500 to-purple-600'
];

// Get a consistent gradient based on name — same name always maps to the
// same gradient, so an initials-fallback avatar never changes color on
// re-render.
export const getGradient = (name) => {
  if (!name) return GRADIENTS[0];
  const charCode = name.charCodeAt(0) + (name.length > 1 ? name.charCodeAt(1) : 0);
  return GRADIENTS[charCode % GRADIENTS.length];
};

export default getGradient;
