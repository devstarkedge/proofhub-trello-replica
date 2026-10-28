import { CircleCheck } from 'lucide-react';

export default function HubSpotOwnerStatus({ connection }) {
  if (!connection?.contactOwnerId) return <span>Not configured</span>;
  if (connection.ownerMissingScopes?.includes('crm.objects.owners.read')) return <span className="text-red-600">Missing scope - <code>crm.objects.owners.read</code></span>;
  if (connection.ownerValidation === 'verified') return <span className="inline-flex items-center gap-1.5"><span>{connection.contactOwnerName || `Owner ${connection.contactOwnerId}`}</span><CircleCheck size={17} className="shrink-0 text-emerald-600" aria-hidden="true" /><span className="sr-only">Verified</span></span>;
  if (connection.ownerValidation === 'invalid') return <span className="text-red-600">Owner not found or inactive</span>;
  return <span className="text-amber-700">Owner verification unavailable</span>;
}
