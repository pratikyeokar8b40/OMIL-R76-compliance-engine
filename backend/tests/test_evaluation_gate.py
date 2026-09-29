from decimal import Decimal
import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from src.db.models import Base, User, UserRole, Instrument, AccuracyClassEnum, TestSession
from src.services.session_service import create_session, finalize_session, add_observation, SessionStateError
from src.services.checklist_service import seed_checklist, submit_checklist_item
from src.services.test_plan_service import list_plan


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return Session(engine)


def _setup(db):
    u=User(full_name="Tech",email=f"{uuid.uuid4()}@x",password_hash="x",role=UserRole.LAB_TECHNICIAN)
    db.add(u); db.flush()
    i=Instrument(manufacturer="M",model="X",serial_number=str(uuid.uuid4()),accuracy_class=AccuracyClassEnum.III,
        max_capacity=Decimal("15"),min_capacity=Decimal("0.5"),verification_scale_interval=Decimal("0.005"),display_interval=Decimal("0.001"),base_unit="kg",n_max=Decimal("3000"),created_by=u.id)
    db.add(i); db.commit()
    s=create_session(db,instrument_id=i.id,created_by=u.id)
    return u,s


def _finish_checklist(db,s,u):
    seed_checklist(db,s,entered_by=u.id)
    from src.engine.checklist_catalog import CHECKLIST_CATALOG
    for e in CHECKLIST_CATALOG:
        submit_checklist_item(db,s,entered_by=u.id,clause=e.clause,item_key=e.item_key,outcome="PASSED" if e.mandatory else "NA")


def test_empty_session_cannot_finalize():
    db=_db(); u,s=_setup(db)
    _finish_checklist(db,s,u)
    try: finalize_session(db,s)
    except SessionStateError as e: assert "required tests" in str(e)
    else: assert False


def test_finalize_requires_required_tests_and_checklist():
    db=_db(); u,s=_setup(db)
    add_observation(db,s,entered_by=u.id,test_type="weighing_performance",position=None,sequence_no=0,applied_load=Decimal("5"),indication=Decimal("5"))
    _finish_checklist(db,s,u)
    try: finalize_session(db,s)
    except SessionStateError as e: assert "required tests" in str(e)
    else: assert False

