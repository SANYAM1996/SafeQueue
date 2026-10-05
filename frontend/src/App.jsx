import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

function App() {
  const [activePage, setActivePage] = useState("operations");
  const [cases, setCases] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [audit, setAudit] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [summary, setSummary] = useState({
    total_cases: 0,
    open_cases: 0,
    unallocated_cases: 0,
    critical_alerts: 0,
    overdue_reviews: 0,
  });

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [selectedCase, setSelectedCase] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [workerId, setWorkerId] = useState("SW-555");
  const [resolutionReason, setResolutionReason] = useState("");

  const [caseSearch, setCaseSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [allocationFilter, setAllocationFilter] = useState("");

  const [severityFilter, setSeverityFilter] = useState("");
  const [alertStatusFilter, setAlertStatusFilter] = useState("");
  const [alertRoleFilter, setAlertRoleFilter] = useState("");

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const [casesRes, alertsRes, auditRes, summaryRes, permissionsRes] =
        await Promise.all([
          fetch(`${API_BASE}/cases?limit=500`),
          fetch(`${API_BASE}/alerts?limit=500`),
          fetch(`${API_BASE}/audit?limit=200`, {
            headers: {
              "X-Role": "Auditor",
              "X-User-ID": "AUD-001",
            },
          }),
          fetch(`${API_BASE}/summary`),
          fetch(`${API_BASE}/permissions`),
        ]);

      if (!casesRes.ok) throw new Error("Failed to load cases.");
      if (!alertsRes.ok) throw new Error("Failed to load alerts.");
      if (!auditRes.ok) throw new Error("Failed to load audit activity.");
      if (!summaryRes.ok) throw new Error("Failed to load dashboard summary.");
      if (!permissionsRes.ok) throw new Error("Failed to load permissions.");

      const casesData = await casesRes.json();
      const alertsData = await alertsRes.json();
      const auditData = await auditRes.json();
      const summaryData = await summaryRes.json();
      const permissionsData = await permissionsRes.json();

      setCases(casesData.items || []);
      setAlerts(alertsData.items || []);
      setAudit(auditData.items || []);
      setSummary(summaryData);
      setPermissions(permissionsData || {});
    } catch (error) {
      console.error(error);
      setMessage(
        error.message ||
          "Could not load SafeQueue data. Check that FastAPI is running."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const criticalCases = useMemo(() => {
    const criticalCaseIds = new Set(
      alerts
        .filter(
          (item) =>
            item.alert_type === "HIGH_PRIORITY_UNALLOCATED" &&
            item.status === "OPEN"
        )
        .map((item) => item.case_id)
    );

    return cases
      .filter((item) => criticalCaseIds.has(item.case_id))
      .slice(0, 12);
  }, [cases, alerts]);

  const regionOptions = useMemo(() => {
    return [...new Set(cases.map((item) => item.region).filter(Boolean))].sort();
  }, [cases]);

  const filteredCases = useMemo(() => {
    const search = caseSearch.trim().toLowerCase();

    return cases.filter((item) => {
      const matchesSearch =
        !search || item.case_id.toLowerCase().includes(search);
      const matchesRegion = !regionFilter || item.region === regionFilter;
      const matchesPriority = !priorityFilter || item.priority === priorityFilter;
      const matchesAllocation =
        !allocationFilter || item.allocation_status === allocationFilter;

      return (
        matchesSearch &&
        matchesRegion &&
        matchesPriority &&
        matchesAllocation
      );
    });
  }, [cases, caseSearch, regionFilter, priorityFilter, allocationFilter]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((item) => {
      const severityOk = !severityFilter || item.severity === severityFilter;
      const statusOk = !alertStatusFilter || item.status === alertStatusFilter;
      const roleOk = !alertRoleFilter || item.assigned_role === alertRoleFilter;
      return severityOk && statusOk && roleOk;
    });
  }, [alerts, severityFilter, alertStatusFilter, alertRoleFilter]);

  const governanceAudit = useMemo(
    () =>
      audit.filter((item) =>
        [
          "VIEW_AUDIT_LOG",
          "CHANGE_PRIORITY",
          "ASSIGN_WORKER",
          "RESOLVE_ALERT",
          "UPDATE_CASE_STATUS",
        ].includes(item.action)
      ),
    [audit]
  );

  async function openCase(caseId) {
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/cases/${caseId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Could not load case.");
      }
      setSelectedCase(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function searchExactCase() {
    const value = caseSearch.trim();
    if (!value) return;
    await openCase(value.toUpperCase());
  }

  async function assignWorker(caseId) {
    setMessage("");
    try {
      const response = await fetch(`${API_BASE}/cases/${caseId}/assign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Role": "Team Leader",
          "X-User-ID": "TL-001",
        },
        body: JSON.stringify({
          worker_id: workerId,
          reason: "Case reviewed and allocated based on available capacity.",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Assignment failed.");
      }

      setMessage(`Assigned ${caseId} to ${workerId}.`);
      setSelectedCase(null);
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function resolveAlert(alertId) {
    setMessage("");

    try {
      const response = await fetch(`${API_BASE}/alerts/${alertId}/resolve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Role": "Team Leader",
          "X-User-ID": "TL-001",
        },
        body: JSON.stringify({
          resolution: "Reviewed by Team Leader",
          reason: resolutionReason || "Alert reviewed and resolved.",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Could not resolve alert.");
      }

      setMessage(`Resolved alert ${alertId}.`);
      setSelectedAlert(null);
      setResolutionReason("");
      await loadData();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function clearCaseFilters() {
    setCaseSearch("");
    setRegionFilter("");
    setPriorityFilter("");
    setAllocationFilter("");
  }

  function clearAlertFilters() {
    setSeverityFilter("");
    setAlertStatusFilter("");
    setAlertRoleFilter("");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">SQ</div>
          <h1>SafeQueue</h1>
          <p>Child welfare operations prototype</p>

          <nav>
            {["operations", "cases", "alerts", "governance", "audit"].map(
              (page) => (
                <button
                  key={page}
                  className={`nav-item ${activePage === page ? "active" : ""}`}
                  onClick={() => setActivePage(page)}
                >
                  {page.charAt(0).toUpperCase() + page.slice(1)}
                </button>
              )
            )}
          </nav>
        </div>

        <div className="role-card">
          <span>Demo role</span>
          <strong>Team Leader</strong>
          <small>TL-001</small>
        </div>
      </aside>

      <main className="main-panel">
        {message && <div className="message-bar">{message}</div>}

        {activePage === "operations" && (
          <OperationsPage
            summary={summary}
            criticalCases={criticalCases}
            audit={audit}
            loading={loading}
            onRefresh={loadData}
            onOpenCase={openCase}
            onAssign={(item) => {
              setSelectedCase(item);
              setWorkerId("SW-555");
            }}
          />
        )}

        {activePage === "cases" && (
          <CasesPage
            loading={loading}
            cases={filteredCases}
            totalLoaded={cases.length}
            caseSearch={caseSearch}
            setCaseSearch={setCaseSearch}
            regionFilter={regionFilter}
            setRegionFilter={setRegionFilter}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            allocationFilter={allocationFilter}
            setAllocationFilter={setAllocationFilter}
            regionOptions={regionOptions}
            onSearchExact={searchExactCase}
            onClearFilters={clearCaseFilters}
            onOpenCase={openCase}
            onRefresh={loadData}
          />
        )}

        {activePage === "alerts" && (
          <AlertsPage
            alerts={filteredAlerts}
            severityFilter={severityFilter}
            setSeverityFilter={setSeverityFilter}
            alertStatusFilter={alertStatusFilter}
            setAlertStatusFilter={setAlertStatusFilter}
            alertRoleFilter={alertRoleFilter}
            setAlertRoleFilter={setAlertRoleFilter}
            onClearFilters={clearAlertFilters}
            onOpenCase={openCase}
            onResolve={(alert) => {
              setSelectedAlert(alert);
              setResolutionReason("");
            }}
            onRefresh={loadData}
          />
        )}

        {activePage === "governance" && (
          <GovernancePage
            permissions={permissions}
            audit={governanceAudit}
            alerts={alerts}
          />
        )}

        {activePage === "audit" && (
          <AuditPage audit={audit} onRefresh={loadData} />
        )}
      </main>

      {selectedCase && (
        <CaseModal
          selectedCase={selectedCase}
          workerId={workerId}
          setWorkerId={setWorkerId}
          onClose={() => setSelectedCase(null)}
          onAssign={assignWorker}
        />
      )}

      {selectedAlert && (
        <div className="modal-backdrop" onClick={() => setSelectedAlert(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">RESOLVE ALERT</p>
                <h3>{selectedAlert.alert_type}</h3>
              </div>
              <button
                className="icon-button"
                onClick={() => setSelectedAlert(null)}
              >
                ×
              </button>
            </div>

            <SummaryRow label="Case" value={selectedAlert.case_id} />
            <SummaryRow label="Severity" value={selectedAlert.severity} />
            <SummaryRow
              label="Assigned role"
              value={selectedAlert.assigned_role}
            />

            <label className="field-label">Resolution reason</label>
            <textarea
              className="textarea"
              value={resolutionReason}
              onChange={(e) => setResolutionReason(e.target.value)}
              placeholder="Record why this alert can be resolved."
            />

            <button
              className="primary-button full-width"
              onClick={() => resolveAlert(selectedAlert.alert_id)}
            >
              Resolve alert
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OperationsPage({
  summary,
  criticalCases,
  audit,
  loading,
  onRefresh,
  onOpenCase,
  onAssign,
}) {
  return (
    <>
      <header className="topbar">
        <div>
          <p className="eyebrow">OPERATIONS DASHBOARD</p>
          <h2>Cases requiring attention</h2>
        </div>
        <button className="secondary-button" onClick={onRefresh}>
          Refresh
        </button>
      </header>

      <section className="metric-grid">
        <MetricCard label="Open cases" value={summary.open_cases} />
        <MetricCard label="Unallocated" value={summary.unallocated_cases} />
        <MetricCard
          label="Critical alerts"
          value={summary.critical_alerts}
          danger
        />
        <MetricCard
          label="Overdue reviews"
          value={summary.overdue_reviews}
          warning
        />
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">PRIORITY QUEUE</p>
              <h3>High-priority unallocated cases</h3>
            </div>
            <span className="pill">{criticalCases.length} shown</span>
          </div>

          {loading ? (
            <div className="empty-state">Loading...</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Region</th>
                    <th>Type</th>
                    <th>Waiting</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalCases.map((item) => (
                    <tr key={item.case_id}>
                      <td>
                        <button
                          className="case-link"
                          onClick={() => onOpenCase(item.case_id)}
                        >
                          {item.case_id}
                        </button>
                      </td>
                      <td>{item.region}</td>
                      <td>{item.referral_type}</td>
                      <td>{item.waiting_days} days</td>
                      <td>
                        <button
                          className="primary-button compact"
                          onClick={() => onAssign(item)}
                        >
                          Assign worker
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">GOVERNANCE</p>
              <h3>Recent audit activity</h3>
            </div>
          </div>

          <div className="audit-list">
            {audit
              .slice()
              .reverse()
              .slice(0, 8)
              .map((item, index) => (
                <div
                  className="audit-item"
                  key={`${item.timestamp}-${index}`}
                >
                  <div className="audit-dot" />
                  <div>
                    <strong>{item.action}</strong>
                    <p>
                      {item.actor_role} · {item.actor_id}
                    </p>
                    <small>
                      {item.target_id} ·{" "}
                      {new Date(item.timestamp).toLocaleString()}
                    </small>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>
    </>
  );
}

function CasesPage(props) {
  const {
    loading,
    cases,
    totalLoaded,
    caseSearch,
    setCaseSearch,
    regionFilter,
    setRegionFilter,
    priorityFilter,
    setPriorityFilter,
    allocationFilter,
    setAllocationFilter,
    regionOptions,
    onSearchExact,
    onClearFilters,
    onOpenCase,
    onRefresh,
  } = props;

  return (
    <>
      <PageHeader
        eyebrow="CASE MANAGEMENT"
        title="Cases"
        description="Search, filter and inspect synthetic case records."
        onRefresh={onRefresh}
      />

      <section className="panel filter-panel">
        <div className="filters">
          <div className="search-group">
            <label>Case ID</label>
            <div className="search-row">
              <input
                value={caseSearch}
                onChange={(e) => setCaseSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSearchExact()}
                placeholder="SQ-000165"
              />
              <button className="primary-button" onClick={onSearchExact}>
                Open
              </button>
            </div>
          </div>

          <FilterSelect
            label="Region"
            value={regionFilter}
            onChange={setRegionFilter}
            options={regionOptions}
            placeholder="All regions"
          />
          <FilterSelect
            label="Priority"
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={["Standard", "Medium", "High"]}
            placeholder="All priorities"
          />
          <FilterSelect
            label="Allocation"
            value={allocationFilter}
            onChange={setAllocationFilter}
            options={["Allocated", "Unallocated"]}
            placeholder="All statuses"
          />

          <div className="clear-filter-wrap">
            <button className="secondary-button" onClick={onClearFilters}>
              Clear filters
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">CASE REGISTER</p>
            <h3>{cases.length} matching records</h3>
          </div>
          <span className="pill">{totalLoaded} loaded for browsing</span>
        </div>

        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Region</th>
                  <th>Priority</th>
                  <th>Referral type</th>
                  <th>Allocation</th>
                  <th>Worker</th>
                  <th>Waiting</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {cases.slice(0, 100).map((item) => (
                  <tr
                    key={item.case_id}
                    className="clickable-row"
                    onClick={() => onOpenCase(item.case_id)}
                  >
                    <td>
                      <strong>{item.case_id}</strong>
                    </td>
                    <td>{item.region}</td>
                    <td>
                      <StatusBadge
                        value={item.priority}
                        type={
                          item.priority === "High"
                            ? "danger"
                            : item.priority === "Medium"
                            ? "warning"
                            : "neutral"
                        }
                      />
                    </td>
                    <td>{item.referral_type}</td>
                    <td>
                      <StatusBadge
                        value={item.allocation_status}
                        type={
                          item.allocation_status === "Unallocated"
                            ? "warning"
                            : "success"
                        }
                      />
                    </td>
                    <td>{item.assigned_worker || "—"}</td>
                    <td>{item.waiting_days} days</td>
                    <td>
                      {item.safety_review_overdue ? (
                        <StatusBadge value="Overdue" type="danger" />
                      ) : item.safety_review_required ? (
                        <StatusBadge value="Required" type="warning" />
                      ) : (
                        <span className="muted-text">Not required</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function AlertsPage({
  alerts,
  severityFilter,
  setSeverityFilter,
  alertStatusFilter,
  setAlertStatusFilter,
  alertRoleFilter,
  setAlertRoleFilter,
  onClearFilters,
  onOpenCase,
  onResolve,
  onRefresh,
}) {
  return (
    <>
      <PageHeader
        eyebrow="ALERT MANAGEMENT"
        title="Alerts"
        description="Review, investigate and resolve operational alerts."
        onRefresh={onRefresh}
      />

      <section className="panel filter-panel">
        <div className="filters three">
          <FilterSelect
            label="Severity"
            value={severityFilter}
            onChange={setSeverityFilter}
            options={["CRITICAL", "HIGH", "MEDIUM", "LOW"]}
            placeholder="All severities"
          />
          <FilterSelect
            label="Status"
            value={alertStatusFilter}
            onChange={setAlertStatusFilter}
            options={["OPEN", "RESOLVED"]}
            placeholder="All statuses"
          />
          <FilterSelect
            label="Assigned role"
            value={alertRoleFilter}
            onChange={setAlertRoleFilter}
            options={["Team Leader", "Admin", "Auditor"]}
            placeholder="All roles"
          />
          <div className="clear-filter-wrap">
            <button className="secondary-button" onClick={onClearFilters}>
              Clear filters
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">ALERT QUEUE</p>
            <h3>{alerts.length} matching alerts</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Alert</th>
                <th>Case</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {alerts.slice(0, 150).map((alert) => (
                <tr key={alert.alert_id}>
                  <td>
                    <StatusBadge
                      value={alert.severity}
                      type={
                        alert.severity === "CRITICAL"
                          ? "danger"
                          : alert.severity === "HIGH"
                          ? "warning"
                          : "neutral"
                      }
                    />
                  </td>
                  <td>{alert.alert_type}</td>
                  <td>
                    <button
                      className="case-link"
                      onClick={() => onOpenCase(alert.case_id)}
                    >
                      {alert.case_id}
                    </button>
                  </td>
                  <td>{alert.assigned_role}</td>
                  <td>{alert.status}</td>
                  <td>{new Date(alert.created_at).toLocaleDateString()}</td>
                  <td>
                    {alert.status === "OPEN" &&
                    alert.assigned_role === "Team Leader" ? (
                      <button
                        className="primary-button compact"
                        onClick={() => onResolve(alert)}
                      >
                        Resolve
                      </button>
                    ) : (
                      <span className="muted-text">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function GovernancePage({ permissions, audit, alerts }) {
  const accessAlerts = alerts.filter(
    (a) => a.alert_type === "REPEATED_ACCESS_DENIED"
  ).length;

  return (
    <>
      <PageHeader
        eyebrow="GOVERNANCE"
        title="Roles, controls and accountability"
        description="Review separation of duties, auditability and governance controls."
      />

      <section className="metric-grid three">
        <MetricCard label="Defined roles" value={Object.keys(permissions).length} />
        <MetricCard label="Governance audit events" value={audit.length} />
        <MetricCard label="Access alerts" value={accessAlerts} warning />
      </section>

      <section className="governance-grid">
        {Object.entries(permissions).map(([role, actions]) => (
          <div className="panel permission-card" key={role}>
            <div className="panel-header">
              <h3>{role}</h3>
            </div>
            <div className="permission-list">
              {actions.map((action) => (
                <div className="permission-row" key={action}>
                  <span className="permission-check">✓</span>
                  <span>{action.replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function AuditPage({ audit, onRefresh }) {
  return (
    <>
      <PageHeader
        eyebrow="AUDIT"
        title="Audit trail"
        description="Runtime governance events recorded by SafeQueue."
        onRefresh={onRefresh}
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">RECORDED EVENTS</p>
            <h3>{audit.length} loaded audit events</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Old</th>
                <th>New</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {audit
                .slice()
                .reverse()
                .map((item, index) => (
                  <tr key={`${item.timestamp}-${index}`}>
                    <td>{new Date(item.timestamp).toLocaleString()}</td>
                    <td>
                      {item.actor_role}
                      <span className="subtext">{item.actor_id}</span>
                    </td>
                    <td>{item.action}</td>
                    <td>{item.target_id}</td>
                    <td>{item.old_value || "—"}</td>
                    <td>{item.new_value || "—"}</td>
                    <td>{item.reason || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function CaseModal({
  selectedCase,
  workerId,
  setWorkerId,
  onClose,
  onAssign,
}) {
  const canAssign = selectedCase.allocation_status === "Unallocated";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal case-detail-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">CASE DETAIL</p>
            <h3>{selectedCase.case_id}</h3>
          </div>

          <button className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="detail-grid">
          <SummaryRow label="Region" value={selectedCase.region} />
          <SummaryRow label="Priority" value={selectedCase.priority} />
          <SummaryRow
            label="Referral type"
            value={selectedCase.referral_type}
          />
          <SummaryRow label="Case status" value={selectedCase.case_status} />
          <SummaryRow
            label="Allocation"
            value={selectedCase.allocation_status}
          />
          <SummaryRow
            label="Assigned worker"
            value={selectedCase.assigned_worker || "Not assigned"}
          />
          <SummaryRow
            label="Waiting"
            value={`${selectedCase.waiting_days} days`}
          />
          <SummaryRow label="Referral date" value={selectedCase.referral_date} />
          <SummaryRow
            label="Preliminary enquiry"
            value={
              selectedCase.preliminary_enquiry_completed
                ? "Completed"
                : "Pending"
            }
          />
          <SummaryRow
            label="Initial assessment required"
            value={selectedCase.initial_assessment_required ? "Yes" : "No"}
          />
          <SummaryRow
            label="Safety review required"
            value={selectedCase.safety_review_required ? "Yes" : "No"}
          />
          <SummaryRow
            label="Safety review due"
            value={selectedCase.safety_review_due || "—"}
          />
          <SummaryRow
            label="Safety review overdue"
            value={selectedCase.safety_review_overdue ? "Yes" : "No"}
          />
        </div>

        {canAssign && (
          <div className="assignment-box">
            <label className="field-label">Assign worker</label>
            <input
              value={workerId}
              onChange={(event) => setWorkerId(event.target.value)}
              placeholder="SW-555"
            />
            <button
              className="primary-button full-width"
              onClick={() => onAssign(selectedCase.case_id)}
            >
              Confirm assignment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, onRefresh }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description && <p className="page-description">{description}</p>}
      </div>
      {onRefresh && (
        <button className="secondary-button" onClick={onRefresh}>
          Refresh
        </button>
      )}
    </header>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}) {
  return (
    <div className="filter-field">
      <label>{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function MetricCard({ label, value, danger, warning }) {
  return (
    <div
      className={`metric-card ${danger ? "danger" : ""} ${
        warning ? "warning" : ""
      }`}
    >
      <span>{label}</span>
      <strong>{Number(value || 0).toLocaleString()}</strong>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ value, type = "neutral" }) {
  return <span className={`status-badge ${type}`}>{value}</span>;
}

export default App;
