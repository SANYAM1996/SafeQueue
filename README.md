# SafeQueue

**SafeQueue** is a cloud-deployed child-welfare operations prototype designed to demonstrate how case allocation, risk monitoring, governance, auditability, and operational visibility can be brought together in one system.

The project uses **synthetic data only**. It is a portfolio prototype and is **not an official Tusla service**.

---

## Why I built it

Operational teams working with high-volume casework need more than dashboards. They need to know:

- Which cases are still unallocated?
- Which cases need urgent attention?
- Which safety reviews are overdue?
- Who changed what, and why?
- Are permissions being enforced?
- Can the system preserve state across deployments?
- Can new referrals arrive automatically without manual data loading?

SafeQueue was built to explore those questions in a realistic cloud application.

---

## Current capabilities

### Operations dashboard
- System-wide open case count
- Unallocated case count
- Critical allocation alerts
- Overdue safety reviews
- Priority allocation queue
- Regional allocation pressure
- Recent audit activity
- Live synthetic-feed status
- API health indicator
- New referrals today
- Last ingestion status

### Case management
- Search and filter case records
- Filter by region, priority, allocation and safety-review status
- Open an exact case ID
- Inspect detailed case information
- Assign a worker to an unallocated case
- Record an assignment reason
- Persist allocation changes

### Alert triage
- View operational alerts by severity and status
- Surface high-priority unallocated cases
- Surface overdue safety-review cases
- Resolve Team Leader alerts
- Record a resolution reason
- Show alert age for operational context

### Governance
- Role-based permission visibility
- Team Leader / Auditor / Admin control model
- API-enforced permissions
- Governance summaries
- Audit visibility
- Persistent-storage status
- Synthetic-feed status

### Audit trail
- Actor
- Action
- Target
- Previous value
- New value
- Reason
- Timestamp

### Live synthetic referrals
SafeQueue includes a scheduled synthetic-ingestion workflow.

A GitHub Actions schedule calls the deployed API several times per day and creates new synthetic referrals. This allows the deployed application to evolve over time instead of remaining a fixed CSV demonstration.

New referrals are persisted and can generate operational events such as:

- `CASE_CREATED`
- `AWAITING_ALLOCATION`
- `HIGH_PRIORITY_UNALLOCATED`
- `WORKER_ASSIGNED`
- `PRIORITY_CHANGED`
- `ALERT_RESOLVED`

---

## Architecture

```text
                         GitHub
                           |
                    GitHub Actions
                 CI/CD + scheduled jobs
                           |
             +-------------+-------------+
             |                           |
             v                           v
     Azure Static Web Apps        GitHub Container Registry
       React / Vite UI                    |
                                         v
                                  Azure App Service
                                      FastAPI
                                         |
                    +--------------------+--------------------+
                    |                    |                    |
                    v                    v                    v
              Persistent case      Persistent alerts     Audit / events
                   state                state               history
                    |                    |                    |
                    +--------------------+--------------------+
                                         |
                              /home/safequeue
```

---

## Technology stack

### Frontend
- React
- Vite
- CSS
- Responsive operational dashboard UI

### Backend
- Python
- FastAPI
- Pandas
- REST API
- Role-based permission checks

### Cloud
- Microsoft Azure App Service
- Azure Static Web Apps
- Linux App Service persistent storage

### DevOps
- GitHub
- GitHub Actions
- Docker
- GitHub Container Registry
- Automated backend deployment
- Automated frontend deployment
- Scheduled synthetic referral ingestion

---

## Persistence

The backend container itself is disposable.

Mutable application state is stored under:

```text
/home/safequeue
```

The application uses:

```text
SAFEQUEUE_DATA_DIR=/home/safequeue
```

This allows case assignments, alert changes, audit records, and live events to survive container replacement and new deployments.

The Docker image still contains clean seed data. On first start, if the persistent files do not exist, SafeQueue copies the seed files into persistent storage.

---

## Data model

The current prototype starts with **14,057 synthetic open cases**.

After consistency checks, the current seed dataset contains:

- **14,057 open cases**
- **11,184 allocated cases**
- **2,873 unallocated cases**
- **452 critical high-priority allocation alerts**
- **484 overdue safety-review alerts**

These values are generated from internally consistent case rules rather than independent dashboard counters.

### Example consistency rules

A case is marked as an overdue safety review when:

```text
safety_review_required = true
AND
safety_review_completed = false
AND
safety_review_due < effective case snapshot date
```

A worker assignment updates:

```text
allocation_status = Allocated
assigned_worker = <worker id>
event_type = WORKER_ASSIGNED
```

A high-priority unallocated case generates a critical operational alert.

---

## API

Key endpoints include:

```text
GET    /health
GET    /summary
GET    /cases
GET    /cases/{case_id}
GET    /alerts
GET    /audit
GET    /permissions
GET    /live-events

POST   /cases/{case_id}/assign
PATCH  /alerts/{alert_id}/resolve
POST   /synthetic-referral
```

---

## Security and governance model

SafeQueue demonstrates a lightweight governed workflow rather than production authentication.

Demo roles include:

- Team Leader
- Auditor
- Admin

Examples:

- Operational changes send Team Leader identity headers
- Audit access uses an Auditor identity
- Permission checks are enforced by the backend
- Assignment and resolution actions require a reason
- Changes are written to an audit trail

For a production implementation, these demo identity headers would be replaced with enterprise authentication and authorization.

---

## CI/CD

### Backend
A push to backend-related files triggers GitHub Actions:

```text
git push
   |
   v
Build Docker image
   |
   v
Push image to GHCR
   |
   v
Deploy image to Azure App Service
```

### Frontend
Frontend changes are built and deployed automatically through Azure Static Web Apps CI/CD.

### Synthetic ingestion
A scheduled GitHub Actions workflow creates a small number of synthetic referrals each day.

This keeps cloud usage extremely small while still demonstrating a continuously evolving application.

---

## Why synthetic data?

Child-welfare information is highly sensitive.

This project deliberately avoids real personal case data.

The synthetic dataset exists to demonstrate:

- operational workflows
- case allocation
- alerting
- governance
- auditability
- state persistence
- event-driven thinking
- CI/CD
- cloud deployment

without exposing real individuals.

---

## Current limitations

This is a portfolio prototype, not a production case-management platform.

Current limitations include:

- CSV-backed state rather than a transactional database
- demo identity headers rather than enterprise authentication
- single-instance assumptions for file writes
- synthetic worker IDs
- no worker-capacity / skills matching yet
- no production messaging or notification service
- no production SLA engine
- no real Tusla case data

---

## Planned improvements

### Worker allocation intelligence
A future version could recommend eligible workers using:

- region
- workload
- current capacity
- case complexity
- relevant experience
- quality / performance signals

### Data platform
Potential future storage upgrade:

- Azure SQL
- PostgreSQL
- Microsoft Fabric / Lakehouse

### Event processing
Potential future additions:

- queue-based event processing
- notification rules
- escalation workflows
- SLA monitoring
- operational forecasting

### Identity
Replace demo headers with:

- Microsoft Entra ID
- real RBAC
- authenticated user identity
- least-privilege access

---

## Repository structure

```text
SafeQueue/
├── data/
│   ├── safequeue_synthetic_cases_v1.csv
│   └── safequeue_alerts_v1.csv
│
├── src/
│   ├── api.py
│   ├── permissions.py
│   ├── fix_case_consistency.py
│   └── rebuild_alerts_from_cases.py
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── api.js
│   └── public/
│
├── .github/
│   └── workflows/
│
├── Dockerfile
├── requirements.txt
└── README.md
```

---

## Running locally

### Backend

```bash
pip install -r requirements.txt
uvicorn src.api:app --reload --port 8000
```

Health check:

```text
http://127.0.0.1:8000/health
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

By default, local development connects to:

```text
http://127.0.0.1:8000
```

Production uses:

```text
VITE_API_BASE_URL
```

---

## What this project demonstrates

SafeQueue is primarily a demonstration of end-to-end solution thinking:

- data modelling
- business-rule design
- API development
- operational UI design
- governance
- auditability
- Docker
- Azure deployment
- persistent state
- CI/CD
- scheduled automation
- synthetic event generation
- data-quality validation

The goal was not to build another static dashboard. It was to build a small operational system whose data, workflows, deployment and controls behave coherently.

---

## Disclaimer

SafeQueue is an independent portfolio project using synthetic data.

It is not affiliated with, endorsed by, or operated by Tusla or any other child-welfare authority.
