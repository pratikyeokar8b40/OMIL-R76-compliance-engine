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


def _add(db, s, u, test_type, n, *, positions=None, load="5", indication="5"):
    for i in range(n):
        add_observation(db, s, entered_by=u.id, test_type=test_type,
            position=(positions[i] if positions else None), sequence_no=i,
            applied_load=Decimal(load), indication=Decimal(indication))


def test_one_reading_per_test_is_not_enough():
    """R 76 minimums are enforced server-side, not only in the UI."""
    db=_db(); u,s=_setup(db)
    for tt in ("weighing_performance","repeatability","tare","zero_check"):
        _add(db,s,u,tt,1)
    _add(db,s,u,"eccentricity",1,positions=["1"])
    _add(db,s,u,"creep",1,positions=["1"])
    _finish_checklist(db,s,u)
    try: finalize_session(db,s)
    except SessionStateError as e:
        msg=str(e)
        assert "weighing_performance (1/5)" in msg and "repeatability (1/10)" in msg
        assert "eccentricity (1/4)" in msg and "creep (1/4)" in msg
    else: assert False


def test_all_tests_optional_requires_rationale_and_data():
    """Downgrading a core test needs a reason; zero readings never finalize."""
    from src.services.test_plan_service import set_status, TestPlanStateError
    db=_db(); u,s=_setup(db)
    try: set_status(db,s,test_type="weighing_performance",status="optional",rationale=None,user_id=u.id)
    except TestPlanStateError as e: assert "rationale" in str(e)
    else: assert False
    for item in list_plan(db,s.id):
        set_status(db,s,test_type=item.test_type.value,status="optional",rationale="demo",user_id=u.id)
    _finish_checklist(db,s,u)
    try: finalize_session(db,s)
    except SessionStateError as e: assert "no observations" in str(e)
    else: assert False


def test_complete_session_finalizes_once():
    db=_db(); u,s=_setup(db)
    _add(db,s,u,"weighing_performance",5)
    _add(db,s,u,"eccentricity",4,positions=["1","2","3","4"])
    _add(db,s,u,"repeatability",10)
    _add(db,s,u,"tare",5)
    _add(db,s,u,"creep",4,positions=["1","2","3","4"])
    _add(db,s,u,"zero_check",1)
    _finish_checklist(db,s,u)
    try: finalize_session(db,s)
    except SessionStateError as e: assert "temperature" in str(e)
    else: assert False
    s.start_temp_c=Decimal("22"); s.end_temp_c=Decimal("22.4"); db.commit()
    assert finalize_session(db,s).status.value=="completed"
    try: finalize_session(db,s)
    except SessionStateError: pass
    else: assert False


def test_finalize_requires_required_tests_and_checklist():
    db=_db(); u,s=_setup(db)
    add_observation(db,s,entered_by=u.id,test_type="weighing_performance",position=None,sequence_no=0,applied_load=Decimal("5"),indication=Decimal("5"))
    _finish_checklist(db,s,u)
    try: finalize_session(db,s)
    except SessionStateError as e: assert "required tests" in str(e)
    else: assert False

