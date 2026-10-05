import pandas as pd
import uuid
import random
from pathlib import Path

INPUT_FILE = Path("data/safequeue_synthetic_cases_v1.csv")
OUTPUT_FILE = Path("data/safequeue_events_v1.csv")

random.seed(42)

def new_event_id():
    return f"EVT-{uuid.uuid4().hex[:12].upper()}"

def add_event(events, case, event_type, event_time, actor_role, actor_id,
              previous_value="", new_value="", reason="", source="SafeQueue"):
    events.append({
        "event_id": new_event_id(),
        "case_id": case["case_id"],
        "event_type": event_type,
        "event_time": event_time,
        "actor_role": actor_role,
        "actor_id": actor_id,
        "region": case["region"],
        "previous_value": previous_value,
        "new_value": new_value,
        "reason": reason,
        "source": source
    })

def main():
    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            f"Could not find {INPUT_FILE}. "
            "Make sure safequeue_synthetic_cases_v1.csv is inside the data folder."
        )

    df = pd.read_csv(INPUT_FILE)
    events = []

    for _, case in df.iterrows():
        referral_time = pd.to_datetime(case["event_time"])
        actor_id = f"SYS-{random.randint(100,999)}"

        # 1. Case created
        add_event(
            events, case,
            "CASE_CREATED",
            referral_time,
            "System",
            actor_id,
            new_value="Open",
            reason="Referral received"
        )

        # 2. Preliminary enquiry completed
        if bool(case["preliminary_enquiry_completed"]):
            prelim_time = referral_time + pd.Timedelta(hours=random.randint(2, 24))
            add_event(
                events, case,
                "PRELIMINARY_ENQUIRY_COMPLETED",
                prelim_time,
                "Social Worker",
                f"SW-{random.randint(100,999)}",
                previous_value="Pending",
                new_value="Completed",
                reason="Preliminary enquiry completed"
            )
        else:
            prelim_time = referral_time

        # 3. Initial assessment required
        if bool(case["initial_assessment_required"]):
            ia_time = prelim_time + pd.Timedelta(hours=random.randint(1, 12))
            add_event(
                events, case,
                "INITIAL_ASSESSMENT_REQUIRED",
                ia_time,
                "Social Worker",
                f"SW-{random.randint(100,999)}",
                previous_value="Not Required",
                new_value="Required",
                reason="Preliminary enquiry identified need for assessment"
            )

        # 4. Case opened
        open_time = referral_time + pd.Timedelta(hours=random.randint(1, 24))
        add_event(
            events, case,
            "CASE_OPENED",
            open_time,
            "System",
            actor_id,
            previous_value="Referral",
            new_value="Open Case",
            reason="Case accepted into social work service"
        )

        # 5. Allocation state
        if case["allocation_status"] == "Unallocated":
            allocation_time = open_time + pd.Timedelta(minutes=random.randint(5, 120))
            add_event(
                events, case,
                "AWAITING_ALLOCATION",
                allocation_time,
                "System",
                actor_id,
                previous_value="Open",
                new_value="Unallocated",
                reason="No worker assigned"
            )

            if case["priority"] == "High":
                add_event(
                    events, case,
                    "HIGH_PRIORITY_UNALLOCATED",
                    allocation_time + pd.Timedelta(minutes=1),
                    "System",
                    actor_id,
                    previous_value="Unallocated",
                    new_value="Human Review Required",
                    reason="High-priority case is still awaiting allocation"
                )

        else:
            worker = case["assigned_worker"] if pd.notna(case["assigned_worker"]) else f"SW-{random.randint(100,999)}"
            assigned_time = open_time + pd.Timedelta(days=max(int(case["waiting_days"]), 0))
            add_event(
                events, case,
                "WORKER_ASSIGNED",
                assigned_time,
                "Team Leader",
                f"TL-{random.randint(10,99)}",
                previous_value="Unallocated",
                new_value=worker,
                reason="Case allocated to social worker"
            )

        # 6. Safety review events
        if bool(case["safety_review_required"]):
            due = pd.to_datetime(case["safety_review_due"], errors="coerce")

            if pd.notna(due):
                add_event(
                    events, case,
                    "SAFETY_REVIEW_DUE",
                    due,
                    "System",
                    actor_id,
                    new_value="Review Due",
                    reason="Scheduled safeguarding review"
                )

            if bool(case["safety_review_completed"]):
                completed = pd.to_datetime(case["safety_review_completed_date"], errors="coerce")
                if pd.notna(completed):
                    add_event(
                        events, case,
                        "SAFETY_REVIEW_COMPLETED",
                        completed,
                        "Social Worker",
                        f"SW-{random.randint(100,999)}",
                        previous_value="Due",
                        new_value="Completed",
                        reason="Safeguarding review completed"
                    )

            if bool(case["safety_review_overdue"]) and pd.notna(due):
                overdue_time = due + pd.Timedelta(days=1)
                add_event(
                    events, case,
                    "SAFETY_REVIEW_OVERDUE",
                    overdue_time,
                    "System",
                    actor_id,
                    previous_value="Due",
                    new_value="Overdue",
                    reason="Required safeguarding review not completed on time"
                )

                add_event(
                    events, case,
                    "ESCALATION_TRIGGERED",
                    overdue_time + pd.Timedelta(minutes=5),
                    "System",
                    actor_id,
                    previous_value="Overdue",
                    new_value="Team Leader Review",
                    reason="Overdue safeguarding action requires human review"
                )

        # 7. Governance events
        if random.random() < 0.25:
            add_event(
                events, case,
                "CASE_VIEWED",
                referral_time + pd.Timedelta(days=random.randint(0, 10)),
                random.choice(["Social Worker", "Team Leader"]),
                f"USR-{random.randint(1000,9999)}",
                reason="Authorised case access",
                source="Audit"
            )

        if random.random() < 0.03:
            add_event(
                events, case,
                "ACCESS_DENIED",
                referral_time + pd.Timedelta(days=random.randint(0, 10)),
                "Unauthorised User",
                f"USR-{random.randint(1000,9999)}",
                previous_value="Access Requested",
                new_value="Denied",
                reason="User role did not permit access to case",
                source="Audit"
            )

        if random.random() < 0.02:
            add_event(
                events, case,
                "PRIORITY_CHANGED",
                referral_time + pd.Timedelta(days=random.randint(1, 7)),
                "Team Leader",
                f"TL-{random.randint(10,99)}",
                previous_value="Standard",
                new_value="High",
                reason="Priority manually reassessed by authorised professional",
                source="Audit"
            )

    events_df = pd.DataFrame(events)
    events_df["event_time"] = pd.to_datetime(events_df["event_time"])
    events_df = events_df.sort_values(["case_id", "event_time"]).reset_index(drop=True)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    events_df.to_csv(OUTPUT_FILE, index=False)

    print(f"Created {len(events_df):,} events")
    print(f"Saved to: {OUTPUT_FILE}")
    print("\nEvent counts:")
    print(events_df["event_type"].value_counts())

if __name__ == "__main__":
    main()
