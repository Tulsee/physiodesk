"""Demo data for PhysioDesk.

    python -m app.seed            # seed an empty database
    python -m app.seed --reset    # wipe the domain tables and reseed

Idempotent: seeding an already-seeded database does nothing unless --reset is
passed, so it is safe to run twice.

Dates are generated relative to today, so the dashboard and schedule always have
something to show no matter when the script is run. Appointments are placed on
real derived slots via the scheduling service, which means the seeded data obeys
exactly the same rules the API enforces — no row here could not have been
created through an endpoint.
"""

import argparse
import datetime as dt
import random
import sys
from decimal import Decimal

from sqlalchemy import func, select, text

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    Appointment,
    ClinicalNote,
    Invoice,
    Notification,
    Patient,
    Payment,
    ScheduleException,
    Therapist,
    User,
)
from app.models.enums import (
    AppointmentStatus,
    AppointmentType,
    Gender,
    NotificationChannel,
    NotificationStatus,
    NotificationType,
    PatientStatus,
    PaymentMethod,
)
from app.services import billing, scheduling

RNG = random.Random(20260922)

TODAY = dt.date.today()

DOMAIN_TABLES = (
    "payments",
    "invoices",
    "appointments",
    "clinical_notes",
    "report_files",
    "notifications",
    "schedule_exceptions",
    "patients",
    "therapists",
)

MON, TUE, WED, THU, FRI, SAT = 0, 1, 2, 3, 4, 5

THERAPISTS = [
    {
        "name": "Dr. Meera Rao",
        "specialty": "Sports Rehabilitation",
        "email": "meera.rao@physiodesk.example.com",
        "phone": "9801100101",
        "qualifications": "BPT, MPT (Sports Medicine)",
        "experience_years": 11,
        "bio": "Works with athletes on post-operative knee and shoulder recovery.",
        "work_days": [MON, TUE, WED, THU, FRI],
        "start_time": dt.time(9, 0),
        "end_time": dt.time(17, 0),
        "slot_minutes": 45,
    },
    {
        "name": "Dr. Sita K.C.",
        "specialty": "Neurological Rehabilitation",
        "email": "sita.kc@physiodesk.example.com",
        "phone": "9801100102",
        "qualifications": "BPT, MPT (Neurology)",
        "experience_years": 8,
        "bio": "Stroke and spinal cord injury rehabilitation.",
        # Deliberately different: three days a week, hour-long slots.
        "work_days": [MON, WED, FRI],
        "start_time": dt.time(10, 0),
        "end_time": dt.time(16, 0),
        "slot_minutes": 60,
    },
    {
        "name": "Dr. Rajesh Gurung",
        "specialty": "Orthopaedic Physiotherapy",
        "email": "rajesh.gurung@physiodesk.example.com",
        "phone": "9801100103",
        "qualifications": "BPT, Certified Manual Therapist",
        "experience_years": 15,
        "bio": "Spine and joint conditions, with a focus on manual therapy.",
        "work_days": [TUE, THU, SAT],
        "start_time": dt.time(8, 30),
        "end_time": dt.time(14, 30),
        "slot_minutes": 30,
    },
    {
        "name": "Dr. Anita Shrestha",
        "specialty": "Paediatric Physiotherapy",
        "email": "anita.shrestha@physiodesk.example.com",
        "phone": "9801100104",
        "qualifications": "BPT, MPT (Paediatrics)",
        "experience_years": 6,
        "bio": "Developmental delay and childhood motor conditions.",
        # Afternoons only.
        "work_days": [MON, TUE, WED, THU],
        "start_time": dt.time(13, 0),
        "end_time": dt.time(18, 0),
        "slot_minutes": 45,
    },
]

PATIENTS = [
    (
        "Anil Shrestha",
        34,
        Gender.MALE,
        "ACL reconstruction rehab",
        "12-session sports package",
        12,
        PatientStatus.ACTIVE,
    ),
    (
        "Bina Thapa",
        47,
        Gender.FEMALE,
        "Frozen shoulder",
        "10-session package",
        10,
        PatientStatus.ACTIVE,
    ),
    (
        "Chandra Lama",
        58,
        Gender.MALE,
        "Lumbar disc herniation",
        "8-session package",
        8,
        PatientStatus.ACTIVE,
    ),
    (
        "Deepak Rai",
        29,
        Gender.MALE,
        "Post-op knee arthroscopy",
        "12-session sports package",
        12,
        PatientStatus.ACTIVE,
    ),
    (
        "Esha Gurung",
        41,
        Gender.FEMALE,
        "Chronic lower back pain",
        "10-session package",
        10,
        PatientStatus.ACTIVE,
    ),
    (
        "Gita Maharjan",
        63,
        Gender.FEMALE,
        "Post-stroke hemiparesis",
        "20-session neuro package",
        20,
        PatientStatus.ACTIVE,
    ),
    (
        "Hari Bahadur",
        52,
        Gender.MALE,
        "Cervical spondylosis",
        "8-session package",
        8,
        PatientStatus.ACTIVE,
    ),
    (
        "Ishwar Tamang",
        37,
        Gender.MALE,
        "Rotator cuff tendinopathy",
        "10-session package",
        10,
        PatientStatus.ACTIVE,
    ),
    (
        "Junu Karki",
        26,
        Gender.FEMALE,
        "Ankle sprain grade II",
        "6-session package",
        6,
        PatientStatus.ACTIVE,
    ),
    (
        "Kiran Adhikari",
        8,
        Gender.MALE,
        "Developmental coordination delay",
        "16-session paediatric package",
        16,
        PatientStatus.ACTIVE,
    ),
    (
        "Laxmi Poudel",
        45,
        Gender.FEMALE,
        "Plantar fasciitis",
        "6-session package",
        6,
        PatientStatus.ON_HOLD,
    ),
    (
        "Manish Joshi",
        31,
        Gender.MALE,
        "Tennis elbow",
        "8-session package",
        8,
        PatientStatus.ON_HOLD,
    ),
    (
        "Nisha Basnet",
        55,
        Gender.FEMALE,
        "Knee osteoarthritis",
        "12-session package",
        12,
        PatientStatus.DISCHARGED,
    ),
    (
        "Om Prakash Yadav",
        68,
        Gender.MALE,
        "Total hip replacement rehab",
        "16-session package",
        16,
        PatientStatus.DISCHARGED,
    ),
    (
        "Puja Sharma",
        23,
        Gender.FEMALE,
        "Patellofemoral pain syndrome",
        "8-session package",
        8,
        PatientStatus.DISCHARGED,
    ),
]

SUBJECTIVE = [
    "Reports pain easing since the last session; sleeping better.",
    "Stiffness in the morning, settles within an hour of moving.",
    "Able to climb stairs without support for the first time.",
    "Discomfort after a long day at work, but no sharp pain.",
    "Feels stronger; managed a short walk without the stick.",
    "Some soreness after last session's exercises, settled overnight.",
]
OBJECTIVE = [
    "Flexion improved; no swelling on palpation.",
    "Gait symmetrical over 10 m. Mild guarding on end-range.",
    "Range of motion measured and recorded; no crepitus.",
    "Muscle bulk improving. Single-leg stance held 15 s.",
    "Tenderness reduced on palpation of the joint line.",
]
TREATMENTS = [
    "Manual therapy, soft tissue release, guided mobilisation.",
    "Ultrasound therapy followed by supervised strengthening.",
    "Progressive resistance exercises and gait re-education.",
    "Dry needling to the trigger points, then stretching.",
    "Hydrotherapy session with balance work.",
]
EXERCISES = [
    "Quadriceps sets 3x15, straight leg raises 3x10, twice daily.",
    "Pendulum swings and wall crawls, 3 sets each, daily.",
    "Core bracing 3x30 s, bird-dog 3x10 each side.",
    "Calf raises 3x15, towel stretch 3x30 s before standing.",
    "Scapular retraction 3x12, resistance band rows 3x12.",
]
MILESTONES = [
    "Full weight bearing achieved",
    "Pain-free range restored",
    "Returned to light jogging",
    "Independent stair climbing",
    "Discharged to home exercise programme",
    "Returned to work duties",
]


def already_seeded(db) -> bool:
    return db.execute(select(func.count()).select_from(Therapist)).scalar_one() > 0


def wipe(db) -> None:
    """Truncate the domain tables. Users are left alone — the login survives."""
    db.execute(text(f"TRUNCATE {', '.join(DOMAIN_TABLES)} RESTART IDENTITY CASCADE"))
    db.commit()


def seed_user(db) -> User:
    """The front-desk login. Created if missing, never overwritten."""
    user = db.execute(
        select(User).where(User.username == settings.seed_admin_username)
    ).scalar_one_or_none()
    if user:
        return user

    user = User(
        username=settings.seed_admin_username,
        full_name="Front Desk",
        hashed_password=hash_password(settings.seed_admin_password),
    )
    db.add(user)
    db.commit()
    return user


def seed_therapists(db) -> list[Therapist]:
    rows = [Therapist(**data) for data in THERAPISTS]
    db.add_all(rows)
    db.flush()

    db.add_all(
        [
            ScheduleException(
                therapist_id=rows[0].id,
                date=TODAY + dt.timedelta(days=3),
                is_off=True,
                reason="Conference",
            ),
            ScheduleException(
                therapist_id=rows[1].id,
                date=TODAY + dt.timedelta(days=1),
                is_off=False,
                custom_start=dt.time(12, 0),
                custom_end=dt.time(16, 0),
                reason="Late start (hospital rounds)",
            ),
            ScheduleException(
                therapist_id=rows[3].id,
                date=_next_weekday(FRI),
                is_off=False,
                custom_start=dt.time(9, 0),
                custom_end=dt.time(12, 0),
                reason="Extra clinic to clear the waiting list",
            ),
        ]
    )
    db.commit()
    return rows


def _next_weekday(weekday: int, after: dt.date | None = None) -> dt.date:
    """The next date falling on `weekday`, at or after `after` (default today)."""
    start = after or TODAY
    delta = (weekday - start.weekday()) % 7
    return start + dt.timedelta(days=delta)


def seed_patients(db, therapists: list[Therapist]) -> list[Patient]:
    by_condition = {
        "Post-stroke hemiparesis": therapists[1],
        "Developmental coordination delay": therapists[3],
        "Lumbar disc herniation": therapists[2],
        "Cervical spondylosis": therapists[2],
        "Total hip replacement rehab": therapists[2],
    }

    rows: list[Patient] = []
    for idx, (name, age, gender, condition, package, total, status) in enumerate(
        PATIENTS
    ):
        therapist = by_condition.get(condition, therapists[idx % 2])
        used = {
            PatientStatus.DISCHARGED: total,
            PatientStatus.ON_HOLD: max(1, total // 3),
        }.get(status, RNG.randint(2, max(3, total - 2)))

        slug = name.lower().split()[0]
        rows.append(
            Patient(
                name=name,
                age=age,
                gender=gender,
                phone=f"980{1200000 + idx * 137:07d}",
                email=f"{slug}@example.com",
                address=f"Ward {RNG.randint(1, 32)}, Kathmandu",
                condition=condition,
                therapist_id=therapist.id,
                status=status,
                package=package,
                sessions_total=total,
                sessions_used=used,
            )
        )

    db.add_all(rows)
    db.commit()
    return rows


def _place(db, therapist: Therapist, on_date: dt.date, taken: set) -> dt.time | None:
    """First free slot for a therapist on a date, or None.

    Uses the real slot engine, so a seeded appointment can never land outside
    working hours or on top of another one.
    """
    exception = scheduling.get_exception(db, therapist.id, on_date)
    window = scheduling.working_window(therapist, on_date, exception)
    if window is None:
        return None

    for slot in scheduling.generate_slots(window[0], window[1], therapist.slot_minutes):
        if (therapist.id, on_date, slot.start) not in taken:
            taken.add((therapist.id, on_date, slot.start))
            return slot.start
    return None


def seed_appointments(
    db, patients: list[Patient], therapists: list[Therapist]
) -> list[Appointment]:
    by_id = {t.id: t for t in therapists}
    taken: set = set()
    rows: list[Appointment] = []

    for offset in range(28, 0, -1):
        day = TODAY - dt.timedelta(days=offset)
        for patient in RNG.sample(patients, k=RNG.randint(1, 3)):
            therapist = by_id[patient.therapist_id]
            time = _place(db, therapist, day, taken)
            if time is None:
                continue

            # Deterministic rather than a random roll: relying on chance meant a
            # run could produce no no-shows at all, leaving a status unrepresented.
            position = len(rows)
            if position % 11 == 5:
                appt_status = AppointmentStatus.NO_SHOW
            elif position % 7 == 3:
                appt_status = AppointmentStatus.CANCELLED
            else:
                appt_status = AppointmentStatus.COMPLETED

            rows.append(
                Appointment(
                    patient_id=patient.id,
                    therapist_id=therapist.id,
                    date=day,
                    time=time,
                    duration_minutes=therapist.slot_minutes,
                    type=AppointmentType.THERAPY_SESSION,
                    status=appt_status,
                    payment_method=RNG.choice(list(PaymentMethod)),
                    outcome_note=(
                        RNG.choice(
                            [
                                "Session completed as planned.",
                                "Progressed the exercise load.",
                                "Patient tolerated the session well.",
                            ]
                        )
                        if appt_status is AppointmentStatus.COMPLETED
                        else None
                    ),
                    cancellation_reason=(
                        "Patient called to reschedule"
                        if appt_status is AppointmentStatus.CANCELLED
                        else None
                    ),
                )
            )

    active = [p for p in patients if p.status is PatientStatus.ACTIVE]

    for i, patient in enumerate(RNG.sample(active, k=min(6, len(active)))):
        therapist = by_id[patient.therapist_id]
        time = _place(db, therapist, TODAY, taken)
        if time is None:
            continue
        rows.append(
            Appointment(
                patient_id=patient.id,
                therapist_id=therapist.id,
                date=TODAY,
                time=time,
                duration_minutes=therapist.slot_minutes,
                type=AppointmentType.THERAPY_SESSION,
                status=(
                    AppointmentStatus.COMPLETED
                    if i < 3
                    else AppointmentStatus.SCHEDULED
                ),
                payment_method=PaymentMethod.CASH,
                outcome_note="Session completed as planned." if i < 3 else None,
            )
        )

    for offset in range(1, 15):
        day = TODAY + dt.timedelta(days=offset)
        for patient in RNG.sample(active, k=RNG.randint(1, 3)):
            therapist = by_id[patient.therapist_id]
            time = _place(db, therapist, day, taken)
            if time is None:
                continue
            rows.append(
                Appointment(
                    patient_id=patient.id,
                    therapist_id=therapist.id,
                    date=day,
                    time=time,
                    duration_minutes=therapist.slot_minutes,
                    type=RNG.choice(
                        [AppointmentType.THERAPY_SESSION, AppointmentType.REVIEW]
                    ),
                    status=AppointmentStatus.SCHEDULED,
                )
            )

    db.add_all(rows)
    db.commit()
    return rows


def seed_clinical_notes(db, patients: list[Patient]) -> list[ClinicalNote]:
    """Multi-session histories with scores that trend, so the charts show a curve."""
    rows: list[ClinicalNote] = []

    for patient in patients:
        sessions = max(3, min(8, patient.sessions_used))
        pain_start = RNG.randint(7, 9)
        pain_end = (
            0 if patient.status is PatientStatus.DISCHARGED else RNG.randint(1, 4)
        )
        rom_start = RNG.randint(30, 50)
        rom_end = (
            RNG.randint(85, 100)
            if patient.status is PatientStatus.DISCHARGED
            else RNG.randint(65, 85)
        )
        str_start = RNG.randint(1, 2)
        str_end = 5 if patient.status is PatientStatus.DISCHARGED else RNG.randint(3, 4)

        for i in range(sessions):
            # Linear interpolation across the sessions, rounded to the scale.
            f = i / max(1, sessions - 1)
            day = TODAY - dt.timedelta(days=(sessions - i) * 5)

            milestone = None
            if i == sessions - 1 and patient.status is PatientStatus.DISCHARGED:
                milestone = "Discharged to home exercise programme"
            elif i == sessions // 2:
                milestone = RNG.choice(MILESTONES[:4])

            rows.append(
                ClinicalNote(
                    patient_id=patient.id,
                    therapist_id=patient.therapist_id,
                    date=day,
                    subjective=RNG.choice(SUBJECTIVE),
                    objective=RNG.choice(OBJECTIVE),
                    assessment=f"Session {i + 1} of {sessions}. Progressing as expected.",
                    plan="Continue current programme; review next session.",
                    treatment_given=RNG.choice(TREATMENTS),
                    exercises_prescribed=RNG.choice(EXERCISES),
                    pain_score=round(pain_start + (pain_end - pain_start) * f),
                    rom_score=round(rom_start + (rom_end - rom_start) * f),
                    strength_score=round(str_start + (str_end - str_start) * f),
                    milestone=milestone,
                )
            )

    db.add_all(rows)
    db.commit()
    return rows


def seed_invoices(db, patients: list[Patient]) -> list[Invoice]:
    """Invoices covering every status, each with a matching payment history.

    Statuses are derived through services.billing rather than assigned, so the
    seeded cache is correct by construction.
    """
    services = [
        ("Initial assessment", Decimal("2500.00")),
        ("Therapy session", Decimal("1800.00")),
        ("Manual therapy session", Decimal("2200.00")),
        ("Hydrotherapy session", Decimal("2800.00")),
        ("Review consultation", Decimal("1200.00")),
    ]
    invoices: list[Invoice] = []

    for idx, patient in enumerate(patients):
        for n in range(RNG.randint(1, 3)):
            service, amount = RNG.choice(services)
            issued = TODAY - dt.timedelta(days=RNG.randint(0, 40))
            # Every fourth invoice carries a discount.
            discount = Decimal("300.00") if (idx + n) % 4 == 0 else Decimal("0.00")

            invoice = Invoice(
                patient_id=patient.id,
                service=service,
                date=issued,
                amount=amount,
                discount=discount,
            )
            db.add(invoice)
            db.flush()

            # Cycle deterministically so all four statuses are represented.
            payable = amount - discount
            kind = (idx + n) % 5
            payments: list[Payment] = []

            if kind == 0:
                pass  # leave it DUE
            elif kind in (1, 2):
                payments.append(
                    Payment(
                        invoice_id=invoice.id,
                        date=issued,
                        amount=payable,
                        method=RNG.choice([PaymentMethod.CASH, PaymentMethod.CARD]),
                        details={"reference": f"TXN{invoice.id:05d}"},
                    )
                )
            elif kind == 3:
                half = (payable / 2).quantize(Decimal("0.01"))
                payments.append(
                    Payment(
                        invoice_id=invoice.id,
                        date=issued,
                        amount=half,
                        method=PaymentMethod.CASH,
                        note="Part payment at reception",
                    )
                )
            else:
                payments.append(
                    Payment(
                        invoice_id=invoice.id,
                        date=issued,
                        amount=payable,
                        method=PaymentMethod.CARD,
                    )
                )
                payments.append(
                    Payment(
                        invoice_id=invoice.id,
                        date=issued + dt.timedelta(days=2),
                        amount=-payable,
                        method=PaymentMethod.CARD,
                        note="Refunded: remaining sessions cancelled",
                    )
                )

            db.add_all(payments)
            db.flush()
            billing.recalculate(invoice, payments)
            invoices.append(invoice)

    db.commit()
    return invoices


def seed_notifications(db, patients: list[Patient]) -> list[Notification]:
    """One notification per type/channel/status combination worth demonstrating."""
    rows: list[Notification] = []
    now = dt.datetime.now(dt.UTC)

    plan = [
        (
            NotificationType.APPOINTMENT_REMINDER,
            NotificationChannel.SMS,
            NotificationStatus.SCHEDULED,
            1,
        ),
        (
            NotificationType.APPOINTMENT_REMINDER,
            NotificationChannel.EMAIL,
            NotificationStatus.SENT,
            -1,
        ),
        (
            NotificationType.APPOINTMENT_REMINDER,
            NotificationChannel.WHATSAPP,
            NotificationStatus.SCHEDULED,
            2,
        ),
        (
            NotificationType.PAYMENT_REMINDER,
            NotificationChannel.SMS,
            NotificationStatus.SENT,
            -3,
        ),
        (
            NotificationType.PAYMENT_REMINDER,
            NotificationChannel.EMAIL,
            NotificationStatus.FAILED,
            -2,
        ),
        (
            NotificationType.FOLLOW_UP,
            NotificationChannel.SMS,
            NotificationStatus.SCHEDULED,
            5,
        ),
        (
            NotificationType.FOLLOW_UP,
            NotificationChannel.WHATSAPP,
            NotificationStatus.CANCELLED,
            3,
        ),
        (
            NotificationType.EXERCISE_REMINDER,
            NotificationChannel.SMS,
            NotificationStatus.SENT,
            -1,
        ),
        (
            NotificationType.EXERCISE_REMINDER,
            NotificationChannel.EMAIL,
            NotificationStatus.SCHEDULED,
            1,
        ),
        (
            NotificationType.FOLLOW_UP,
            NotificationChannel.EMAIL,
            NotificationStatus.SCHEDULED,
            7,
        ),
    ]

    messages = {
        NotificationType.APPOINTMENT_REMINDER: "Reminder: your physiotherapy session is scheduled for {when}.",
        NotificationType.PAYMENT_REMINDER: "You have an outstanding balance at PhysioDesk. Please settle at your next visit.",
        NotificationType.FOLLOW_UP: "It has been a while since your last session. Would you like to book a review?",
        NotificationType.EXERCISE_REMINDER: "Remember your home exercise programme today. Consistency matters most.",
    }

    for i, (ntype, channel, nstatus, day_offset) in enumerate(plan):
        patient = patients[i % len(patients)]
        scheduled = now + dt.timedelta(days=day_offset)
        rows.append(
            Notification(
                patient_id=patient.id,
                type=ntype,
                channel=channel,
                status=nstatus,
                scheduled_for=scheduled,
                sent_at=scheduled if nstatus is NotificationStatus.SENT else None,
                message=messages[ntype].format(
                    when=scheduled.strftime("%d %b at %H:%M")
                ),
                failure_reason=(
                    "Delivery rejected by provider: mailbox full."
                    if nstatus is NotificationStatus.FAILED
                    else None
                ),
            )
        )

    db.add_all(rows)
    db.commit()
    return rows


def run(reset: bool = False) -> int:
    db = SessionLocal()
    try:
        if already_seeded(db):
            if not reset:
                print(
                    "Database already contains data. Nothing to do.\n"
                    "Re-run with --reset to wipe the domain tables and seed again."
                )
                return 0
            print("Wiping existing domain data...")
            wipe(db)

        print("Seeding PhysioDesk demo data...")
        user = seed_user(db)
        therapists = seed_therapists(db)
        patients = seed_patients(db, therapists)
        appointments = seed_appointments(db, patients, therapists)
        notes = seed_clinical_notes(db, patients)
        invoices = seed_invoices(db, patients)
        notifications = seed_notifications(db, patients)

        by_status: dict[str, int] = {}
        for inv in invoices:
            by_status[inv.status.value] = by_status.get(inv.status.value, 0) + 1

        print(
            f"\n  therapists     {len(therapists)}"
            f"\n  patients       {len(patients)}"
            f"\n  appointments   {len(appointments)}"
            f"\n  clinical notes {len(notes)}"
            f"\n  invoices       {len(invoices)}  "
            + ", ".join(f"{k}: {v}" for k, v in sorted(by_status.items()))
            + f"\n  notifications  {len(notifications)}"
        )
        print(
            f"\nSign in as  {user.username} / {settings.seed_admin_password}"
            "\nAPI docs at http://localhost:8000/docs"
        )
        return 0
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed the PhysioDesk database with demo data."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Wipe the domain tables before seeding. The user account is kept.",
    )
    args = parser.parse_args()

    try:
        with engine.connect():
            pass
    except Exception as exc:  # pragma: no cover - operator feedback
        print(
            f"Cannot reach the database: {exc}\nIs it running? Try: docker compose up -d db"
        )
        return 1

    return run(reset=args.reset)


if __name__ == "__main__":
    sys.exit(main())
