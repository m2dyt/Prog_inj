#!/usr/bin/env python3
"""Idempotently provision the Lab 2 Redmine project through its REST API.

The script uses only Python's standard library. Redmine role, tracker, status,
workflow and custom-field definitions remain a one-time administrator setup;
the REST API exposes those definitions read-only. See REDMINE.md for details.
"""

from __future__ import annotations

import argparse
import csv
import getpass
import json
import os
import re
import secrets
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
DEFAULT_CSV = ROOT / "backlog.csv"
PROJECT_IDENTIFIER = "supermarket-36"
PROJECT_NAME = "Информационная система супермаркета"
PROJECT_DESCRIPTION = (
    "Учебный проект по варианту 36. Среда Redmine для командной работы "
    "над информационной системой супермаркета."
)
EXPECTED_ISSUES = 15
PAGE_SIZE = 100
TIMEOUT_SECONDS = 20

TEAM = {
    "student_a": {
        "firstname": "Роман",
        "lastname": "Кочетков",
        "mail": "student_a@supermarket36.invalid",
        "role_aliases": ("Руководитель проекта", "Project Manager", "Manager"),
    },
    "student_b": {
        "firstname": "Кирилл",
        "lastname": "Энгельгард",
        "mail": "student_b@supermarket36.invalid",
        "role_aliases": ("Аналитик-разработчик", "Analyst Developer", "Developer"),
    },
    "student_c": {
        "firstname": "Максим",
        "lastname": "Прохоров",
        "mail": "student_c@supermarket36.invalid",
        "role_aliases": ("DevOps-инженер", "DevOps Engineer", "devops"),
    },
}

TRACKER_ALIASES = {
    "Требование": ("Требование", "req", "Support"),
    "Задача": ("Задача", "task", "Feature"),
    "Ошибка": ("Ошибка", "error", "Defect", "Bug"),
}
STATUS_ALIASES = {"Новая": ("Новая", "New")}
ISSUE_MARKER = re.compile(r"\[External ID:\s*(SM-\d{2})\]")
DEPENDENCY_MARKER = re.compile(r"\bSM-\d{2}\b")
CUSTOM_FIELD_NAMES = ("External ID", "Depends on", "Requirement")


class ProvisionError(RuntimeError):
    """Expected setup/API error with a user-readable message."""


@dataclass
class BacklogItem:
    row_number: int
    subject: str
    tracker: str
    status: str
    priority: str
    assignee: str
    estimated_hours: float
    description: str
    external_id: str
    dependencies: list[str]
    requirement: str
    category: str


class Redmine:
    def __init__(self, base_url: str, api_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        query: dict[str, str | int] | None = None,
    ) -> tuple[int, Any]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        if query:
            url = f"{url}?{urlencode(query)}"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
        headers = {
            "Accept": "application/json",
            "X-Redmine-API-Key": self.api_key,
            "User-Agent": "supermarket36-lab2-provisioner/1.0",
        }
        if body is not None:
            headers["Content-Type"] = "application/json; charset=utf-8"
        request = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                raw = response.read()
                if not raw:
                    return response.status, None
                return response.status, json.loads(raw.decode("utf-8"))
        except HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                detail = json.loads(raw)
            except json.JSONDecodeError:
                detail = raw.strip() or exc.reason
            raise ProvisionError(f"Redmine API {method} {path}: HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise ProvisionError(f"Не удалось подключиться к {self.base_url}: {exc.reason}") from exc
        except TimeoutError as exc:
            raise ProvisionError(f"Истекло время ожидания ответа от {self.base_url}") from exc
        except json.JSONDecodeError as exc:
            raise ProvisionError(f"Redmine вернул не-JSON ответ для {method} {path}") from exc

    def get(self, path: str, query: dict[str, str | int] | None = None) -> Any:
        return self.request("GET", path, query=query)[1]

    def post(self, path: str, payload: dict[str, Any]) -> Any:
        return self.request("POST", path, payload=payload)[1]

    def put(self, path: str, payload: dict[str, Any]) -> Any:
        return self.request("PUT", path, payload=payload)[1]

    def collection(
        self,
        path: str,
        key: str,
        base_query: dict[str, str | int] | None = None,
    ) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        offset = 0
        while True:
            query = {**(base_query or {}), "limit": PAGE_SIZE, "offset": offset}
            data = self.get(path, query)
            page = data.get(key, []) if isinstance(data, dict) else []
            result.extend(page)
            total = int(data.get("total_count", len(result)))
            if not page or len(result) >= total:
                return result
            offset += len(page)


def read_backlog(path: Path) -> list[BacklogItem]:
    try:
        file_obj = path.open("r", encoding="utf-8-sig", newline="")
    except OSError as exc:
        raise ProvisionError(f"Не удаётся открыть CSV {path}: {exc}") from exc

    required = {
        "Subject",
        "Tracker",
        "Status",
        "Priority",
        "Assigned to",
        "Estimated time",
        "Description",
        "External ID",
        "Depends on",
        "Requirement",
        "Category",
    }
    with file_obj:
        reader = csv.DictReader(file_obj)
        headers = set(reader.fieldnames or [])
        missing = sorted(required - headers)
        if missing:
            raise ProvisionError(f"В CSV отсутствуют столбцы: {', '.join(missing)}")
        items: list[BacklogItem] = []
        seen_ids: set[str] = set()
        for row_number, row in enumerate(reader, start=2):
            external_id = (row.get("External ID") or "").strip()
            if not re.fullmatch(r"SM-\d{2}", external_id):
                raise ProvisionError(f"Строка {row_number}: неверный External ID {external_id!r}")
            if external_id in seen_ids:
                raise ProvisionError(f"Строка {row_number}: повторный External ID {external_id}")
            seen_ids.add(external_id)
            try:
                estimate = float((row.get("Estimated time") or "").strip())
            except ValueError as exc:
                raise ProvisionError(f"Строка {row_number}: Estimated time должен быть числом") from exc
            deps = DEPENDENCY_MARKER.findall(row.get("Depends on") or "")
            if any(dep == external_id for dep in deps):
                raise ProvisionError(f"Строка {row_number}: задача не может зависеть от самой себя")
            assignee = (row.get("Assigned to") or "").strip()
            if assignee not in TEAM:
                raise ProvisionError(f"Строка {row_number}: неизвестный участник {assignee!r}")
            tracker = (row.get("Tracker") or "").strip()
            if tracker not in TRACKER_ALIASES:
                raise ProvisionError(f"Строка {row_number}: неизвестный трекер {tracker!r}")
            status = (row.get("Status") or "").strip()
            if status not in STATUS_ALIASES:
                raise ProvisionError(f"Строка {row_number}: неизвестный статус {status!r}")
            items.append(
                BacklogItem(
                    row_number=row_number,
                    subject=(row.get("Subject") or "").strip(),
                    tracker=tracker,
                    status=status,
                    priority=(row.get("Priority") or "").strip(),
                    assignee=assignee,
                    estimated_hours=estimate,
                    description=(row.get("Description") or "").strip(),
                    external_id=external_id,
                    dependencies=deps,
                    requirement=(row.get("Requirement") or "").strip(),
                    category=(row.get("Category") or "").strip(),
                )
            )

    if len(items) != EXPECTED_ISSUES:
        raise ProvisionError(f"В backlog.csv ожидалось {EXPECTED_ISSUES} задач, найдено {len(items)}")
    known = {item.external_id for item in items}
    for item in items:
        unknown = sorted(set(item.dependencies) - known)
        if unknown:
            raise ProvisionError(
                f"Строка {item.row_number}: {item.external_id} зависит от неизвестных ID: {', '.join(unknown)}"
            )
    return items


def normalized(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def find_named(records: list[dict[str, Any]], aliases: tuple[str, ...], kind: str) -> dict[str, Any]:
    by_name = {normalized(str(record.get("name", ""))): record for record in records}
    for alias in aliases:
        found = by_name.get(normalized(alias))
        if found:
            return found
    raise ProvisionError(
        f"В Redmine не найдена настройка {kind}: {', '.join(aliases)}. "
        "Сначала создайте её через Администрирование."
    )


def choose_tracker_aliases(name: str) -> tuple[str, ...]:
    return TRACKER_ALIASES[name]


def create_or_get_project(api: Redmine, trackers: list[dict[str, Any]]) -> dict[str, Any]:
    required_trackers = [find_named(trackers, aliases, "трекер") for aliases in TRACKER_ALIASES.values()]
    required_ids = sorted({int(tracker["id"]) for tracker in required_trackers})
    try:
        project = api.get(f"projects/{PROJECT_IDENTIFIER}.json?include=trackers")
        project = project["project"]
    except ProvisionError as exc:
        if "HTTP 404" not in str(exc):
            raise
        project = api.post(
            "projects.json",
            {
                "project": {
                    "name": PROJECT_NAME,
                    "identifier": PROJECT_IDENTIFIER,
                    "description": PROJECT_DESCRIPTION,
                    "is_public": False,
                    "tracker_ids": required_ids,
                    "enabled_module_names": ["issue_tracking", "time_tracking", "wiki"],
                }
            },
        )["project"]
        return project

    current_trackers = project.get("trackers", [])
    tracker_ids = sorted({int(item["id"]) for item in current_trackers} | set(required_ids))
    changes: dict[str, Any] = {}
    if project.get("name") != PROJECT_NAME:
        changes["name"] = PROJECT_NAME
    if project.get("is_public") is True:
        changes["is_public"] = False
    current_ids = sorted(int(item["id"]) for item in current_trackers)
    if current_ids != tracker_ids:
        changes["tracker_ids"] = tracker_ids
    if changes:
        api.put(f"projects/{project['id']}.json", {"project": changes})
        project = api.get(f"projects/{PROJECT_IDENTIFIER}.json?include=trackers")["project"]
    return project


def ensure_users(
    api: Redmine, users: list[dict[str, Any]]
) -> tuple[dict[str, dict[str, Any]], list[tuple[str, str]]]:
    by_login = {str(user.get("login", "")).casefold(): user for user in users}
    result: dict[str, dict[str, Any]] = {}
    created_credentials: list[tuple[str, str]] = []
    for login, spec in TEAM.items():
        user = by_login.get(login.casefold())
        if user is None:
            temporary_password = secrets.token_hex(16)
            response = api.post(
                "users.json",
                {
                    "user": {
                        "login": login,
                        "firstname": spec["firstname"],
                        "lastname": spec["lastname"],
                        "mail": spec["mail"],
                        "password": temporary_password,
                        "must_change_passwd": True,
                    }
                },
            )
            user = response["user"]
            created_credentials.append((login, temporary_password))
            print(f"Создана учётная запись {login}; временный пароль: {temporary_password}")
        else:
            if int(user.get("status", 1)) != 1:
                raise ProvisionError(
                    f"Учётная запись {login} уже существует, но не активна; "
                    "скрипт не будет менять её статус или пароль."
                )
            print(f"Учётная запись {login} уже существует; её пароль не менялся.")
        result[login] = user
    return result, created_credentials


def ensure_memberships(
    api: Redmine,
    project: dict[str, Any],
    users: dict[str, dict[str, Any]],
    roles: list[dict[str, Any]],
) -> None:
    role_for_login: dict[str, dict[str, Any]] = {}
    for login, spec in TEAM.items():
        role_for_login[login] = find_named(roles, spec["role_aliases"], f"роль для {login}")

    memberships = api.collection(f"projects/{PROJECT_IDENTIFIER}/memberships.json", "memberships")
    by_user_id = {
        int(membership.get("user", {}).get("id", -1)): membership
        for membership in memberships
        if membership.get("user")
    }
    for login, user in users.items():
        user_id = int(user["id"])
        role_id = int(role_for_login[login]["id"])
        existing = by_user_id.get(user_id)
        if existing is None:
            api.post(
                f"projects/{PROJECT_IDENTIFIER}/memberships.json",
                {"membership": {"user_id": user_id, "role_ids": [role_id]}},
            )
            print(f"Добавлен участник {login} → {role_for_login[login]['name']}.")
            continue
        actual_role_ids = sorted(
            int(role["id"]) for role in existing.get("roles", []) if not role.get("inherited")
        )
        wanted_role_ids = [role_id]
        if actual_role_ids != wanted_role_ids:
            api.put(
                f"memberships/{existing['id']}.json",
                {"membership": {"role_ids": wanted_role_ids}},
            )
            print(f"Обновлена роль участника {login} → {role_for_login[login]['name']}.")
        else:
            print(f"Участник {login} уже состоит в проекте с нужной ролью.")


def ensure_categories(api: Redmine, items: list[BacklogItem]) -> dict[str, int]:
    categories = api.collection(f"projects/{PROJECT_IDENTIFIER}/issue_categories.json", "issue_categories")
    by_name = {normalized(str(category.get("name", ""))): category for category in categories}
    result: dict[str, int] = {}
    for name in sorted({item.category for item in items if item.category}):
        category = by_name.get(normalized(name))
        if category is None:
            category = api.post(
                f"projects/{PROJECT_IDENTIFIER}/issue_categories.json",
                {"issue_category": {"name": name}},
            )["issue_category"]
            by_name[normalized(name)] = category
            print(f"Создана категория: {name}.")
        result[name] = int(category["id"])
    return result


def get_lookup_records(api: Redmine) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    statuses = api.collection("issue_statuses.json", "issue_statuses")
    priorities = api.collection("enumerations/issue_priorities.json", "issue_priorities")
    custom_fields = api.collection("custom_fields.json", "custom_fields")
    return statuses, priorities, custom_fields


def custom_fields_for_issue(
    custom_fields: list[dict[str, Any]], item: BacklogItem
) -> tuple[list[dict[str, Any]], set[str]]:
    desired = {
        "External ID": item.external_id,
        "Depends on": "; ".join(item.dependencies),
        "Requirement": item.requirement,
    }
    values: list[dict[str, Any]] = []
    included: set[str] = set()
    for field in custom_fields:
        name = str(field.get("name", ""))
        if name in desired and field.get("customized_type") == "issue":
            values.append({"id": int(field["id"]), "value": desired[name]})
            included.add(name)
    return values, included


def existing_issue_ids(api: Redmine, project_id: int) -> dict[str, int]:
    issues: dict[str, int] = {}
    offset = 0
    while True:
        data = api.get(
            "issues.json",
            {"project_id": project_id, "status_id": "*", "limit": PAGE_SIZE, "offset": offset},
        )
        page = data.get("issues", [])
        for issue in page:
            match = ISSUE_MARKER.search(str(issue.get("description", "")))
            if match:
                issues[match.group(1)] = int(issue["id"])
        total = int(data.get("total_count", len(issues)))
        if not page or offset + len(page) >= total:
            return issues
        offset += len(page)


def issue_description(item: BacklogItem, field_names_in_payload: set[str]) -> str:
    metadata = [f"[External ID: {item.external_id}]"]
    if "External ID" not in field_names_in_payload:
        metadata.append(f"External ID: {item.external_id}")
    if "Depends on" not in field_names_in_payload:
        metadata.append(f"Depends on: {'; '.join(item.dependencies) if item.dependencies else '—'}")
    if "Requirement" not in field_names_in_payload:
        metadata.append(f"Requirement: {item.requirement}")
    return "\n".join(metadata + ["", item.description])


def ensure_issues(
    api: Redmine,
    project: dict[str, Any],
    items: list[BacklogItem],
    users: dict[str, dict[str, Any]],
    trackers: list[dict[str, Any]],
    statuses: list[dict[str, Any]],
    priorities: list[dict[str, Any]],
    categories: dict[str, int],
    custom_fields: list[dict[str, Any]],
) -> dict[str, int]:
    tracker_lookup = {
        name: int(find_named(trackers, aliases, f"трекер для «{name}»")["id"])
        for name, aliases in TRACKER_ALIASES.items()
    }
    status_lookup = {
        name: int(find_named(statuses, aliases, f"статус для «{name}»")["id"])
        for name, aliases in STATUS_ALIASES.items()
    }
    normal_priority = int(find_named(priorities, ("Normal",), "приоритет Normal")["id"])
    field_ids: dict[str, int] = {
        str(field["name"]): int(field["id"])
        for field in custom_fields
        if field.get("customized_type") == "issue" and field.get("name") in CUSTOM_FIELD_NAMES
    }
    missing_fields = sorted(set(CUSTOM_FIELD_NAMES) - set(field_ids))
    if missing_fields:
        print(
            "Поля задач не заведены через UI (метаданные будут записаны в описание): "
            + ", ".join(missing_fields)
        )

    id_by_external = existing_issue_ids(api, int(project["id"]))
    for item in items:
        if item.external_id in id_by_external:
            print(f"Задача {item.external_id} уже есть (#{id_by_external[item.external_id]}), пропуск.")
            continue
        custom_values, included = custom_fields_for_issue(custom_fields, item)
        body: dict[str, Any] = {
            "project_id": int(project["id"]),
            "tracker_id": tracker_lookup[item.tracker],
            "status_id": status_lookup[item.status],
            "priority_id": normal_priority,
            "subject": item.subject,
            "description": issue_description(item, included),
            "assigned_to_id": int(users[item.assignee]["id"]),
            "estimated_hours": item.estimated_hours,
            "category_id": categories[item.category],
        }
        if custom_values:
            body["custom_fields"] = custom_values
        response = api.post("issues.json", {"issue": body})
        issue_id = int(response["issue"]["id"])
        id_by_external[item.external_id] = issue_id
        print(f"Создана задача {item.external_id}: #{issue_id} — {item.subject}")
        time.sleep(0.05)

    for item in items:
        dependent_id = id_by_external.get(item.external_id)
        if dependent_id is None:
            raise ProvisionError(f"Не удалось найти созданную задачу {item.external_id}")
        for predecessor in item.dependencies:
            predecessor_id = id_by_external.get(predecessor)
            if predecessor_id is None:
                raise ProvisionError(f"Не удалось найти задачу-предшественник {predecessor}")
            current = api.collection(f"issues/{dependent_id}/relations.json", "relations")
            if any(
                int(relation.get("issue_to_id", -1)) == predecessor_id
                and relation.get("relation_type") == "follows"
                for relation in current
            ):
                continue
            api.post(
                f"issues/{dependent_id}/relations.json",
                {"relation": {"issue_to_id": predecessor_id, "relation_type": "follows"}},
            )
            print(f"Добавлена связь: {item.external_id} следует за {predecessor}.")
    return id_by_external


def apply(base_url: str, items: list[BacklogItem]) -> None:
    api_key = os.environ.get("REDMINE_API_KEY", "").strip()
    if not api_key:
        api_key = getpass.getpass("Redmine API key (ввод скрыт): ").strip()
    if not api_key:
        raise ProvisionError("API key пустой; настройка отменена без изменений.")

    api = Redmine(base_url, api_key)
    current = api.get("users/current.json").get("user", {})
    # Listing users requires administrator privileges. Perform this read-only
    # preflight before the first project mutation; empty status includes locked
    # and pending accounts, preventing duplicate-login attempts.
    existing_users = api.collection("users.json", "users", {"status": ""})
    trackers = api.collection("trackers.json", "trackers")
    roles = api.collection("roles.json", "roles")
    # Validate the metadata needed by the CSV before creating accounts/issues.
    for name, aliases in TRACKER_ALIASES.items():
        find_named(trackers, aliases, f"трекер для «{name}»")
    for login, spec in TEAM.items():
        find_named(roles, spec["role_aliases"], f"роль для {login}")
    statuses, priorities, custom_fields = get_lookup_records(api)
    for name, aliases in STATUS_ALIASES.items():
        find_named(statuses, aliases, f"статус для «{name}»")
    find_named(priorities, ("Normal",), "приоритет Normal")

    project = create_or_get_project(api, trackers)
    print(f"Проект готов: {project['name']} ({PROJECT_IDENTIFIER}), id={project['id']}.")
    users, _created = ensure_users(api, existing_users)
    ensure_memberships(api, project, users, roles)
    categories = ensure_categories(api, items)
    issues = ensure_issues(
        api,
        project,
        items,
        users,
        trackers,
        statuses,
        priorities,
        categories,
        custom_fields,
    )
    print(
        f"Готово: пользователь {current.get('login', 'API key')}; "
        f"участников {len(users)}, задач из backlog {len(issues)}."
    )
    print("Проверьте Redmine в браузере и сохраните снимки для отчёта ЛР №2.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default=os.environ.get("REDMINE_URL", "http://127.0.0.1:8085"),
        help="адрес Redmine (по умолчанию %(default)s)",
    )
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="путь к backlog.csv")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="только проверить CSV; это режим по умолчанию",
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="создать/добавить данные в Redmine через REST API",
    )
    args = parser.parse_args()

    try:
        items = read_backlog(args.csv)
        print(f"CSV проверен: {len(items)} задач, {len({i.category for i in items})} категорий.")
        print("Распределение задач:")
        for login in TEAM:
            count = sum(item.assignee == login for item in items)
            print(f"  {login}: {count}")
        if not args.apply:
            print("Проверка завершена без подключения к Redmine и без изменений.")
            print("Для применения запустите: python3 provision_redmine.py --apply")
            return 0
        apply(args.base_url, items)
        return 0
    except (ProvisionError, KeyError, ValueError) as exc:
        print(f"Ошибка: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Отменено пользователем. Уже отправленные API-запросы не откатываются; повторный запуск безопасно пропустит задачи с маркерами SM-XX.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
