import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';
import WorkCalendarBasePatternEditor from './WorkCalendarBasePatternEditor';
import RecurringRuleManager from './RecurringRuleManager';
import DateOverrideManager from './DateOverrideManager';
import WorkCalendarPreviewCalendar from './WorkCalendarPreviewCalendar';
import WorkCalendarDiffConfirmModal from './WorkCalendarDiffConfirmModal';
import { buildWorkCalendarDiff } from '../../../utils/workCalendarDiff';
import * as leaveApi from '../../../services/leaveApi';

const DEFAULT_WEEKLY_PATTERN = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek, isWorkingDay: dayOfWeek >= 1 && dayOfWeek <= 5, isHalfWorkingDay: false
}));

function draftFromServerConfig(config) {
  return {
    weeklyPattern: config?.workCalendar?.weeklyPattern
      ? config.workCalendar.weeklyPattern.map((d) => ({ ...d }))
      : DEFAULT_WEEKLY_PATTERN.map((d) => ({ ...d })),
    standardWorkMinutesPerDay: config?.workCalendar?.standardWorkMinutesPerDay ?? 480,
    recurringRules: (config?.recurringRules || []).map((r) => ({ dayOfWeek: r.dayOfWeek, occurrence: r.occurrence, action: r.action, label: r.label || '' })),
    dateOverrides: (config?.dateOverrides || []).map((o) => ({ date: String(o.date).slice(0, 10), type: o.type, reason: o.reason, isHalfDay: Boolean(o.isHalfDay) }))
  };
}

const SectionCard = ({ title, description, children }) => (
  <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-bg-subtle)' }}>
    <p className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</p>
    {description && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{description}</p>}
    <div className="mt-4">{children}</div>
  </div>
);

/**
 * Base pattern + recurring rules + date overrides, edited together as one
 * draft and saved atomically — no request goes to the server until "Save
 * Work Calendar" is pressed. See workCalendarSettings.service.js on the
 * backend for the single atomic save/validate/audit/realtime operation
 * this panel calls.
 */
const WorkCalendarSettingsPanel = () => {
  const [serverConfig, setServerConfig] = useState(null);
  const [draft, setDraft] = useState(null);
  const [diff, setDiff] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [staleNotice, setStaleNotice] = useState(false);

  const load = useCallback(() => {
    leaveApi.getWorkCalendarConfig().then(({ data }) => {
      setServerConfig(data);
      setDraft(draftFromServerConfig(data));
      setStaleNotice(false);
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const isDirty = useMemo(() => {
    if (!serverConfig || !draft) return false;
    return buildWorkCalendarDiff({ serverConfig, draft }).length > 0;
  }, [serverConfig, draft]);

  // A calendar change from elsewhere (another admin, another tab) while
  // this admin has no unsaved edits just reloads quietly; with unsaved
  // edits open, it's surfaced as a non-destructive notice instead of
  // silently discarding their draft.
  useEffect(() => {
    const onCalendarUpdated = () => { if (isDirty) setStaleNotice(true); else load(); };
    window.addEventListener('socket-leave-calendar-updated', onCalendarUpdated);
    return () => window.removeEventListener('socket-leave-calendar-updated', onCalendarUpdated);
  }, [isDirty, load]);

  if (!draft) return null;

  const handleSaveClick = () => {
    const computedDiff = buildWorkCalendarDiff({ serverConfig, draft });
    if (!computedDiff.length) {
      toast.info('No changes to save');
      return;
    }
    setDiff(computedDiff);
  };

  const confirmSave = async () => {
    setSubmitting(true);
    try {
      await leaveApi.saveWorkCalendarConfig(draft);
      toast.success('Work Calendar updated successfully.');
      setDiff(null);
      load();
    } catch { /* The API interceptor owns error notifications. */ } finally { setSubmitting(false); }
  };

  const cancelDraft = () => setDraft(draftFromServerConfig(serverConfig));

  return (
    <div className="space-y-5">
      {staleNotice && (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs"
          style={{ borderColor: 'var(--color-info-text)', backgroundColor: 'var(--color-info-subtle)', color: 'var(--color-info-text)' }}
        >
          <span>The Work Calendar changed elsewhere. Your unsaved edits are kept — reload to see the latest saved configuration.</span>
          <Button type="button" size="sm" variant="outline" onClick={load} className="flex flex-none items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Reload
          </Button>
        </div>
      )}

      <SectionCard title="Standard Week" description="Set the base working pattern every day in the workspace follows unless a rule or override says otherwise.">
        <WorkCalendarBasePatternEditor
          weeklyPattern={draft.weeklyPattern}
          standardWorkMinutesPerDay={draft.standardWorkMinutesPerDay}
          onChange={({ weeklyPattern, standardWorkMinutesPerDay }) => setDraft({ ...draft, weeklyPattern, standardWorkMinutesPerDay })}
        />
      </SectionCard>

      <SectionCard title="Alternate / Recurring Days" description="Nth-weekday overrides on top of the standard week — e.g. only the 2nd and 4th Saturday are working.">
        <RecurringRuleManager rules={draft.recurringRules} onChange={(recurringRules) => setDraft({ ...draft, recurringRules })} />
      </SectionCard>

      <SectionCard title="Special Date Overrides" description="Correct one specific date without touching the standard week or any recurring rule.">
        <DateOverrideManager overrides={draft.dateOverrides} onChange={(dateOverrides) => setDraft({ ...draft, dateOverrides })} />
      </SectionCard>

      <SectionCard title="Calendar Preview" description="Exactly how the draft configuration below will classify each day once saved — not yet applied to the workspace.">
        <WorkCalendarPreviewCalendar draft={draft} />
      </SectionCard>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={cancelDraft} disabled={!isDirty || submitting}>Cancel</Button>
        <Button type="button" onClick={handleSaveClick} disabled={!isDirty || submitting}>Save Work Calendar</Button>
      </div>

      {diff && (
        <WorkCalendarDiffConfirmModal diff={diff} submitting={submitting} onCancel={() => setDiff(null)} onConfirm={confirmSave} />
      )}
    </div>
  );
};

export default WorkCalendarSettingsPanel;
