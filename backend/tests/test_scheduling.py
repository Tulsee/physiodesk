"""The slot derivation engine.

These are the pure functions from `services/scheduling.py`, tested without a
database. Slot derivation is the piece most likely to be subtly wrong, so the
edge cases are enumerated rather than sampled.
"""

import datetime as dt

import pytest

from app.models import Appointment, ScheduleException, Therapist
from app.services.scheduling import (
    find_conflict,
    generate_slots,
    is_within_working_hours,
    overlaps,
    working_window,
)

MONDAY = dt.date(2026, 9, 21)
SATURDAY = dt.date(2026, 9, 26)
T = dt.time


@pytest.fixture
def therapist() -> Therapist:
    return Therapist(
        name="Dr. Meera Rao",
        specialty="Sports",
        work_days=[0, 1, 2, 3, 4],
        start_time=T(9),
        end_time=T(17),
        slot_minutes=45,
    )


class TestWorkingWindow:
    def test_working_day_uses_default_hours(self, therapist):
        assert working_window(therapist, MONDAY, None) == (T(9), T(17))

    def test_non_working_day_has_no_window(self, therapist):
        assert working_window(therapist, SATURDAY, None) is None

    def test_is_off_override_beats_a_working_day(self, therapist):
        assert working_window(therapist, MONDAY, ScheduleException(is_off=True)) is None

    def test_custom_hours_replace_the_default(self, therapist):
        override = ScheduleException(is_off=False, custom_start=T(12), custom_end=T(16))
        assert working_window(therapist, MONDAY, override) == (T(12), T(16))

    def test_custom_hours_turn_a_day_off_into_a_working_day(self, therapist):
        """The case most easily missed: an override adds hours to a Saturday."""
        override = ScheduleException(is_off=False, custom_start=T(10), custom_end=T(13))
        assert working_window(therapist, SATURDAY, override) == (T(10), T(13))

    def test_is_off_wins_over_stale_custom_hours(self, therapist):
        override = ScheduleException(is_off=True, custom_start=T(9), custom_end=T(12))
        assert working_window(therapist, MONDAY, override) is None


class TestGenerateSlots:
    def test_divides_the_window_evenly(self):
        slots = generate_slots(T(9), T(17), 45)
        assert len(slots) == 10
        assert (slots[0].start, slots[0].end) == (T(9), T(9, 45))

    def test_each_slot_starts_where_the_last_ended(self):
        slots = generate_slots(T(9), T(12), 45)
        assert all(a.end == b.start for a, b in zip(slots, slots[1:]))

    def test_never_runs_past_the_window(self):
        assert generate_slots(T(9), T(17), 45)[-1].end <= T(17)

    def test_trailing_remainder_is_dropped_not_emitted_short(self):
        """A 5-minute tail is not a bookable 45-minute appointment."""
        assert generate_slots(T(9), T(9, 50), 45)[-1].end == T(9, 45)

    def test_window_shorter_than_one_slot_yields_nothing(self):
        assert generate_slots(T(9), T(9, 20), 45) == []

    def test_exact_fit(self):
        assert len(generate_slots(T(9), T(10, 30), 45)) == 2

    def test_zero_slot_length_is_rejected(self):
        with pytest.raises(ValueError):
            generate_slots(T(9), T(17), 0)


class TestOverlaps:
    def test_back_to_back_do_not_overlap(self):
        """Half-open intervals: 09:00-09:45 leaves 09:45 free."""
        assert overlaps(T(9), 45, T(9, 45), 45) is False

    def test_identical_windows_overlap(self):
        assert overlaps(T(9), 45, T(9), 45) is True

    def test_partial_overlap(self):
        assert overlaps(T(9), 45, T(9, 30), 45) is True

    def test_long_appointment_covers_a_later_slot(self):
        assert overlaps(T(10, 30), 45, T(9), 120) is True

    def test_disjoint_windows(self):
        assert overlaps(T(9), 45, T(14), 45) is False


class TestFindConflict:
    def _appt(self, id_, time, minutes=45, status="scheduled"):
        return Appointment(
            id=id_, patient_id=1, therapist_id=1, date=MONDAY,
            time=time, duration_minutes=minutes, status=status,
        )

    def test_finds_an_overlapping_appointment(self):
        existing = [self._appt(1, T(9))]
        assert find_conflict(existing, T(9, 15), 45) is not None

    def test_ignores_a_cancelled_appointment(self):
        """Cancelling frees the slot, so it can be rebooked."""
        existing = [self._appt(1, T(9), status="cancelled")]
        assert find_conflict(existing, T(9), 45) is None

    def test_a_no_show_still_holds_its_slot(self):
        existing = [self._appt(1, T(9), status="no_show")]
        assert find_conflict(existing, T(9), 45) is not None

    def test_exclude_id_lets_an_appointment_stay_put(self):
        """Without this, rescheduling would always collide with itself."""
        existing = [self._appt(7, T(9))]
        assert find_conflict(existing, T(9), 45, exclude_id=7) is None


class TestIsWithinWorkingHours:
    def test_a_booking_inside_the_window_fits(self, therapist):
        assert is_within_working_hours(therapist, MONDAY, None, T(9), 45) is True

    def test_a_booking_before_opening_does_not(self, therapist):
        assert is_within_working_hours(therapist, MONDAY, None, T(8), 45) is False

    def test_a_booking_running_past_closing_does_not(self, therapist):
        """Starts on a valid boundary, but 16:30 + 45 minutes exceeds 17:00."""
        assert is_within_working_hours(therapist, MONDAY, None, T(16, 30), 45) is False

    def test_nothing_fits_on_a_non_working_day(self, therapist):
        assert is_within_working_hours(therapist, SATURDAY, None, T(9), 45) is False
