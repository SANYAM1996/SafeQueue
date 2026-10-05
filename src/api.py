from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone
import os
import shutil

from permissions import Role, Action, require_permission, permission_summary


app = FastAPI(
    title="SafeQueue API",
    version="0.2.3",
    description="Prototype child-welfare case monitoring and governance API using synthetic data."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://proud-plant-07a2e5303.3.azurestaticapps.net",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# Persistent data setup
# ---------------------------------------------------------

SOURCE_DATA_DIR = Path("data")
DATA_DIR = Path(os.getenv("SAFEQUEUE_DATA_DIR", "data"))

DATA_DIR.mkdir(parents=True, exist_ok=True)

SEED_FILES = [
    "safequeue_synthetic_cases_v1.csv",
    "safequeue_alerts_v1.csv",
]

for filename in SEED_FILES:
    source = SOURCE_DATA_DIR / filename
    target = DATA_DIR / filename

    if not target.exists():
        if not source.exists():
            raise FileNotFoundError(f"Missing seed file: {source}")

        shutil.copy2(source, target)
        print(f"Seeded persistent data file: {target}")


CASES_FILE = DATA_DIR / "safequeue_synthetic_cases_v1.csv"
ALERTS_FILE = DATA_DIR / "safequeue_alerts_v1.csv"
AUDIT_FILE = DATA_DIR / "runtime_audit_log.csv"

cases_df = pd.read_csv(CASES_FILE)
alerts_df = pd.read_csv(ALERTS_FILE)


# ---------------------------------------------------------
# Request models
# ---------------------------------------------------------

class StatusUpdate(BaseModel):
    status: str
    reason: str


class PriorityUpdate(BaseModel):
    priority: str
    reason: str


class WorkerAssignment(BaseModel):
    worker_id: str
    reason: str


class AlertResolution(BaseModel):
    resolution: str
    reason: str


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def parse_role(x_role: str) -> Role:
    try:
        return Role(x_role)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid X-Role. Use one of: {[r.value for r in Role]}"
        )


def enforce_permission(role: Role, action: Action) -> None:
    try:
        require_permission(role, action)
    except PermissionError as exc:
        raise HTTPException(
            status_code=403,
            detail=str(exc)
        ) from exc


def write_audit(
    actor_role: str,
    actor_id: str,
    action: str,
    target_type: str,
    target_id: str,
    old_value: str = "",
    new_value: str = "",
    reason: str = "",
):
    row = pd.DataFrame([{
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "actor_role": actor_role,
        "actor_id": actor_id,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "old_value": old_value,
        "new_value": new_value,
        "reason": reason,
    }])

    if AUDIT_FILE.exists():
        row.to_csv(AUDIT_FILE, mode="a", header=False, index=False)
    else:
        row.to_csv(AUDIT_FILE, index=False)


# ---------------------------------------------------------
# Health / summary
# ---------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok",
        "cases_loaded": int(len(cases_df)),
        "alerts_loaded": int(len(alerts_df)),
        "data_dir": str(DATA_DIR),
    }


@app.get("/summary")
def get_summary():
    return {
        "total_cases": int(len(cases_df)),
        "open_cases": int((cases_df["case_status"] == "Open").sum()),
        "unallocated_cases": int(
            (cases_df["allocation_status"] == "Unallocated").sum()
        ),
        "critical_alerts": int(
            (
                (alerts_df["severity"] == "CRITICAL")
                & (alerts_df["status"] == "OPEN")
            ).sum()
        ),
        "overdue_reviews": int(
            (
                (alerts_df["alert_type"] == "SAFETY_REVIEW_OVERDUE")
                & (alerts_df["status"] == "OPEN")
            ).sum()
        ),
    }


@app.get("/permissions")
def get_permissions():
    return permission_summary()


# ---------------------------------------------------------
# Cases
# ---------------------------------------------------------

@app.get("/cases")
def list_cases(
    limit: int = Query(50, ge=1, le=500),
    priority: Optional[str] = None,
    allocation_status: Optional[str] = None,
    region: Optional[str] = None,
):
    df = cases_df.copy()

    if priority:
        df = df[
            df["priority"].astype(str).str.lower() == priority.lower()
        ]

    if allocation_status:
        df = df[
            df["allocation_status"].astype(str).str.lower()
            == allocation_status.lower()
        ]

    if region:
        df = df[
            df["region"]
            .astype(str)
            .str.lower()
            .str.contains(region.lower(), na=False)
        ]

    return {
        "count": int(min(len(df), limit)),
        "total_matching": int(len(df)),
        "items": df.head(limit).fillna("").to_dict(orient="records"),
    }


@app.get("/cases/{case_id}")
def get_case(case_id: str):
    match = cases_df[cases_df["case_id"] == case_id]

    if match.empty:
        raise HTTPException(status_code=404, detail="Case not found")

    return match.iloc[0].fillna("").to_dict()


@app.patch("/cases/{case_id}/status")
def update_case_status(
    case_id: str,
    body: StatusUpdate,
    x_role: str = Header(..., alias="X-Role"),
    x_user_id: str = Header(..., alias="X-User-ID"),
):
    role = parse_role(x_role)
    enforce_permission(role, Action.UPDATE_CASE_STATUS)

    matches = cases_df.index[
        cases_df["case_id"] == case_id
    ].tolist()

    if not matches:
        raise HTTPException(status_code=404, detail="Case not found")

    idx = matches[0]
    old = str(cases_df.at[idx, "case_status"])

    cases_df.at[idx, "case_status"] = body.status
    cases_df.to_csv(CASES_FILE, index=False)

    write_audit(
        role.value,
        x_user_id,
        "UPDATE_CASE_STATUS",
        "case",
        case_id,
        old,
        body.status,
        body.reason,
    )

    return {
        "case_id": case_id,
        "old_status": old,
        "new_status": body.status,
        "message": "Case status updated and audit event recorded.",
    }


@app.patch("/cases/{case_id}/priority")
def update_priority(
    case_id: str,
    body: PriorityUpdate,
    x_role: str = Header(..., alias="X-Role"),
    x_user_id: str = Header(..., alias="X-User-ID"),
):
    role = parse_role(x_role)
    enforce_permission(role, Action.CHANGE_PRIORITY)

    matches = cases_df.index[
        cases_df["case_id"] == case_id
    ].tolist()

    if not matches:
        raise HTTPException(status_code=404, detail="Case not found")

    idx = matches[0]
    old = str(cases_df.at[idx, "priority"])

    cases_df.at[idx, "priority"] = body.priority
    cases_df.to_csv(CASES_FILE, index=False)

    write_audit(
        role.value,
        x_user_id,
        "CHANGE_PRIORITY",
        "case",
        case_id,
        old,
        body.priority,
        body.reason,
    )

    return {
        "case_id": case_id,
        "old_priority": old,
        "new_priority": body.priority,
        "message": "Priority changed and audit event recorded.",
    }


@app.post("/cases/{case_id}/assign")
def assign_worker(
    case_id: str,
    body: WorkerAssignment,
    x_role: str = Header(..., alias="X-Role"),
    x_user_id: str = Header(..., alias="X-User-ID"),
):
    role = parse_role(x_role)
    enforce_permission(role, Action.ASSIGN_WORKER)

    matches = cases_df.index[
        cases_df["case_id"] == case_id
    ].tolist()

    if not matches:
        raise HTTPException(status_code=404, detail="Case not found")

    idx = matches[0]

    old_worker = (
        str(cases_df.at[idx, "assigned_worker"])
        if pd.notna(cases_df.at[idx, "assigned_worker"])
        else ""
    )

    cases_df.at[idx, "assigned_worker"] = body.worker_id
    cases_df.at[idx, "allocation_status"] = "Allocated"
    cases_df.to_csv(CASES_FILE, index=False)

    write_audit(
        role.value,
        x_user_id,
        "ASSIGN_WORKER",
        "case",
        case_id,
        old_worker,
        body.worker_id,
        body.reason,
    )

    return {
        "case_id": case_id,
        "assigned_worker": body.worker_id,
        "allocation_status": "Allocated",
        "message": "Worker assigned and audit event recorded.",
    }


# ---------------------------------------------------------
# Alerts
# ---------------------------------------------------------

@app.get("/alerts")
def list_alerts(
    limit: int = Query(50, ge=1, le=500),
    severity: Optional[str] = None,
    status: Optional[str] = None,
    assigned_role: Optional[str] = None,
):
    df = alerts_df.copy()

    if severity:
        df = df[
            df["severity"].astype(str).str.lower() == severity.lower()
        ]

    if status:
        df = df[
            df["status"].astype(str).str.lower() == status.lower()
        ]

    if assigned_role:
        df = df[
            df["assigned_role"].astype(str).str.lower()
            == assigned_role.lower()
        ]

    return {
        "count": int(min(len(df), limit)),
        "total_matching": int(len(df)),
        "items": df.head(limit).fillna("").to_dict(orient="records"),
    }


@app.patch("/alerts/{alert_id}/resolve")
def resolve_alert(
    alert_id: str,
    body: AlertResolution,
    x_role: str = Header(..., alias="X-Role"),
    x_user_id: str = Header(..., alias="X-User-ID"),
):
    role = parse_role(x_role)

    if role != Role.TEAM_LEADER:
        raise HTTPException(
            status_code=403,
            detail="Only Team Leader can resolve operational alerts in V1."
        )

    matches = alerts_df.index[
        alerts_df["alert_id"] == alert_id
    ].tolist()

    if not matches:
        raise HTTPException(status_code=404, detail="Alert not found")

    idx = matches[0]
    old = str(alerts_df.at[idx, "status"])

    alerts_df.at[idx, "status"] = "RESOLVED"
    alerts_df.to_csv(ALERTS_FILE, index=False)

    write_audit(
        role.value,
        x_user_id,
        "RESOLVE_ALERT",
        "alert",
        alert_id,
        old,
        "RESOLVED",
        body.reason,
    )

    return {
        "alert_id": alert_id,
        "status": "RESOLVED",
        "resolution": body.resolution,
        "message": "Alert resolved and audit event recorded.",
    }


# ---------------------------------------------------------
# Audit
# ---------------------------------------------------------

@app.get("/audit")
def get_audit_log(
    limit: int = Query(100, ge=1, le=1000),
    x_role: str = Header(..., alias="X-Role"),
    x_user_id: str = Header(..., alias="X-User-ID"),
):
    role = parse_role(x_role)
    enforce_permission(role, Action.VIEW_AUDIT_LOGS)

    if not AUDIT_FILE.exists():
        return {
            "count": 0,
            "items": [],
        }

    audit_df = pd.read_csv(AUDIT_FILE)

    return {
        "count": int(min(len(audit_df), limit)),
        "items": audit_df.tail(limit).fillna("").to_dict(orient="records"),
    }
