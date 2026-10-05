from enum import Enum


class Role(str, Enum):
    SOCIAL_WORKER = "Social Worker"
    TEAM_LEADER = "Team Leader"
    ADMIN = "Admin"
    AUDITOR = "Auditor"


class Action(str, Enum):
    VIEW_ASSIGNED_CASE = "view_assigned_case"
    VIEW_ANY_CASE = "view_any_case"
    UPDATE_CASE_STATUS = "update_case_status"
    CHANGE_PRIORITY = "change_priority"
    ASSIGN_WORKER = "assign_worker"
    REASSIGN_WORKER = "reassign_worker"
    COMPLETE_SAFETY_REVIEW = "complete_safety_review"
    OVERRIDE_TECHNICAL_STATUS = "override_technical_status"
    MANAGE_USERS = "manage_users"
    MANAGE_ROLES = "manage_roles"
    VIEW_AUDIT_LOGS = "view_audit_logs"
    EXPORT_CASE_DATA = "export_case_data"
    DELETE_AUDIT_LOGS = "delete_audit_logs"


PERMISSIONS = {
    Role.SOCIAL_WORKER: {
        Action.VIEW_ASSIGNED_CASE,
        Action.UPDATE_CASE_STATUS,
        Action.COMPLETE_SAFETY_REVIEW,
        Action.VIEW_AUDIT_LOGS,
    },
    Role.TEAM_LEADER: {
        Action.VIEW_ASSIGNED_CASE,
        Action.VIEW_ANY_CASE,
        Action.UPDATE_CASE_STATUS,
        Action.CHANGE_PRIORITY,
        Action.ASSIGN_WORKER,
        Action.REASSIGN_WORKER,
        Action.COMPLETE_SAFETY_REVIEW,
        Action.VIEW_AUDIT_LOGS,
        Action.EXPORT_CASE_DATA,
    },
    Role.ADMIN: {
        Action.VIEW_ANY_CASE,
        Action.OVERRIDE_TECHNICAL_STATUS,
        Action.MANAGE_USERS,
        Action.MANAGE_ROLES,
        Action.VIEW_AUDIT_LOGS,
        Action.EXPORT_CASE_DATA,
    },
    Role.AUDITOR: {
        Action.VIEW_ANY_CASE,
        Action.VIEW_AUDIT_LOGS,
        Action.EXPORT_CASE_DATA,
    },
}

IMMUTABLE_ACTIONS = {
    Action.DELETE_AUDIT_LOGS,
}


def is_allowed(role: Role, action: Action) -> bool:
    if action in IMMUTABLE_ACTIONS:
        return False
    return action in PERMISSIONS.get(role, set())


def require_permission(role: Role, action: Action) -> None:
    if not is_allowed(role, action):
        raise PermissionError(
            f"{role.value} is not allowed to perform action: {action.value}"
        )


def permission_summary():
    return {
        role.value: sorted(action.value for action in actions)
        for role, actions in PERMISSIONS.items()
    }


if __name__ == "__main__":
    print("SafeQueue RBAC permissions\n")

    for role, actions in permission_summary().items():
        print(f"{role}:")
        for action in actions:
            print(f"  - {action}")
        print()

    print("Permission tests:")
    tests = [
        (Role.SOCIAL_WORKER, Action.CHANGE_PRIORITY),
        (Role.TEAM_LEADER, Action.CHANGE_PRIORITY),
        (Role.ADMIN, Action.MANAGE_USERS),
        (Role.ADMIN, Action.CHANGE_PRIORITY),
        (Role.AUDITOR, Action.VIEW_AUDIT_LOGS),
        (Role.ADMIN, Action.DELETE_AUDIT_LOGS),
    ]

    for role, action in tests:
        result = "ALLOWED" if is_allowed(role, action) else "DENIED"
        print(f"{role.value:15} -> {action.value:28} = {result}")
