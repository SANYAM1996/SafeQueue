import pandas as pd
from pathlib import Path
import uuid

CASES_FILE = Path("data/safequeue_synthetic_cases_v1.csv")
ALERTS_FILE = Path("data/safequeue_alerts_v1.csv")
BACKUP_FILE = Path("data/safequeue_alerts_v1_backup.csv")

if not CASES_FILE.exists():
    raise FileNotFoundError(f"Missing {CASES_FILE}")

cases = pd.read_csv(CASES_FILE)

if ALERTS_FILE.exists() and not BACKUP_FILE.exists():
    pd.read_csv(ALERTS_FILE).to_csv(BACKUP_FILE, index=False)
    print(f"Backup created: {BACKUP_FILE}")

alerts = []

for _, c in cases.iterrows():
    case_id = str(c["case_id"])
    region = str(c.get("region", ""))
    priority = str(c.get("priority", ""))
    allocation_status = str(c.get("allocation_status", ""))
    waiting_days = int(c.get("waiting_days", 0) or 0)

    # Rule 1: High-priority unallocated case => CRITICAL open alert
    if priority == "High" and allocation_status == "Unallocated":
        alerts.append({
            "alert_id": f"ALT-{uuid.uuid4().hex[:12].upper()}",
            "case_id": case_id,
            "alert_type": "HIGH_PRIORITY_UNALLOCATED",
            "severity": "CRITICAL",
            "reason": "High-priority case is awaiting allocation to a social worker.",
            "recommended_action": "Immediate human review and allocation decision.",
            "assigned_role": "Team Leader",
            "status": "OPEN",
            "created_at": "",
            "source_event_type": "HIGH_PRIORITY_UNALLOCATED",
        })

    # Rule 2: Overdue safety review => HIGH open alert
    if bool(c.get("safety_review_overdue", False)):
        alerts.append({
            "alert_id": f"ALT-{uuid.uuid4().hex[:12].upper()}",
            "case_id": case_id,
            "alert_type": "SAFETY_REVIEW_OVERDUE",
            "severity": "HIGH",
            "reason": "Required safety review is overdue.",
            "recommended_action": "Review the case and complete the required safety review.",
            "assigned_role": "Team Leader",
            "status": "OPEN",
            "created_at": "",
            "source_event_type": "SAFETY_REVIEW_OVERDUE",
        })

alerts_df = pd.DataFrame(alerts)

alerts_df.to_csv(ALERTS_FILE, index=False)

print()
print("Alert rebuild complete.")
print(f"Total alerts: {len(alerts_df)}")
print(
    "Critical high-priority unallocated alerts:",
    int((alerts_df["alert_type"] == "HIGH_PRIORITY_UNALLOCATED").sum())
)
print(
    "Overdue safety-review alerts:",
    int((alerts_df["alert_type"] == "SAFETY_REVIEW_OVERDUE").sum())
)
print(f"Saved to: {ALERTS_FILE}")
print(f"Backup: {BACKUP_FILE if BACKUP_FILE.exists() else 'not created'}")
