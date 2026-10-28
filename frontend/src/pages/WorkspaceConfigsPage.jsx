import { useContext, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog } from 'radix-ui';
import { Settings2, LockKeyhole, Loader, ShieldCheck, X } from 'lucide-react';
import { toast } from 'react-toastify';
import WorkspaceContext from '../context/WorkspaceContext';
import WorkspaceSettingsTabs from '../components/Workspace/WorkspaceSettingsTabs';
import { canConfigureWorkspace } from '../utils/workspaceConfigAccess';
import { getWorkspaceConfigs, verifyHubSpotPassword, validateHubSpotKey, saveHubSpotConfig, toggleHubSpotSync, setWorkspaceModule } from '../services/workspaceConfigsApi';

const encryptionNotice = 'Your HubSpot Service Key and integration credentials will be securely encrypted before being stored in FlowTask. Only authorized backend services can access the decrypted credentials when communicating with HubSpot. Your Service Key will never be displayed in its original form after saving.';
const fieldClass = 'w-full rounded-lg border p-3 text-sm bg-[var(--color-bg-base)] border-[var(--color-border-subtle)] outline-none focus:ring-2 focus:ring-emerald-500';
const buttonClass = 'rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed';
const secondaryClass = 'rounded-lg border border-[var(--color-border-subtle)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50';
const formatDate = value => value ? new Date(value).toLocaleString() : 'Not yet';
const errorMessage = error => error.response?.data?.message || 'The request could not be completed. Please try again.';

function Configs({ workspace }) {
  const workspaceId = workspace._id;
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({ queryKey: ['workspace-configs', workspaceId], queryFn: () => getWorkspaceConfigs(workspaceId), refetchInterval: 15_000, retry: false });
  const connection = data?.hubspot;
  const [dialog, setDialog] = useState(null);
  const [password, setPassword] = useState('');
  const [approval, setApproval] = useState(null);
  const [serviceKey, setServiceKey] = useState('');
  const [name, setName] = useState('');
  const [contactOwnerId, setContactOwnerId] = useState('');
  const [reconnect, setReconnect] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [validation, setValidation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [moduleBusy, setModuleBusy] = useState(null);

  const close = () => { if (busy) return; setDialog(null); setPassword(''); setServiceKey(''); setApproval(null); setValidation(null); setDialogError(''); setAcknowledged(false); setReconnect(false); };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['workspace-configs', workspaceId] });
  const open = action => { setDialog({ action, phase: 'verify', version: connection?.version || 0 }); setName(connection?.name || ''); setContactOwnerId(connection?.contactOwnerId || ''); setDialogError(''); };
  const verify = async event => {
    event.preventDefault(); setBusy(true); setDialogError('');
    try {
      const result = await verifyHubSpotPassword(workspaceId, { password, action: dialog.action, version: dialog.version });
      setPassword('');
      if (dialog.action === 'toggle') {
        await toggleHubSpotSync(workspaceId, { approval: result.approval, enabled: !connection.enabled, confirmed: true, version: dialog.version });
        setDialog(null); toast.success(connection.enabled ? 'Automatic synchronization disabled' : 'Automatic synchronization enabled. Eligible Hired Client records will be processed in the background.'); refresh();
      } else {
        setApproval({ token: result.approval, expiresAt: Date.now() + result.expiresIn * 1000 });
        setDialog({ ...dialog, phase: 'edit' });
      }
    } catch (failure) { setPassword(''); setDialogError(errorMessage(failure)); }
    finally { setBusy(false); }
  };
  const validate = async () => {
    setBusy(true); setDialogError(''); setValidation(null);
    try { setValidation(await validateHubSpotKey(workspaceId, serviceKey)); }
    catch (failure) { setDialogError(errorMessage(failure)); }
    finally { setBusy(false); }
  };
  const save = async event => {
    event.preventDefault(); setBusy(true); setDialogError('');
    try {
      if (!approval || Date.now() >= approval.expiresAt) { setDialog({ ...dialog, phase: 'verify' }); setApproval(null); setDialogError('Verification expired. Enter your password again.'); return; }
      await saveHubSpotConfig(workspaceId, { serviceKey, name, contactOwnerId, reconnect, version: dialog.version, approval: approval.token });
      setServiceKey(''); setApproval(null); setDialog(null); setAcknowledged(false); setValidation(null); setReconnect(false);
      toast.success('HubSpot configuration saved securely'); refresh();
    } catch (failure) { setDialogError(errorMessage(failure)); }
    finally { setBusy(false); }
  };
  const changeModule = async (module, enabled) => {
    setModuleBusy(module);
    try {
      await setWorkspaceModule(workspaceId, { [module]: enabled }); refresh();
      queryClient.invalidateQueries({ queryKey: ['workspace-modules', workspaceId] });
      toast.success('Workspace module settings updated');
    } catch (failure) { toast.error(errorMessage(failure)); }
    finally { setModuleBusy(null); }
  };

  return <div className="min-h-full p-4 sm:p-8" style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>
    <div className="mx-auto max-w-5xl">
      <header className="mb-5"><h1 className="text-2xl font-bold flex items-center gap-3"><Settings2 className="text-emerald-500" />Workspace Settings</h1><p className="mt-2 text-sm text-[var(--color-text-muted)]">{workspace.name} · Configuration and integrations</p></header>
      <WorkspaceSettingsTabs />
      {isPending ? <p role="status" className="flex gap-2"><Loader className="animate-spin" />Loading configurations…</p> : error ? <p role="alert">{errorMessage(error)}</p> : <>
        <section className="rounded-2xl border border-[var(--color-border-subtle)] p-5 sm:p-6 mb-6 bg-[var(--color-bg-subtle)]">
          <h2 className="text-lg font-bold">Workspace Module Settings</h2>
          <p className="text-sm mt-1 mb-5 text-[var(--color-text-muted)]">Module availability applies only to this workspace. Existing data is preserved when a module is disabled.</p>
          {[['sales', 'Sales', 'Sales pipeline, saved views, and watch alerts.'], ['finance', 'Finance', 'Finance pages and reports.'], ['leave', 'Leave', 'Leave policies, balances, approvals, and Work Calendar.'], ['attendance', 'Attendance', 'Check-ins, attendance reports, and approvals. Requires Leave’s Work Calendar.']].map(([module, label, description]) => <div key={module} className="flex items-center justify-between gap-4 py-4 border-t border-[var(--color-border-subtle)]">
            <div><h3 className="font-semibold">{label}</h3><p className="text-sm text-[var(--color-text-muted)]">{description}</p></div>
            <button type="button" role="switch" aria-checked={data.modules[module]} aria-label={`${label} module`} disabled={!!moduleBusy} className={data.modules[module] ? buttonClass : secondaryClass} onClick={() => changeModule(module, !data.modules[module])}>{moduleBusy === module ? 'Saving…' : data.modules[module] ? 'Enabled' : 'Disabled'}</button>
          </div>)}
          <p className="text-sm border-t border-[var(--color-border-subtle)] pt-4">Projects is the core module and stays available under existing access controls. Time Tracking uses its dedicated configuration in <Link className="text-emerald-600 underline" to="/workspace-settings">General settings</Link>.</p>
        </section>
        <section className="rounded-2xl border border-[var(--color-border-subtle)] p-5 sm:p-6 bg-[var(--color-bg-subtle)]">
          <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-lg font-bold">HubSpot Integration</h2><p className="text-sm mt-1 text-[var(--color-text-muted)]">FlowTask → HubSpot Contacts · Automatic, one-way synchronization</p></div><span className="self-start rounded-full px-3 py-1 text-xs bg-emerald-500/10 text-emerald-600">{!connection ? 'Not configured' : connection.status === 'error' || connection.lastError ? 'Connection needs attention' : connection.enabled ? 'Connected · Enabled' : 'Configured · Disabled'}</span></div>
          <p className="my-5 text-sm">Only projects with Project Type <strong>Hired Client</strong> are eligible. A valid client email is required. FlowTask manages name, email, and phone in the connected HubSpot account.</p>
          {!connection ? <button type="button" className={buttonClass} onClick={() => open('configure')}>Configure HubSpot</button> : <>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4 text-sm rounded-xl p-4 bg-[var(--color-bg-muted)]">
              {[['Connection name', connection.name || 'HubSpot'], ['Service Key', connection.maskedKey], ['Contact Owner', connection.contactOwnerId || 'Not configured'], ['Owner validation', connection.ownerValidation || 'Not configured'], ['HubSpot Portal ID', connection.portalId], ['Configuration version', connection.version], ['Last successful sync', formatDate(connection.lastSuccessfulSync)], ['Permissions', `Contacts read verified · Write ${connection.writeCapability}`], ['Created', formatDate(connection.createdAt)], ['Updated', formatDate(connection.updatedAt)]].map(([label, value]) => <div key={label}><dt className="text-[var(--color-text-muted)]">{label}</dt><dd className="mt-1 font-medium break-words">{value}</dd></div>)}
            </dl>
            {connection.writeCapability === 'unverified' && <p className="mt-4 text-sm text-amber-600">Contacts read access and account identity are verified. HubSpot did not provide non-destructive write permission inspection for this key. Ensure it has crm.objects.contacts.write before enabling sync. No test contact was created.</p>}
            {connection.lastError && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600">{connection.lastError}</p>}
            <div className="mt-5 flex flex-wrap gap-3"><button type="button" className={secondaryClass} onClick={() => open('configure')}>Edit Configuration</button><button type="button" role="switch" aria-checked={connection.enabled} aria-label="Automatic client synchronization" className={connection.enabled ? secondaryClass : buttonClass} onClick={() => open('toggle')}>{connection.enabled ? 'Disable automatic sync' : 'Enable automatic sync'}</button></div>
            {connection.enabled && <div className="mt-6 border-t border-[var(--color-border-subtle)] pt-5"><h3 className="font-bold mb-3">Field Mapping</h3><p className="text-sm text-[var(--color-text-muted)] mb-3">These mappings are fixed. Names split at the final word; a single name has an empty lastname.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[var(--color-border-subtle)]"><th className="py-2">FlowTask field</th><th>HubSpot property</th></tr></thead><tbody>{[['clientName (all but last word)', 'firstname'], ['clientName (last word)', 'lastname'], ['clientEmail', 'email'], ['clientWhatsappNumber', 'phone'], ['Project technologies (combined across eligible projects)', 'technology'], ['Workspace Contact Owner', 'hubspot_owner_id']].map(([source, target]) => <tr key={target} className="border-b border-[var(--color-border-subtle)]"><td className="py-3">{source}</td><td><code>{target}</code></td></tr>)}</tbody></table></div><p className="mt-4 text-xs text-[var(--color-text-muted)]">Existing eligible records are discovered automatically. Transient failures allow an initial attempt plus three retries, at least two minutes apart. Exhausted versions stay stopped until their relevant source data changes.</p></div>}
          </>}
        </section>
      </>}
      <Dialog.Root open={!!dialog} onOpenChange={value => !value && close()}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60" /><Dialog.Content onEscapeKeyDown={event => busy && event.preventDefault()} onPointerDownOutside={event => busy && event.preventDefault()} className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%_-_2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--color-border-subtle)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto" style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}>
        <Dialog.Title className="font-bold text-xl flex items-center gap-2"><LockKeyhole size={21} />{dialog?.phase === 'verify' ? 'Verify your identity' : 'Secure HubSpot configuration'}</Dialog.Title>
        <Dialog.Description className="text-sm mt-2 mb-5 text-[var(--color-text-muted)]">{dialog?.phase === 'verify' ? 'Enter your current FlowTask login password to authorize this change. Verification expires after three minutes and can be used once.' : encryptionNotice}</Dialog.Description>
        <Dialog.Close disabled={busy} aria-label="Close configuration dialog" className="absolute right-4 top-4 p-1"><X size={18} /></Dialog.Close>
        {dialogError && <p role="alert" className="mb-4 text-sm p-3 rounded-lg bg-red-500/10 text-red-600">{dialogError}</p>}
        {dialog?.phase === 'verify' ? <form onSubmit={verify}>
          {dialog.action === 'toggle' && <p className="text-sm mb-4">{connection?.enabled ? 'Disabling stops further outgoing requests and preserves contacts, mappings, and retry history.' : 'Enabling will automatically synchronize existing and future eligible Hired Client records to this HubSpot account. Confirm this intentional activation by verifying your password.'}</p>}
          <label className="block text-sm font-medium mb-2" htmlFor="hubspot-password">FlowTask password</label><input id="hubspot-password" autoFocus type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} className={fieldClass} disabled={busy} />
          <div className="flex justify-end mt-5"><button className={buttonClass} disabled={busy || !password}>{busy ? 'Verifying…' : dialog.action === 'toggle' ? 'Verify and confirm change' : 'Verify identity'}</button></div>
        </form> : <form onSubmit={save} className="space-y-4">
          <label className="block text-sm font-medium" htmlFor="hubspot-name">Connection name (optional)<input id="hubspot-name" autoFocus autoComplete="off" maxLength={100} value={name} onChange={event => setName(event.target.value)} className={`${fieldClass} mt-2`} disabled={busy} /></label>
          <label className="block text-sm font-medium" htmlFor="hubspot-key">HubSpot Service Key<input id="hubspot-key" type="password" autoComplete="new-password" spellCheck={false} required maxLength={2048} value={serviceKey} onChange={event => { setServiceKey(event.target.value); setValidation(null); }} className={`${fieldClass} mt-2`} disabled={busy} /></label>
          <label className="block text-sm font-medium" htmlFor="hubspot-owner">Contact Owner (optional)<input id="hubspot-owner" type="text" inputMode="numeric" pattern="[1-9][0-9]*" maxLength={20} autoComplete="off" value={contactOwnerId} onChange={event => setContactOwnerId(event.target.value)} className={`${fieldClass} mt-2`} disabled={busy} /><span className="block mt-1 text-xs">Enter the HubSpot Owner ID, not the User ID. Blank preserves existing HubSpot ownership. Owner verification requires crm.objects.owners.read; without it validation is shown as unverified.</span></label>
          <p className="text-xs text-[var(--color-text-muted)]">Required scopes: crm.objects.contacts.read and crm.objects.contacts.write. Do not enter a HubSpot login password.</p>
          {connection && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reconnect} onChange={event => setReconnect(event.target.checked)} disabled={busy || connection.enabled} /><span>I confirm reconnecting to a different account, if detected. Sync must be disabled first; old account mappings remain separate.</span></label>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} disabled={busy} /><span>I understand how my Service Key is encrypted and used.</span></label>
          {validation && <p role="status" className="text-sm text-emerald-600 flex items-start gap-2"><ShieldCheck size={18} />Portal {validation.portalId}: Contacts read verified; write permission {validation.writeCapability}.</p>}
          <div className="flex flex-wrap justify-end gap-3 pt-2"><button type="button" className={secondaryClass} disabled={busy || !serviceKey} onClick={validate}>Validate connection</button><button className={buttonClass} disabled={busy || !serviceKey || !acknowledged}>{busy ? 'Processing…' : 'Validate and save securely'}</button></div>
        </form>}
      </Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  </div>;
}
export default function WorkspaceConfigsPage() {
  const { currentWorkspace } = useContext(WorkspaceContext);
  if (!currentWorkspace) return <p role="status" className="p-8">Loading workspace…</p>;
  if (!canConfigureWorkspace(currentWorkspace)) return <Navigate to="/workspace-settings" replace />;
  return <Configs key={currentWorkspace._id} workspace={currentWorkspace} />;
}
