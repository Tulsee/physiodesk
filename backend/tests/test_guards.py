"""Delete guards and the conflict rules that protect referential integrity."""

import datetime as dt
from decimal import Decimal

from app.models import Appointment, ClinicalNote, Invoice, Patient, Payment, Therapist

MONDAY = dt.date(2026, 9, 21)


class TestTherapistDeleteGuard:
    def test_a_therapist_with_no_patients_can_be_deleted(self, auth_client, db, therapist):
        assert auth_client.delete(f"/therapists/{therapist.id}").status_code == 204

    def test_a_therapist_with_patients_cannot(self, auth_client, therapist, patient):
        response = auth_client.delete(f"/therapists/{therapist.id}")
        assert response.status_code == 409

    def test_the_refusal_says_how_to_proceed(self, auth_client, therapist, patient):
        detail = auth_client.delete(f"/therapists/{therapist.id}").json()["detail"]
        assert "1 patient(s)" in detail
        assert "Reassign" in detail

    def test_deleting_works_once_the_patient_is_reassigned(
        self, auth_client, db, therapist, patient
    ):
        patient.therapist_id = None
        db.flush()
        assert auth_client.delete(f"/therapists/{therapist.id}").status_code == 204

    def test_deactivating_is_always_available(self, auth_client, therapist, patient):
        """The alternative the 409 suggests must actually work."""
        response = auth_client.patch(f"/therapists/{therapist.id}", json={"is_active": False})
        assert response.status_code == 200
        assert response.json()["is_active"] is False


class TestInvoiceDeleteGuard:
    def test_an_unpaid_invoice_can_be_deleted(self, auth_client, invoice):
        assert auth_client.delete(f"/invoices/{invoice.id}").status_code == 204

    def test_an_invoice_with_payments_cannot(self, auth_client, db, invoice):
        db.add(
            Payment(
                invoice_id=invoice.id, date=MONDAY, amount=Decimal("100.00"), method="cash"
            )
        )
        db.flush()
        response = auth_client.delete(f"/invoices/{invoice.id}")
        assert response.status_code == 409
        assert "payment(s) recorded" in response.json()["detail"]

    def test_reducing_the_total_below_what_was_paid_is_refused(self, auth_client, db, invoice):
        db.add(
            Payment(
                invoice_id=invoice.id, date=MONDAY, amount=Decimal("800.00"), method="cash"
            )
        )
        invoice.paid_amount = Decimal("800.00")
        db.flush()
        response = auth_client.patch(f"/invoices/{invoice.id}", json={"amount": "100.00"})
        assert response.status_code == 409
        assert "Refund the difference" in response.json()["detail"]


class TestPatientDeleteCascades:
    def test_deleting_a_patient_removes_their_records(self, auth_client, db, patient):
        """Notes, invoices and appointments mean nothing without the patient."""
        db.add(ClinicalNote(patient_id=patient.id, date=MONDAY, pain_score=5))
        db.add(
            Invoice(
                patient_id=patient.id,
                service="Session",
                date=MONDAY,
                amount=Decimal("100.00"),
            )
        )
        db.flush()

        assert auth_client.delete(f"/patients/{patient.id}").status_code == 204
        assert db.query(ClinicalNote).filter_by(patient_id=patient.id).count() == 0
        assert db.query(Invoice).filter_by(patient_id=patient.id).count() == 0

    def test_deleting_a_patient_leaves_the_therapist_alone(
        self, auth_client, db, therapist, patient
    ):
        auth_client.delete(f"/patients/{patient.id}")
        assert db.get(Therapist, therapist.id) is not None


class TestBookingConflicts:
    def _book(self, client, patient, therapist, time, **extra):
        return client.post(
            "/appointments",
            json={
                "patient_id": patient.id,
                "therapist_id": therapist.id,
                "date": MONDAY.isoformat(),
                "time": time,
                **extra,
            },
        )

    def test_a_free_slot_can_be_booked(self, auth_client, patient, therapist):
        assert self._book(auth_client, patient, therapist, "09:00:00").status_code == 201

    def test_the_same_slot_cannot_be_booked_twice(self, auth_client, patient, therapist):
        self._book(auth_client, patient, therapist, "09:00:00")
        response = self._book(auth_client, patient, therapist, "09:00:00")
        assert response.status_code == 409
        assert "already has an appointment" in response.json()["detail"]

    def test_an_overlapping_booking_is_refused(self, auth_client, patient, therapist):
        self._book(auth_client, patient, therapist, "09:00:00")
        assert self._book(auth_client, patient, therapist, "09:30:00").status_code == 409

    def test_a_back_to_back_booking_is_allowed(self, auth_client, patient, therapist):
        self._book(auth_client, patient, therapist, "09:00:00")
        assert self._book(auth_client, patient, therapist, "09:45:00").status_code == 201

    def test_booking_outside_working_hours_is_refused(self, auth_client, patient, therapist):
        response = self._book(auth_client, patient, therapist, "08:00:00")
        assert response.status_code == 409

    def test_a_booking_running_past_closing_is_refused(self, auth_client, patient, therapist):
        """Starts inside the 09:00-12:00 window but would end at 12:30."""
        response = self._book(
            auth_client, patient, therapist, "11:30:00", duration_minutes=60
        )
        assert response.status_code == 409

    def test_booking_on_a_non_working_day_is_refused(self, auth_client, patient, therapist):
        response = auth_client.post(
            "/appointments",
            json={
                "patient_id": patient.id,
                "therapist_id": therapist.id,
                "date": "2026-09-26",  # Saturday
                "time": "09:00:00",
            },
        )
        assert response.status_code == 409
        assert "not working" in response.json()["detail"]

    def test_cancelling_frees_the_slot_for_rebooking(self, auth_client, patient, therapist):
        booked = self._book(auth_client, patient, therapist, "09:00:00").json()
        auth_client.patch(f"/appointments/{booked['id']}", json={"status": "cancelled"})
        assert self._book(auth_client, patient, therapist, "09:00:00").status_code == 201

    def test_an_appointment_does_not_conflict_with_itself(self, auth_client, patient, therapist):
        booked = self._book(auth_client, patient, therapist, "09:00:00").json()
        response = auth_client.patch(
            f"/appointments/{booked['id']}", json={"time": "09:00:00"}
        )
        assert response.status_code == 200

    def test_an_unknown_patient_is_a_validation_error(self, auth_client, therapist):
        response = auth_client.post(
            "/appointments",
            json={
                "patient_id": 999999,
                "therapist_id": therapist.id,
                "date": MONDAY.isoformat(),
                "time": "09:00:00",
            },
        )
        assert response.status_code == 422


class TestScheduleGridReflectsBookings:
    def test_a_booked_slot_is_marked_and_carries_its_appointment(
        self, auth_client, db, patient, therapist
    ):
        db.add(
            Appointment(
                patient_id=patient.id,
                therapist_id=therapist.id,
                date=MONDAY,
                time=dt.time(9, 0),
                duration_minutes=45,
            )
        )
        db.flush()

        grid = auth_client.get("/schedule", params={"date": MONDAY.isoformat()}).json()
        column = next(c for c in grid["therapists"] if c["therapist_id"] == therapist.id)

        assert len(column["slots"]) == 4  # 09:00-12:00 in 45-minute steps
        assert column["slots"][0]["is_booked"] is True
        assert column["slots"][0]["appointment"]["patient_name"] == patient.name
        assert column["slots"][1]["is_booked"] is False
