import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { getCases, getAlerts, getAudit, getSummary, getPermissions, getHealth, getLiveEvents, getCase, assignCase, resolveCaseAlert } from './api';
import './App.css';
const PAGES = {
  operations: ['Operations overview', 'A clear view of case flow, urgent work and accountability.', 'grid'],
  cases: ['Case register', 'Find a record, review its needs and take the next action.', 'folder'],
  alerts: ['Alert triage', 'Investigate exceptions and record a clear resolution.', 'bell'],
  governance: ['Governance & controls', 'Understand role permissions and review recorded oversight activity.', 'shield'],
  audit: ['Audit trail', 'Trace who acted, what changed and why.', 'history']
};
const fmt = value => value == null ? '—' : Number(value).toLocaleString('en-IE');
const human = value => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/^./, s => s.toUpperCase());
const stamp = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('en-IE', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  year: 'numeric'
}) : 'Not recorded';
const time = value => Date.parse(value) || 0;
const display = value => value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const tone = value => /critical|overdue|^high$/i.test(value || '') ? 'danger' : /unallocated|medium|required|open|pending/i.test(value || '') ? 'warning' : /allocated|resolved|completed/i.test(value || '') ? 'success' : 'neutral';
const isRecentCase = item => {
  const value = item?.event_time || item?.referral_date;
  const t = Date.parse(value);
  return Number.isFinite(t) && Date.now() - t >= 0 && Date.now() - t <= 24 * 60 * 60 * 1000;
};
const ageLabel = value => {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return 'Age unavailable';
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m open`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h open`;
  return `${Math.floor(hours / 24)}d open`;
};

function Icon({
  name = 'grid',
  size = 18,
  ...props
}) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /><path d="M12 6v5m0 3h.01" /></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
    history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
    refresh: <><path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.grid}</svg>;
}
function Badge({
  children,
  type
}) {
  return <span className={`badge ${type || tone(children)}`}><i />{children || 'Unknown'}</span>;
}
function Button({
  children,
  icon,
  variant = 'secondary',
  className = '',
  ...props
}) {
  return <button className={`btn ${variant} ${className}`} {...props}>{icon && <Icon name={icon} size={16} />}{children}</button>;
}
function Empty({
  title = 'No records to show',
  description = 'Try adjusting your filters.',
  icon = 'search',
  children
}) {
  return <div className="empty"><span className="empty-icon"><Icon name={icon} size={25} /></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}
function Skeleton() {
  return <div className="skeletons" role="status" aria-label="Loading records">{[1, 2, 3, 4, 5].map(i => <div className="skeleton" key={i} />)}<span className="sr-only">Loading records</span></div>;
}
function Panel({
  title,
  description,
  action,
  children,
  className = ''
}) {
  return <section className={`panel ${className}`}><div className="panel-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}
function Field({
  label,
  children,
  className = ''
}) {
  return <label className={`field ${className}`}><span>{label}</span>{children}</label>;
}
function Select({
  label,
  value,
  onChange,
  options,
  all = 'All'
}) {
  return <Field label={label}><select value={value} onChange={e => onChange(e.target.value)}><option value="">{all}</option>{options.map(v => <option key={v} value={v}>{human(v)}</option>)}</select></Field>;
}
function Metric({
  label,
  value,
  detail,
  icon,
  type = '',
  onClick
}) {
  return <button className={`metric ${type}`} onClick={onClick}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon name={icon} /></span></div><strong>{fmt(value)}</strong><div className="metric-bottom"><span>{detail}</span><Icon name="arrow" size={16} /></div></button>;
}
function Table({
  children,
  label
}) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={label}><table>{children}</table></div>;
}
function Pager({
  count,
  page,
  setPage,
  size = 20
}) {
  const max = Math.max(1, Math.ceil(count / size));
  return <div className="pager"><span>{count ? `${fmt((page - 1) * size + 1)}–${fmt(Math.min(page * size, count))} of ${fmt(count)}` : '0 records'}</span><div><Button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {max}</span><Button disabled={page >= max} onClick={() => setPage(page + 1)}>Next</Button></div></div>;
}
function Review({
  item
}) {
  return item.safety_review_overdue ? <Badge type="danger">Overdue</Badge> : item.safety_review_required ? <Badge type="warning">Required</Badge> : <span className="muted">Not required</span>;
}
function AuditFeed({
  items,
  loading,
  available
}) {
  if (loading && !available) return <Skeleton />;
  if (!available) return <Empty title="Activity unavailable" description="Refresh to retry the audit request." icon="history" />;
  if (!items.length) return <Empty title="No activity recorded" description="Recorded events will appear here after a refresh." icon="history" />;
  return <ol className="timeline">{items.slice(0, 5).map((a, i) => <li key={`${a.timestamp}-${i}`}><span className={`event-icon ${a.action === 'ASSIGN_WORKER' ? 'teal' : ''}`}><Icon name={a.action === 'ASSIGN_WORKER' ? 'users' : a.action === 'RESOLVE_ALERT' ? 'check' : 'history'} size={15} /></span><div><strong>{human(a.action)}</strong><p>{a.target_id || 'System'} <span>· {a.actor_role || 'Unknown role'}</span></p><time>{stamp(a.timestamp)}</time></div></li>)}</ol>;
}
function LiveEventFeed({ items, loading, available }) {
  if (loading && !available) return <Skeleton />;
  if (!available) return <Empty title="Live feed unavailable" description="Refresh to retry the event feed." icon="history" />;
  if (!items.length) return <Empty title="No live events yet" description="Scheduled synthetic referrals and operational changes will appear here." icon="history" />;
  return <ol className="timeline live-timeline">{[...items].sort((a, b) => time(b.event_time) - time(a.event_time)).slice(0, 6).map((event, i) => <li key={`${event.event_id || event.event_time}-${i}`}><span className={`event-icon ${event.event_type === 'CASE_CREATED' ? 'teal' : ''}`}><Icon name={event.event_type === 'CASE_CREATED' ? 'folder' : event.event_type === 'WORKER_ASSIGNED' ? 'users' : 'history'} size={15} /></span><div><strong>{human(event.event_type)}</strong><p>{event.case_id || 'System'} <span>· {event.region || 'Region not recorded'}</span></p><time>{stamp(event.event_time)}</time></div></li>)}</ol>;
}

export default function App() {
  const [activePage, setActivePage] = useState('operations');
  const [mobileNav, setMobileNav] = useState(false);
  const [data, setData] = useState({
    cases: null,
    alerts: null,
    audit: null,
    summary: null,
    permissions: null,
    liveEvents: null,
    health: null
  });
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [updated, setUpdated] = useState(null);
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [busy, setBusy] = useState(false);
  const loadingRef = useRef(false);
  const caseRequest = useRef(0);
  const previousTotalRef = useRef(null);
  const [casePreset, setCasePreset] = useState({});
  const [alertPreset, setAlertPreset] = useState({});
  const loadData = useCallback(async (silent = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!silent) setLoading(true);
    const tasks = {
      cases: getCases,
      alerts: getAlerts,
      audit: getAudit,
      summary: getSummary,
      permissions: getPermissions,
      liveEvents: getLiveEvents,
      health: getHealth
    };
    const keys = Object.keys(tasks);
    const results = await Promise.allSettled(keys.map(key => tasks[key]()));
    const fresh = {},
      failures = {};
    results.forEach((result, i) => {
      const key = keys[i];
      if (result.status === 'fulfilled') {
        const value = result.value;
        if (['cases', 'alerts', 'audit', 'liveEvents'].includes(key)) {
          if (!Array.isArray(value?.items)) failures[key] = 'Unexpected response format.';else fresh[key] = value.items;
        } else if (!value || typeof value !== 'object' || Array.isArray(value)) failures[key] = 'Unexpected response format.';else fresh[key] = value;
      } else failures[key] = result.reason?.message || 'Unable to load data.';
    });
    setData(old => ({
      ...old,
      ...fresh
    }));
    if (fresh.summary?.total_cases != null) {
      const currentTotal = Number(fresh.summary.total_cases);
      const previousTotal = previousTotalRef.current;
      if (previousTotal != null && currentTotal > previousTotal) {
        const added = currentTotal - previousTotal;
        setNotice(`${added} new referral${added === 1 ? '' : 's'} received.`);
      }
      previousTotalRef.current = currentTotal;
    }
    setErrors(failures);
    if (!Object.keys(failures).length) setUpdated(new Date());
    if (!silent) setLoading(false);
    loadingRef.current = false;
    return Object.keys(failures).length === 0;
  }, []);
  useEffect(() => {
    loadData();
  }, [loadData]);
  useEffect(() => {
    const timer = setInterval(() => loadData(true), 60000);
    return () => clearInterval(timer);
  }, [loadData]);
  const cases = data.cases || [],
    alerts = data.alerts || [],
    liveEvents = data.liveEvents || [];
  const audit = useMemo(() => [...(data.audit || [])].sort((a, b) => time(b.timestamp) - time(a.timestamp)), [data.audit]);
  const referralsToday = useMemo(() => {
    const today = new Date();
    return liveEvents.filter(event => {
      if (event.event_type !== 'CASE_CREATED') return false;
      const d = new Date(event.event_time);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    }).length;
  }, [liveEvents]);
  const lastIngestion = useMemo(() => {
    const created = liveEvents.filter(event => event.event_type === 'CASE_CREATED').sort((a, b) => time(b.event_time) - time(a.event_time));
    return created[0]?.event_time || null;
  }, [liveEvents]);
  const queue = useMemo(() => {
    const ids = new Set(alerts.filter(a => a.alert_type === 'HIGH_PRIORITY_UNALLOCATED' && a.status === 'OPEN').map(a => a.case_id));
    return cases.filter(c => ids.has(c.case_id) && c.allocation_status === 'Unallocated').sort((a, b) => Number(b.waiting_days || 0) - Number(a.waiting_days || 0));
  }, [data.cases, data.alerts]);
  function navigate(page, preset) {
    if (page === 'cases') setCasePreset(preset || {});
    if (page === 'alerts') setAlertPreset(preset || {});
    setActivePage(page);
    setMobileNav(false);
  }
  async function openCase(id) {
    const version = ++caseRequest.current;
    setDialog({
      type: 'case',
      loading: true,
      id
    });
    setDialogError('');
    try {
      const record = await getCase(id);
      if (!record?.case_id) throw new Error('The API did not return a case record.');
      if (version === caseRequest.current) setDialog({
        type: 'case',
        record
      });
    } catch (error) {
      if (version === caseRequest.current) {
        setDialog({
          type: 'case',
          id
        });
        setDialogError(error.message);
      }
    }
  }
  function closeDialog() {
    if (busy) return;
    caseRequest.current++;
    setDialog(null);
    setDialogError('');
  }
  async function mutate(action, success) {
    if (busy) return;
    setBusy(true);
    setDialogError('');
    setNotice('');
    try {
      await action();
      setDialog(null);
      setNotice(success);
      await loadData();
    } catch (error) {
      setDialogError(error.message);
    } finally {
      setBusy(false);
    }
  }
  const page = PAGES[activePage];
  return <div className="sq-app">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className={`sidebar ${mobileNav ? 'is-open' : ''}`}>
      <a className="brand" href="#operations" onClick={e => {
        e.preventDefault();
        navigate('operations');
      }}><span className="brand-mark"><Icon name="shield" size={24} /></span><span>SafeQueue<small>CARE OPERATIONS</small></span></a>
      <div className="workspace"><span className="workspace-icon"><Icon name="folder" size={17} /></span><div><strong>Operations workspace</strong><small>Synthetic data environment</small></div></div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Main navigation">{Object.entries(PAGES).map(([key, config]) => <button key={key} aria-current={activePage === key ? 'page' : undefined} className={`nav-item ${activePage === key ? 'active' : ''}`} onClick={() => navigate(key)}><Icon name={config[2]} /><span>{key[0].toUpperCase() + key.slice(1)}</span>{key === 'alerts' && data.summary?.critical_alerts > 0 && <span className="nav-count" title="System-wide critical alerts">{fmt(data.summary.critical_alerts)}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="prototype-note"><Icon name="shield" /><strong>Built around accountability</strong><p>Case operations, clear ownership and a traceable record of decisions.</p><span>PORTFOLIO PROTOTYPE</span></div><div className="profile"><span className="avatar">TL</span><div><strong>Team Leader</strong><small>TL-001 · Demo identity</small></div><Icon name="lock" size={15} /></div></div>
    </aside>
    <div className="main-shell">
      <header className="utility-bar"><div className="breadcrumb"><button className="icon-btn mobile-toggle" aria-label="Toggle navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)}><Icon name="menu" /></button><span>Workspace</span><Icon name="chevron" size={12} /><strong>{activePage[0].toUpperCase() + activePage.slice(1)}</strong></div><div className="utility-right"><span className="demo-tag live"><i />Live synthetic feed</span><span className="utility-divider" /><span className="utility-date">{new Date().toLocaleDateString('en-IE', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}</span></div></header>
      <main id="main-content" className="main-content">
        <header className="page-head"><div><div className="eyebrow">CHILD WELFARE OPERATIONS</div><h1>{page[0]}</h1><p>{page[1]}</p></div><div className="refresh-area"><Button icon="refresh" className={loading ? 'refreshing' : ''} onClick={loadData} disabled={loading || busy}>{loading ? 'Refreshing' : 'Refresh data'}</Button><span>{loading ? 'Checking latest records…' : Object.keys(errors).length ? 'Some data could not refresh' : updated ? `Updated ${updated.toLocaleTimeString('en-IE', {
                hour: '2-digit',
                minute: '2-digit'
              })}` : 'Not yet updated'}</span></div></header>
        {notice && <div className="banner success" role="status"><Icon name="check" /><span>{notice}</span><button className="icon-btn" onClick={() => setNotice('')} aria-label="Dismiss notification"><Icon name="close" size={16} /></button></div>}
        {!!Object.keys(errors).length && <div className="banner danger" role="alert"><Icon name="info" /><div><strong>Some data is unavailable. Previously loaded records may be out of date.</strong>{Object.entries(errors).map(([key, error]) => <p key={key}>{human(key)}: {error}</p>)}</div><Button disabled={loading} onClick={loadData}>Retry</Button></div>}
        {activePage === 'operations' && <>
          <CareBanner />
          <div className="live-ops-strip">
            <div><span className="live-pulse" /><strong>Live simulation active</strong><span>Auto-refreshes every 60 seconds</span></div>
            <div className="live-stat"><span>New referrals today</span><strong>{fmt(referralsToday)}</strong></div>
            <div className="live-stat"><span>Last ingestion</span><strong>{lastIngestion ? stamp(lastIngestion) : 'Waiting for first event'}</strong></div>
            <div className="live-stat"><span>API</span><strong className={data.health?.status === 'ok' ? 'status-ok' : 'status-warn'}>{data.health?.status === 'ok' ? 'Healthy' : 'Checking'}</strong></div>
          </div>
          <div className="metrics"><Metric label="Open cases" value={data.summary?.open_cases} detail="System-wide caseload" icon="folder" onClick={() => navigate('cases')} /><Metric label="Unallocated cases" value={data.summary?.unallocated_cases} detail="Awaiting worker allocation" icon="users" type="amber" onClick={() => navigate('cases', {
              allocation: 'Unallocated'
            })} /><Metric label="Critical alerts" value={data.summary?.critical_alerts} detail="Review critical exceptions" icon="bell" type="red" onClick={() => navigate('alerts', {
              severity: 'CRITICAL'
            })} /><Metric label="Overdue reviews" value={data.summary?.overdue_reviews} detail="Safety reviews needing attention" icon="clock" type="amber" onClick={() => navigate('cases', {
              review: 'Overdue'
            })} /></div>
          <div className="operations-grid"><div className="primary-column"><Panel title="Priority allocation queue" description="Open high-priority allocation alerts matched to loaded cases." action={<Badge type="danger">Needs allocation</Badge>}>
            <div className="queue-context"><span><Icon name="users" size={16} /><strong>{data.cases && data.alerts ? fmt(queue.length) : '—'}</strong> matched in loaded records</span><span>Longest waiting first</span></div>
            {loading && (!data.cases || !data.alerts) ? <Skeleton /> : !data.cases || !data.alerts ? <Empty title="Queue unavailable" description="Case and alert records are needed to build this queue." /> : !queue.length ? <Empty title="No matching allocation alerts" description="No open high-priority allocation alerts match the loaded case window. This is not a system-wide all-clear." icon="shield" /> : <Table label="Priority allocation queue"><thead><tr><th>Case / referral</th><th>Region</th><th>Waiting</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{queue.slice(0, 7).map(c => <tr key={c.case_id}><td><button className="case-link" onClick={() => openCase(c.case_id)}>{c.case_id}</button><span className="subtext">{c.referral_type}</span></td><td className="region-cell">{c.region}</td><td><span className="waiting"><Icon name="clock" size={13} />{fmt(c.waiting_days)} days</span></td><td><Button className="small" onClick={() => openCase(c.case_id)}>Assign<Icon name="arrow" size={14} /></Button></td></tr>)}</tbody></Table>}
            <div className="panel-footer"><span>Showing up to 7 · Browse window: 500 cases / 500 alerts</span><button className="text-button" onClick={() => navigate('cases', {
                    priority: 'High',
                    allocation: 'Unallocated'
                  })}>View unallocated <Icon name="arrow" size={15} /></button></div>
          </Panel><RegionWorkload cases={cases} available={!!data.cases} loading={loading} onSelect={region => navigate('cases', {
                region,
                allocation: 'Unallocated'
              })} /></div>
          <div className="secondary-column"><Panel title="Recent activity" description="Latest recorded actions" action={<span className="round-icon"><Icon name="history" size={18} /></span>}><AuditFeed items={audit} available={!!data.audit} loading={loading} /><div className="panel-footer"><span>Audit read identity: AUD-001</span><button className="text-button" onClick={() => navigate('audit')}>View trail <Icon name="arrow" size={15} /></button></div></Panel><Panel title="Live system events" description="Synthetic referrals and operational telemetry" action={<span className="live-chip"><i />LIVE</span>}><LiveEventFeed items={liveEvents} available={!!data.liveEvents} loading={loading} /></Panel><div className="oversight-card"><span className="round-icon"><Icon name="shield" size={21} /></span><p className="eyebrow">ACCOUNTABLE OPERATIONS</p><h2>Every action needs context.</h2><p>Review permissions and record reasons when allocating cases or resolving alerts.</p><button className="text-button" onClick={() => navigate('governance')}>Review governance <Icon name="arrow" size={16} /></button></div></div></div>
        </>}
        {activePage === 'cases' && <CasesPage cases={cases} total={data.summary?.total_cases} available={!!data.cases} loading={loading} preset={casePreset} onOpen={openCase} />}
        {activePage === 'alerts' && <AlertsPage alerts={alerts} available={!!data.alerts} loading={loading} preset={alertPreset} onOpen={openCase} onResolve={record => {
          setDialog({
            type: 'alert',
            record
          });
          setDialogError('');
        }} />}
        {activePage === 'governance' && <Governance permissions={data.permissions} audit={audit} alerts={alerts} auditAvailable={!!data.audit} alertsAvailable={!!data.alerts} loading={loading} onAudit={() => navigate('audit')} />}
        {activePage === 'audit' && <AuditPage audit={audit} available={!!data.audit} loading={loading} />}
        <footer className="app-footer"><span>SafeQueue <span> / </span> Child welfare operations prototype</span><span>Synthetic records only · Not an official Tusla service</span></footer>
      </main>
    </div>
    {dialog && <Modal title={dialog.type === 'case' ? dialog.record?.case_id || dialog.id : 'Resolve alert'} subtitle={dialog.type === 'case' ? 'CASE RECORD' : 'RECORDED RESOLUTION'} onClose={closeDialog} busy={busy}>
      {dialogError && <div className="banner danger" role="alert"><Icon name="info" /><span>{dialogError}</span></div>}
      {dialog.loading ? <Skeleton /> : dialog.type === 'case' ? dialog.record ? <CaseDetail key={dialog.record.case_id} record={dialog.record} busy={busy} onAssign={(worker, reason) => mutate(() => assignCase(dialog.record.case_id, worker, reason), `${dialog.record.case_id} assigned to ${worker}.`)} /> : <Empty title="Could not open this case" description="Check the case ID or retry the request."><Button onClick={() => openCase(dialog.id)}>Retry</Button></Empty> : <ResolveForm record={dialog.record} busy={busy} onCancel={closeDialog} onResolve={reason => mutate(() => resolveCaseAlert(dialog.record.alert_id, reason), `Alert ${dialog.record.alert_id} resolved.`)} />}
    </Modal>}
  </div>;
}
function RegionWorkload({
  cases,
  available,
  loading,
  onSelect
}) {
  const rows = useMemo(() => {
    const groups = new Map();
    cases.forEach(c => {
      if (c.allocation_status === 'Unallocated') groups.set(c.region || 'Not recorded', (groups.get(c.region || 'Not recorded') || 0) + 1);
    });
    return [...groups].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [cases]);
  return <Panel title="Allocation pressure by region" description="Unallocated cases in the loaded browsing window." action={<Icon name="users" />}>
    {loading && !available ? <Skeleton /> : !available ? <Empty title="Regional view unavailable" description="Refresh to load case records." /> : !rows.length ? <Empty title="No unallocated cases in this window" description="System-wide unallocated totals are shown above." /> : <div className="region-grid">{rows.map(([region, count]) => <button key={region} className="region-block" onClick={() => onSelect(region)}><span>{region}</span><strong>{fmt(count)}<small>unallocated</small></strong><span className="bar-track"><span style={{
            width: `${count / rows[0][1] * 100}%`
          }} /></span></button>)}</div>}
  </Panel>;
}
function CasesPage({
  cases,
  total,
  available,
  loading,
  preset,
  onOpen
}) {
  const [search, setSearch] = useState(''),
    [region, setRegion] = useState(preset.region || ''),
    [priority, setPriority] = useState(preset.priority || ''),
    [allocation, setAllocation] = useState(preset.allocation || ''),
    [review, setReview] = useState(preset.review || ''),
    [sort, setSort] = useState('waiting'),
    [page, setPage] = useState(1);
  const regions = [...new Set(cases.map(c => c.region).filter(Boolean))].sort();
  const rows = useMemo(() => cases.filter(c => String(c.case_id).toLowerCase().includes(search.trim().toLowerCase()) && (!region || c.region === region) && (!priority || c.priority === priority) && (!allocation || c.allocation_status === allocation) && (!review || (review === 'Overdue' ? c.safety_review_overdue : c.safety_review_required))).sort((a, b) => sort === 'waiting' ? Number(b.waiting_days || 0) - Number(a.waiting_days || 0) : String(a.case_id).localeCompare(String(b.case_id))), [cases, search, region, priority, allocation, review, sort]);
  useEffect(() => {
    setPage(1);
  }, [search, region, priority, allocation, review, sort, cases]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 20)));
  const active = !!(search || region || priority || allocation || review);
  const reset = () => {
    setSearch('');
    setRegion('');
    setPriority('');
    setAllocation('');
    setReview('');
  };
  return <>
    <div className="scope-note"><Icon name="info" size={17} /><span><strong>{fmt(cases.length)} cases loaded{total != null ? ` of ${fmt(total)} total` : ''}.</strong> Filters apply to loaded records. Use “Open exact ID” to retrieve any case from the API.</span></div>
    <section className="panel filter-panel" aria-label="Case filters"><div className="search-toolbar"><form className="search-form" onSubmit={e => {
          e.preventDefault();
          if (search.trim()) onOpen(search.trim().toUpperCase());
        }}><div className="search-input"><Icon name="search" /><input aria-label="Search case ID" placeholder="Search case ID, e.g. SQ-000165" value={search} onChange={e => setSearch(e.target.value)} /></div><Button type="submit" disabled={!search.trim()}>Open exact ID<Icon name="arrow" size={15} /></Button></form><Select label="Sort by" value={sort} onChange={setSort} options={['waiting', 'case ID']} all="Select sort" /></div><div className="filter-row"><Select label="Region" value={region} onChange={setRegion} options={regions} all="All regions" /><Select label="Priority" value={priority} onChange={setPriority} options={['High', 'Medium', 'Standard']} all="All priorities" /><Select label="Allocation" value={allocation} onChange={setAllocation} options={['Allocated', 'Unallocated']} all="All allocations" /><Select label="Safety review" value={review} onChange={setReview} options={['Overdue', 'Required']} all="All reviews" /><Button variant="ghost" disabled={!active} onClick={reset}>Clear filters</Button></div></section>
    <Panel title="Case register" description="Select a case ID to inspect the complete record and allocation." action={<span className="count-label">{fmt(rows.length)} matches</span>}>
      {loading && !available ? <Skeleton /> : !available ? <Empty title="Case register unavailable" description="Use Refresh data to retry." icon="folder" /> : !rows.length ? <Empty title={active ? 'No cases match your filters' : 'No cases loaded'} description={active ? 'Clear a filter or open an exact case ID from the API.' : 'Refresh to check for new referrals.'}>{active && <Button onClick={reset}>Clear filters</Button>}</Empty> : <Table label="Case register"><thead><tr><th>Case / referral</th><th>Region</th><th>Priority</th><th>Allocation</th><th>Worker</th><th>Waiting</th><th>Safety review</th></tr></thead><tbody>{rows.slice((currentPage - 1) * 20, currentPage * 20).map(c => <tr key={c.case_id}><td><div className="case-id-row"><button className="case-link" onClick={() => onOpen(c.case_id)}>{c.case_id}<Icon name="chevron" size={13} /></button>{isRecentCase(c) && <span className="new-case-tag">NEW</span>}</div><span className="subtext">{c.referral_type}</span></td><td className="region-cell">{c.region}</td><td><Badge>{c.priority}</Badge></td><td><Badge>{c.allocation_status}</Badge></td><td className="nowrap">{c.assigned_worker || <span className="muted">Not assigned</span>}</td><td className="nowrap">{fmt(c.waiting_days)} days</td><td><Review item={c} /></td></tr>)}</tbody></Table>}
      <Pager count={rows.length} page={currentPage} setPage={setPage} />
    </Panel>
  </>;
}
function AlertsPage({
  alerts,
  available,
  loading,
  preset,
  onOpen,
  onResolve
}) {
  const [severity, setSeverity] = useState(preset.severity || ''),
    [status, setStatus] = useState(''),
    [role, setRole] = useState(''),
    [page, setPage] = useState(1);
  const ranks = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3
  };
  const rows = useMemo(() => alerts.filter(a => (!severity || a.severity === severity) && (!status || a.status === status) && (!role || a.assigned_role === role)).sort((a, b) => Number(b.status === 'OPEN') - Number(a.status === 'OPEN') || (ranks[a.severity] ?? 4) - (ranks[b.severity] ?? 4) || time(a.created_at) - time(b.created_at)), [alerts, severity, status, role]);
  useEffect(() => {
    setPage(1);
  }, [alerts, severity, status, role]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 20)));
  const reset = () => {
    setSeverity('');
    setStatus('');
    setRole('');
  };
  return <>
    <div className="triage-strip"><div><span className="triage-dot red" /><strong>{available ? fmt(alerts.filter(a => a.status === 'OPEN' && a.severity === 'CRITICAL').length) : '—'}</strong><span>Critical & open</span></div><div><span className="triage-dot amber" /><strong>{available ? fmt(alerts.filter(a => a.status === 'OPEN').length) : '—'}</strong><span>Open alerts</span></div><div><span className="triage-dot teal" /><strong>{available ? fmt(alerts.filter(a => a.status === 'RESOLVED').length) : '—'}</strong><span>Resolved</span></div><small>Loaded window · up to 500 alerts</small></div>
    <section className="panel filter-panel" aria-label="Alert filters"><div className="filter-row alert-filters"><Select label="Severity" value={severity} onChange={setSeverity} options={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']} all="All severities" /><Select label="Status" value={status} onChange={setStatus} options={['OPEN', 'RESOLVED']} all="All statuses" /><Select label="Assigned role" value={role} onChange={setRole} options={[...new Set(['Team Leader', 'Admin', 'Auditor', ...alerts.map(a => a.assigned_role).filter(Boolean)])]} all="All roles" /><Button variant="ghost" disabled={!severity && !status && !role} onClick={reset}>Clear filters</Button></div></section>
    <Panel title="Triage queue" description="Open alerts first, then severity and oldest created date. Resolution uses the Team Leader demo identity." action={<span className="count-label">{fmt(rows.length)} matches</span>}>
      {loading && !available ? <Skeleton /> : !available ? <Empty title="Alerts unavailable" description="Use Refresh data to retry." icon="bell" /> : !rows.length ? <Empty title="No matching alerts" description="Adjust the filters or refresh for the latest loaded records." icon="bell" /> : <Table label="Alert triage"><thead><tr><th>Severity</th><th>Alert / case</th><th>Owner</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>{rows.slice((currentPage - 1) * 20, currentPage * 20).map(a => <tr key={a.alert_id}><td><Badge>{a.severity}</Badge></td><td><strong className="alert-title">{human(a.alert_type)}</strong><button className="case-link sub-link" onClick={() => onOpen(a.case_id)}>{a.case_id}<Icon name="arrow" size={12} /></button><span className="subtext">{a.alert_id}</span></td><td className="nowrap">{a.assigned_role || 'Unassigned'}</td><td><Badge>{a.status}</Badge></td><td className="date-cell">{stamp(a.created_at)}<span className={`alert-age ${a.status === 'OPEN' ? 'open' : ''}`}>{a.status === 'OPEN' ? ageLabel(a.created_at) : 'Closed'}</span></td><td>{a.status === 'OPEN' && a.assigned_role === 'Team Leader' ? <Button className="small" onClick={() => onResolve(a)}>Resolve</Button> : <span className="muted action-hint">{a.status === 'RESOLVED' ? 'Resolved' : 'Owner action required'}</span>}</td></tr>)}</tbody></Table>}
      <Pager count={rows.length} page={currentPage} setPage={setPage} />
    </Panel>
  </>;
}
function Governance({
  permissions,
  audit,
  alerts,
  auditAvailable,
  alertsAvailable,
  loading,
  onAudit
}) {
  const roles = Object.entries(permissions || {}).filter(([, actions]) => Array.isArray(actions));
  const governanceEvents = audit.filter(a => ['VIEW_AUDIT_LOG', 'CHANGE_PRIORITY', 'ASSIGN_WORKER', 'RESOLVE_ALERT', 'UPDATE_CASE_STATUS'].includes(a.action));
  return <>
    <div className="governance-intro"><span className="governance-emblem"><Icon name="shield" size={30} /></span><div><p className="eyebrow">CONTROL VISIBILITY</p><h2>Clear roles. Recorded decisions.</h2><p>Permissions below are reported by the API. Demo identity headers select the acting role; they are not a production sign-in system.</p></div><span className="outline-tag">PROTOTYPE</span></div>
    <div className="governance-stats"><div><span>API-defined roles</span><strong>{permissions ? fmt(roles.length) : '—'}</strong></div><div><span>Loaded governance events</span><strong>{auditAvailable ? fmt(governanceEvents.length) : '—'}</strong></div><div><span>Open access alerts · loaded</span><strong>{alertsAvailable ? fmt(alerts.filter(a => a.alert_type === 'REPEATED_ACCESS_DENIED' && a.status === 'OPEN').length) : '—'}</strong></div></div>
    <div className="section-heading"><div><h2>Role permissions</h2><p>Allowed actions returned by /permissions</p></div><span className="count-label">{roles.length} roles</span></div>
    {loading && !permissions ? <Skeleton /> : !roles.length ? <div className="panel"><Empty title="No role permissions available" description="Refresh to retrieve the permission definitions." icon="lock" /></div> : <div className="role-grid">{roles.map(([role, actions]) => <section className="panel role-card" key={role}><div className="role-heading"><span className={`role-icon ${role === 'Team Leader' ? 'teal' : ''}`}><Icon name={role === 'Auditor' ? 'history' : role === 'Admin' ? 'lock' : 'users'} size={22} /></span><div><h3>{role}</h3><p>{actions.length} permitted actions</p></div>{role === 'Team Leader' && <span className="mini-tag">DEMO ROLE</span>}</div><ul className="permission-list">{actions.map(action => <li key={String(action)}><Icon name="check" size={16} /><span>{human(action)}</span></li>)}</ul>{!actions.length && <p className="role-empty">No actions returned for this role.</p>}</section>)}</div>}
    <div className="control-status-row">
      <span><i className="ok-dot" />RBAC enforcement <strong>Active</strong></span>
      <span><i className="ok-dot" />Audit logging <strong>Active</strong></span>
      <span><i className="ok-dot" />Persistent storage <strong>Active</strong></span>
      <span><i className="ok-dot" />Synthetic feed <strong>Active</strong></span>
    </div>
    <div className="controls-grid"><Panel title="Demo control model" description="What this frontend actually does"><div className="control-list"><div><Icon name="users" /><div><strong>Operational actions</strong><p>Allocation and alert resolution send Team Leader / TL-001 headers.</p></div></div><div><Icon name="history" /><div><strong>Audit visibility</strong><p>Audit reads send Auditor / AUD-001 headers. The latest 200 events are requested.</p></div></div><div><Icon name="shield" /><div><strong>Decision context</strong><p>Assignment and resolution forms require a reason and submit it to the API.</p></div></div></div></Panel><Panel title="Recent oversight activity" description="Selected governance actions in loaded events" action={<button className="text-button" onClick={onAudit}>Full trail <Icon name="arrow" size={15} /></button>}><AuditFeed items={governanceEvents} available={auditAvailable} loading={loading} /></Panel></div>
  </>;
}
function AuditPage({
  audit,
  available,
  loading
}) {
  const [search, setSearch] = useState(''),
    [action, setAction] = useState(''),
    [role, setRole] = useState(''),
    [page, setPage] = useState(1);
  const rows = audit.filter(a => (!action || a.action === action) && (!role || a.actor_role === role) && [a.target_id, a.actor_id, a.reason].some(v => String(v ?? '').toLowerCase().includes(search.trim().toLowerCase())));
  useEffect(() => {
    setPage(1);
  }, [search, action, role, audit]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 20)));
  return <><div className="scope-note"><Icon name="history" size={17} /><span><strong>Read as Auditor · AUD-001.</strong> Up to 200 recorded events, sorted newest first. Timestamps use your browser’s local timezone.</span></div><section className="panel filter-panel" aria-label="Audit filters"><div className="filter-row audit-filters"><Field label="Search events"><div className="search-input"><Icon name="search" /><input placeholder="Target, actor or reason…" value={search} onChange={e => setSearch(e.target.value)} /></div></Field><Select label="Action" value={action} onChange={setAction} options={[...new Set(audit.map(a => a.action).filter(Boolean))].sort()} all="All actions" /><Select label="Actor role" value={role} onChange={setRole} options={[...new Set(audit.map(a => a.actor_role).filter(Boolean))].sort()} all="All roles" /><Button variant="ghost" disabled={!search && !action && !role} onClick={() => {
          setSearch('');
          setAction('');
          setRole('');
        }}>Clear filters</Button></div></section><Panel title="Recorded events" description="Original values and reasons are preserved as returned by the API." action={<span className="count-label">{fmt(rows.length)} matches</span>}>
      {loading && !available ? <Skeleton /> : !available ? <Empty title="Audit trail unavailable" description="Use Refresh data to retry." icon="history" /> : !rows.length ? <Empty title="No matching audit events" description="Recorded actions will appear here after a refresh, or try clearing your filters." icon="history" /> : <Table label="Audit trail"><thead><tr><th>Timestamp</th><th>Actor</th><th>Action / target</th><th>Change</th><th>Reason</th></tr></thead><tbody>{rows.slice((currentPage - 1) * 20, currentPage * 20).map((a, i) => <tr key={`${a.timestamp}-${i}`}><td className="date-cell">{stamp(a.timestamp)}</td><td><strong>{a.actor_role || 'Unknown role'}</strong><span className="subtext">{a.actor_id || 'Unknown actor'}</span></td><td><strong>{human(a.action)}</strong><span className="subtext mono">{a.target_id || 'System'}</span></td><td className="change-cell"><div><span className="change-label">FROM</span><code>{display(a.old_value)}</code></div><div><span className="change-label">TO</span><code>{display(a.new_value)}</code></div></td><td className="reason-cell">{display(a.reason)}</td></tr>)}</tbody></Table>}<Pager count={rows.length} page={currentPage} setPage={setPage} /></Panel></>;
}
function Modal({
  title,
  subtitle,
  onClose,
  busy,
  children
}) {
  const ref = useRef(null),
    closeRef = useRef(onClose),
    busyRef = useRef(busy),
    id = useId();
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    function keydown(e) {
      if (e.key === 'Escape' && !busyRef.current) {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const elements = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')];
        if (!elements.length) {
          e.preventDefault();
          return;
        }
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <div className="modal-backdrop" onClick={e => {
    if (e.target === e.currentTarget && !busy) onClose();
  }}><section className="modal" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} aria-busy={busy}><header className="modal-head"><div><p className="eyebrow">{subtitle}</p><h2 id={id}>{title}</h2></div><button className="icon-btn" aria-label="Close dialog" disabled={busy} onClick={onClose}><Icon name="close" size={21} /></button></header><div className="modal-body">{children}</div></section></div>;
}
function Detail({
  label,
  value
}) {
  return <div><dt>{label}</dt><dd>{display(value)}</dd></div>;
}
function CaseDetail({
  record: c,
  busy,
  onAssign
}) {
  const [worker, setWorker] = useState(''),
    [reason, setReason] = useState('');
  const yesno = v => v == null ? 'Not recorded' : v ? 'Yes' : 'No';
  return <><div className="record-badges"><Badge>{c.priority}</Badge><Badge>{c.allocation_status}</Badge><span className="muted">{c.case_status || 'Status not recorded'}</span></div>{c.safety_review_overdue && <div className="banner danger"><Icon name="clock" /><span><strong>Safety review overdue.</strong> Review the due date and required action.</span></div>}<h3 className="detail-heading">Case overview</h3><dl className="detail-grid"><Detail label="Region" value={c.region} /><Detail label="Referral type" value={c.referral_type} /><Detail label="Assigned worker" value={c.assigned_worker || 'Not assigned'} /><Detail label="Waiting time" value={c.waiting_days == null ? 'Not recorded' : `${c.waiting_days} days`} /><Detail label="Referral date" value={c.referral_date} /><Detail label="Preliminary enquiry" value={c.preliminary_enquiry_completed == null ? 'Not recorded' : c.preliminary_enquiry_completed ? 'Completed' : 'Pending'} /></dl><h3 className="detail-heading">Assessment & safety review</h3><dl className="detail-grid"><Detail label="Initial assessment required" value={yesno(c.initial_assessment_required)} /><Detail label="Safety review required" value={yesno(c.safety_review_required)} /><Detail label="Safety review due" value={c.safety_review_due} /><Detail label="Review overdue" value={yesno(c.safety_review_overdue)} /></dl>
    {c.allocation_status === 'Unallocated' ? <form className="assignment-box" onSubmit={e => {
      e.preventDefault();
      if (worker.trim() && reason.trim() && !busy) onAssign(worker.trim(), reason.trim());
    }}><div className="assignment-heading"><span className="round-icon"><Icon name="users" /></span><div><h3>Assign a case worker</h3><p>Acting as Team Leader · TL-001</p></div></div><Field label="Worker ID"><input required value={worker} disabled={busy} onChange={e => setWorker(e.target.value)} placeholder="Enter worker ID, e.g. SW-555" maxLength={100} /></Field><p className="field-help">Enter a known worker ID. Worker availability is not provided by this API.</p><Field label="Assignment reason"><textarea required value={reason} disabled={busy} onChange={e => setReason(e.target.value)} placeholder="Explain the allocation decision…" maxLength={2000} /></Field><Button variant="primary" icon="check" type="submit" disabled={busy || !worker.trim() || !reason.trim()}>{busy ? 'Saving assignment…' : 'Confirm assignment'}</Button></form> : <div className="scope-note"><Icon name="info" /><span>Assignment is available for unallocated cases only.</span></div>}</>;
}
function ResolveForm({
  record,
  busy,
  onCancel,
  onResolve
}) {
  const [reason, setReason] = useState('');
  return <form onSubmit={e => {
    e.preventDefault();
    if (reason.trim() && !busy) onResolve(reason.trim());
  }}><div className="record-badges"><Badge>{record.severity}</Badge><Badge>{record.status}</Badge></div><h3 className="resolution-title">{human(record.alert_type)}</h3><dl className="detail-grid"><Detail label="Alert ID" value={record.alert_id} /><Detail label="Case ID" value={record.case_id} /><Detail label="Assigned role" value={record.assigned_role} /><Detail label="Created" value={stamp(record.created_at)} /></dl><div className="scope-note"><Icon name="info" /><span>Resolve only after reviewing the underlying issue. This action submits a resolution reason to the API as Team Leader.</span></div><Field label="Resolution reason"><textarea autoFocus required disabled={busy} value={reason} onChange={e => setReason(e.target.value)} placeholder="What was reviewed, what action was taken, and why can this alert be closed?" maxLength={2000} /></Field><div className="modal-actions"><Button type="button" onClick={onCancel} disabled={busy}>Cancel</Button><Button variant="primary" icon="check" type="submit" disabled={busy || !reason.trim()}>{busy ? 'Resolving…' : 'Confirm resolution'}</Button></div></form>;
}

// Decorative imagery only: these fictional people are not linked to case records.
const CARE_SLIDES = [
  { file: 'drawing.png', label: 'Drawing together', position: '62% 43%' },
  { file: 'playing.png', label: 'Playing together', position: '50% 45%' },
  { file: 'reading.png', label: 'Learning together', position: '62% 40%' },
];

function CareBanner() {
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(() => CARE_SLIDES.map(() => false));
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [hidden, setHidden] = useState(false);
  const headingId = useId();
  const shown = ready[active] ? active : ready.findIndex(Boolean);
  const availableCount = ready.filter(Boolean).length;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setReducedMotion(preference.matches);
    const syncVisibility = () => setHidden(document.hidden);
    syncPreference();
    syncVisibility();
    preference.addEventListener('change', syncPreference);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      preference.removeEventListener('change', syncPreference);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || hidden || availableCount < 2) return;
    // 1.5-second crossfade followed by approximately 6 seconds at rest.
    const timer = window.setInterval(() => {
      setActive(current => {
        const from = ready[current] ? current : ready.findIndex(Boolean);
        for (let step = 1; step <= CARE_SLIDES.length; step++) {
          const next = (from + step) % CARE_SLIDES.length;
          if (ready[next]) return next;
        }
        return current;
      });
    }, 7500);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, hidden, ready, availableCount]);

  function imageReady(index, value) {
    setReady(previous => {
      if (previous[index] === value) return previous;
      const next = [...previous];
      next[index] = value;
      return next;
    });
  }

  return (
    <section className="sq-care-banner" aria-labelledby={headingId}>
      <div className="sq-care-copy">
        <p className="sq-care-eyebrow">CARE BEGINS WITH ATTENTION</p>
        <h2 id={headingId}>Every case represents<br />a childhood.</h2>
        <p className="sq-care-description">Bring clarity to urgent work. Make space for better care.</p>
      </div>
      <div className="sq-care-visual" aria-hidden="true">
        {CARE_SLIDES.map((slide, index) => (
          <img
            key={slide.file}
            src={`${import.meta.env.BASE_URL || '/'}images/safequeue/${slide.file}`}
            alt=""
            width="1536"
            height="1024"
            loading="eager"
            decoding="async"
            className={`sq-care-image${shown === index ? ' is-visible' : ''}`}
            style={{ objectPosition: slide.position }}
            onLoad={() => imageReady(index, true)}
            onError={() => imageReady(index, false)}
          />
        ))}
      </div>
      {availableCount > 1 && (
        <div className="sq-care-controls" role="group" aria-label="Care banner images">
          {!reducedMotion && (
            <button
              type="button"
              className="sq-care-pause"
              onClick={() => setPaused(value => !value)}
              aria-label={paused ? 'Play care slideshow' : 'Pause care slideshow'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                {paused ? <path d="M3 1.5 10 6 3 10.5Z" /> : <><rect x="2" y="2" width="3" height="8" rx=".5" /><rect x="7" y="2" width="3" height="8" rx=".5" /></>}
              </svg>
              {paused ? 'Play' : 'Pause'}
            </button>
          )}
          {CARE_SLIDES.map((slide, index) => (
            <button
              key={slide.file}
              type="button"
              className={`sq-care-dot${shown === index ? ' is-selected' : ''}`}
              disabled={!ready[index]}
              aria-label={`Show ${slide.label.toLowerCase()}`}
              aria-pressed={shown === index}
              onClick={() => { setActive(index); setPaused(true); }}
            ><span /></button>
          ))}
        </div>
      )}
    </section>
  );
}
