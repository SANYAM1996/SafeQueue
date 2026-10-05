import pandas as pd
import uuid
from pathlib import Path

INPUT_FILE = Path("data/safequeue_events_v1.csv")
OUTPUT_FILE = Path("data/safequeue_alerts_v1.csv")

# Rule thresholds for V1.
# These are prototype values, not Tusla policy thresholds.
REPEATED_ACCESS_DENIED_THRESHOLD = 3


def new_alert_id():
    return f"ALT-{uuid.uuid4().hex[:12].upper()}"


def create_alert(
    alerts,
    case_id,
    alert_type,
    severity,
    reason,
    recommended_action,
    assigned_role,
    created_at,
    source_event_type,
):
    alerts.append({
        "alert_id": new_alert_id(),
        "case_id": case_id,
        "alert_type": alert_type,
        "severity": severity,
        "reason": reason,
        "recommended_action": recommended_action,
        "assigned_role": assigned_role,
        "status": "OPEN",
        "created_at": created_at,
        "source_event_type": source_event_type
    })


def main():
    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            f"Could not find {INPUT_FILE}. "
            "Run generate_events.py first."
        )

    events = pd.read_csv(INPUT_FILE)
    events["event_time"] = pd.to_datetime(events["event_time"], errors="coerce")

    alerts = []

    # ---------------------------------------------------------
    # RULE 1: High-priority case is still unallocated
    # ---------------------------------------------------------
    hp = events[events["event_type"] == "HIGH_PRIORITY_UNALLOCATED"]

    for _, event in hp.iterrows():
        create_alert(
            alerts=alerts,
            case_id=event["case_id"],
            alert_type="HIGH_PRIORITY_UNALLOCATED",
            severity="CRITICAL",
            reason="High-priority case is awaiting allocation to a social worker.",
            recommended_action="Immediate human review and allocation decision.",
            assigned_role="Team Leader",
            created_at=event["event_time"],
            source_event_type=event["event_type"]
        )

    # ---------------------------------------------------------
    # RULE 2: Safety review is overdue
    # ---------------------------------------------------------
    overdue = events[events["event_type"] == "SAFETY_REVIEW_OVERDUE"]

    for _, event in overdue.iterrows():
        create_alert(
            alerts=alerts,
            case_id=event["case_id"],
            alert_type="SAFETY_REVIEW_OVERDUE",
            severity="HIGH",
            reason="Required safeguarding review was not completed by the due time.",
            recommended_action="Review the case and record the safeguarding action taken.",
            assigned_role="Team Leader",
            created_at=event["event_time"],
            source_event_type=event["event_type"]
        )

    # ---------------------------------------------------------
    # RULE 3: Escalation event exists
    # ---------------------------------------------------------
    escalations = events[events["event_type"] == "ESCALATION_TRIGGERED"]

    for _, event in escalations.iterrows():
        create_alert(
            alerts=alerts,
            case_id=event["case_id"],
            alert_type="ESCALATION_REQUIRED",
            severity="HIGH",
            reason="A safeguarding workflow escalation was triggered.",
            recommended_action="Team Leader must review the case and record the outcome.",
            assigned_role="Team Leader",
            created_at=event["event_time"],
            source_event_type=event["event_type"]
        )

    # ---------------------------------------------------------
    # RULE 4: Repeated access denied by same actor
    # ---------------------------------------------------------
    denied = events[events["event_type"] == "ACCESS_DENIED"].copy()

    if not denied.empty:
        access_summary = (
            denied.groupby("actor_id")
            .agg(
                denied_attempts=("event_id", "count"),
                latest_attempt=("event_time", "max")
            )
            .reset_index()
        )

        suspicious_users = access_summary[
            access_summary["denied_attempts"] >= REPEATED_ACCESS_DENIED_THRESHOLD
        ]

        for _, user in suspicious_users.iterrows():
            related = denied[denied["actor_id"] == user["actor_id"]]
            example_case = related.iloc[-1]["case_id"]

            create_alert(
                alerts=alerts,
                case_id=example_case,
                alert_type="REPEATED_ACCESS_DENIED",
                severity="MEDIUM",
                reason=(
                    f"{user['actor_id']} had "
                    f"{int(user['denied_attempts'])} denied access attempts."
                ),
                recommended_action="Security or administrator review of user permissions.",
                assigned_role="Admin",
                created_at=user["latest_attempt"],
                source_event_type="ACCESS_DENIED"
            )

    # ---------------------------------------------------------
    # RULE 5: Manual priority changes should be auditable
    # ---------------------------------------------------------
    priority_changes = events[events["event_type"] == "PRIORITY_CHANGED"]

    for _, event in priority_changes.iterrows():
        create_alert(
            alerts=alerts,
            case_id=event["case_id"],
            alert_type="PRIORITY_CHANGE_REVIEW",
            severity="LOW",
            reason="Case priority was manually changed by an authorised user.",
            recommended_action="Retain for audit review; no action required unless challenged.",
            assigned_role="Auditor",
            created_at=event["event_time"],
            source_event_type=event["event_type"]
        )

    alerts_df = pd.DataFrame(alerts)

    if alerts_df.empty:
        print("No alerts generated.")
        return

    alerts_df["created_at"] = pd.to_datetime(alerts_df["created_at"])
    alerts_df = alerts_df.sort_values(
        ["created_at", "severity"],
        ascending=[True, True]
    ).reset_index(drop=True)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    alerts_df.to_csv(OUTPUT_FILE, index=False)

    print(f"Created {len(alerts_df):,} alerts")
    print(f"Saved to: {OUTPUT_FILE}")

    print("\nAlert counts:")
    print(alerts_df["alert_type"].value_counts())

    print("\nSeverity counts:")
    print(alerts_df["severity"].value_counts())


if __name__ == "__main__":
    main()
