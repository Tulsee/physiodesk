"""Server-side search, filtering and pagination.

The brief bans client-side-only filtering, so these assert the server actually
narrows the result set and reports an accurate total.
"""

import datetime as dt

import pytest

from app.models import Patient, Therapist

MONDAY = dt.date(2026, 9, 21)


@pytest.fixture
def roster(db, therapist):
    """A second therapist plus a spread of patients across both and all statuses."""
    other = Therapist(
        name="Dr. Sita K.C.",
        specialty="Neurological Rehabilitation",
        work_days=[0, 2, 4],
        start_time=dt.time(10, 0),
        end_time=dt.time(16, 0),
        slot_minutes=60,
    )
    db.add(other)
    db.flush()

    rows = [
        Patient(name="Anil Shrestha", therapist_id=therapist.id, status="active",
                condition="ACL rehab", phone="9801111111"),
        Patient(name="Bina Thapa", therapist_id=therapist.id, status="active",
                condition="Frozen shoulder", phone="9802222222"),
        Patient(name="Chandra Lama", therapist_id=other.id, status="on_hold",
                condition="Sciatica", phone="9803333333"),
        Patient(name="Deepak Rai", therapist_id=other.id, status="discharged",
                condition="Post-op knee", phone="9804444444"),
    ]
    db.add_all(rows)
    db.flush()
    return {"therapist": therapist, "other": other, "patients": rows}


class TestPatientFilters:
    def test_unfiltered_returns_everyone(self, auth_client, roster):
        assert auth_client.get("/patients").json()["total"] == 4

    def test_search_matches_a_name(self, auth_client, roster):
        body = auth_client.get("/patients", params={"search": "anil"}).json()
        assert body["total"] == 1
        assert body["items"][0]["name"] == "Anil Shrestha"

    def test_search_is_case_insensitive(self, auth_client, roster):
        assert auth_client.get("/patients", params={"search": "ANIL"}).json()["total"] == 1

    def test_search_matches_a_condition(self, auth_client, roster):
        assert auth_client.get("/patients", params={"search": "shoulder"}).json()["total"] == 1

    def test_search_matches_a_phone_number(self, auth_client, roster):
        assert auth_client.get("/patients", params={"search": "9803333333"}).json()["total"] == 1

    def test_a_search_with_no_matches_returns_an_empty_page(self, auth_client, roster):
        body = auth_client.get("/patients", params={"search": "zzzznothing"}).json()
        assert body["total"] == 0
        assert body["items"] == []
        assert body["pages"] == 1  # never zero, so the UI reads "page 1 of 1"

    def test_filtering_by_therapist(self, auth_client, roster):
        body = auth_client.get(
            "/patients", params={"therapist_id": roster["other"].id}
        ).json()
        assert body["total"] == 2

    @pytest.mark.parametrize(
        "status,expected", [("active", 2), ("on_hold", 1), ("discharged", 1)]
    )
    def test_filtering_by_status(self, auth_client, roster, status, expected):
        assert auth_client.get("/patients", params={"status": status}).json()["total"] == expected

    def test_filters_combine(self, auth_client, roster):
        body = auth_client.get(
            "/patients",
            params={"status": "active", "therapist_id": roster["therapist"].id},
        ).json()
        assert body["total"] == 2

    def test_an_unknown_status_is_a_validation_error(self, auth_client, roster):
        assert auth_client.get("/patients", params={"status": "nonsense"}).status_code == 422

    def test_results_are_ordered_by_name(self, auth_client, roster):
        names = [p["name"] for p in auth_client.get("/patients").json()["items"]]
        assert names == sorted(names)


class TestPagination:
    def test_the_envelope_has_a_consistent_shape(self, auth_client, roster):
        body = auth_client.get("/patients").json()
        assert set(body) == {"items", "total", "page", "page_size", "pages"}

    def test_page_size_limits_the_rows_returned(self, auth_client, roster):
        body = auth_client.get("/patients", params={"page_size": 2}).json()
        assert len(body["items"]) == 2
        assert body["pages"] == 2

    def test_total_counts_all_matches_not_just_this_page(self, auth_client, roster):
        assert auth_client.get("/patients", params={"page_size": 1}).json()["total"] == 4

    def test_total_respects_the_filters(self, auth_client, roster):
        body = auth_client.get(
            "/patients", params={"status": "active", "page_size": 1}
        ).json()
        assert body["total"] == 2
        assert len(body["items"]) == 1

    def test_paging_walks_the_whole_set_without_repeats(self, auth_client, roster):
        first = auth_client.get("/patients", params={"page": 1, "page_size": 2}).json()["items"]
        second = auth_client.get("/patients", params={"page": 2, "page_size": 2}).json()["items"]
        ids = [p["id"] for p in first + second]
        assert len(ids) == len(set(ids)) == 4

    def test_a_page_beyond_the_end_is_empty_rather_than_an_error(self, auth_client, roster):
        body = auth_client.get("/patients", params={"page": 99}).json()
        assert body["items"] == []
        assert body["total"] == 4

    def test_page_zero_is_rejected(self, auth_client, roster):
        assert auth_client.get("/patients", params={"page": 0}).status_code == 422

    def test_an_oversized_page_is_rejected(self, auth_client, roster):
        """Capped so a client cannot pull the whole table in one request."""
        assert auth_client.get("/patients", params={"page_size": 5000}).status_code == 422


class TestTherapistFilters:
    def test_search_matches_a_specialty(self, auth_client, roster):
        body = auth_client.get("/therapists", params={"search": "neuro"}).json()
        assert body["total"] == 1

    def test_specialty_filter_is_an_exact_match(self, auth_client, roster):
        body = auth_client.get(
            "/therapists", params={"specialty": "Sports Rehabilitation"}
        ).json()
        assert body["total"] == 1

    def test_the_specialties_endpoint_lists_them_distinctly(self, auth_client, roster):
        assert auth_client.get("/therapists/specialties").json() == [
            "Neurological Rehabilitation",
            "Sports Rehabilitation",
        ]
