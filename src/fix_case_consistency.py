import pandas as pd
from pathlib import Path

# Run this from the SafeQueue project root.
# It cleans the local seed dataset only.
DATA_FILE = Path("data/safequeue_synthetic_cases_v1.csv")

if not DATA_FILE.exists():
    raise FileNotFoundError(
        f"Could not find {DATA_FILE}. Run this script from the SafeQueue project root."
    )

df = pd.read_csv(DATA_FILE)

# Keep a backup before changing anything.
backup = DATA_FILE.with_name("safequeue_synthetic_cases_v1_backup.csv")
if not backup.exists():
    df.to_csv(backup, index=False)
    print(f"Backup created: {backup}")

# ---------------------------------------
# 1) Fix safety review overdue logic
# ---------------------------------------

referral_date = pd.to_datetime(df["referral_date"], errors="coerce")
review_due = pd.to_datetime(df["safety_review_due"], errors="coerce")

snapshot_date = referral_date + pd.to_timedelta(
    df["waiting_days"].fillna(0),
    unit="D"
)

review_required = df["safety_review_required"].fillna(False).astype(bool)
review_completed = df["safety_review_completed"].fillna(False).astype(bool)

new_overdue = (
    review_required
    & ~review_completed
    & review_due.notna()
    & snapshot_date.notna()
    & (review_due < snapshot_date)
)

old_overdue = df["safety_review_overdue"].fillna(False).astype(bool)
overdue_changed = int((old_overdue != new_overdue).sum())

df["safety_review_overdue"] = new_overdue

# ---------------------------------------
# 2) Fix event_type consistency
# ---------------------------------------

allocated = (
    df["allocation_status"].astype(str).eq("Allocated")
    & df["assigned_worker"].fillna("").astype(str).str.strip().ne("")
)

unallocated = df["allocation_status"].astype(str).eq("Unallocated")

event_changed = int(
    (
        (allocated & df["event_type"].astype(str).ne("WORKER_ASSIGNED"))
        | (unallocated & df["event_type"].astype(str).ne("AWAITING_ALLOCATION"))
    ).sum()
)

df.loc[allocated, "event_type"] = "WORKER_ASSIGNED"
df.loc[unallocated, "event_type"] = "AWAITING_ALLOCATION"

# ---------------------------------------
# Save cleaned dataset
# ---------------------------------------

df.to_csv(DATA_FILE, index=False)

print()
print("Cleanup complete.")
print(f"Safety review overdue values corrected: {overdue_changed}")
print(f"event_type values corrected: {event_changed}")
print(f"Total overdue reviews now: {int(df['safety_review_overdue'].sum())}")
print(f"Allocated cases marked WORKER_ASSIGNED: {int(allocated.sum())}")
print(f"Unallocated cases marked AWAITING_ALLOCATION: {int(unallocated.sum())}")
print(f"Saved to: {DATA_FILE}")
print(f"Backup: {backup}")
