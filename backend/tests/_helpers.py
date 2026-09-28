"""Shared helpers for API tests: bring a session up to the finalize gate.

The gate (test_plan_service.MIN_READINGS) requires, for the default plan:
5 weighing loads, 4 eccentricity positions, 10 repeatability readings,
5 tare steps, creep checkpoints 1..4 and 1 zero check, plus a fully
resolved checklist and start/end temperatures. These helpers post exactly
that with PASSING values for the standard test instrument (Class III,
Max 15 kg, e = 0.005 kg): L = 5 kg, I = 5 kg -> E = +0.5e = 0.0025 kg,
MPE at 1000e = 1.0e = 0.005 kg.
"""

from __future__ import annotations

from typing import Any

#: (test_type, position, count) posted by ``add_required_readings``.
REQUIRED_READINGS: tuple[tuple[str, tuple[str | None, ...]], ...] = (
    ("weighing_performance", (None,) * 5),
    ("eccentricity", ("1", "2", "3", "4")),
    ("repeatability", (None,) * 10),
    ("tare", (None,) * 5),
    ("creep", ("1", "2", "3", "4")),
    ("zero_check", (None,)),
)


def add_required_readings(
    client: Any,
    headers: dict[str, str],
    session_id: str,
    *,
    applied_load: str = "5",
    indication: str = "5",
    seq_start: int = 100,
    skip: tuple[str, ...] = (),
) -> None:
    """Post the minimum passing readings for every core test."""
    for test_type, positions in REQUIRED_READINGS:
        if test_type in skip:
            continue
        for i, position in enumerate(positions):
            r = client.post(
                f"/api/v1/sessions/{session_id}/observations",
                headers=headers,
                json={
                    "test_type": test_type,
                    "position": position,
                    "sequence_no": seq_start + i,
                    "applied_load": applied_load,
                    "indication": indication,
                },
            )
            assert r.status_code == 201, r.text


def pass_checklist(client: Any, headers: dict[str, str], session_id: str) -> None:
    """Mark every checklist item PASSED."""
    items = client.get(f"/api/v1/sessions/{session_id}/checklist", headers=headers).json()["items"]
    for item in items:
        r = client.put(
            f"/api/v1/sessions/{session_id}/checklist/items",
            headers=headers,
            json={"clause": item["clause"], "item_key": item["item_key"], "outcome": "PASSED"},
        )
        assert r.status_code == 200, r.text


def set_end_temperature(client: Any, headers: dict[str, str], session_id: str, value: str = "22.5") -> None:
    r = client.patch(f"/api/v1/sessions/{session_id}", headers=headers, json={"end_temp_c": value})
    assert r.status_code == 200, r.text


def make_ready(client: Any, headers: dict[str, str], session_id: str, **kwargs: Any) -> None:
    """Everything the finalize gate needs (session must have a start temp)."""
    add_required_readings(client, headers, session_id, **kwargs)
    pass_checklist(client, headers, session_id)
    set_end_temperature(client, headers, session_id)
