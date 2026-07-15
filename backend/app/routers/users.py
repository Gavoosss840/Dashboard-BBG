from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.id).all()


@router.post("", response_model=schemas.UserOut)
def create_user(body: schemas.UserCreate, db: Session = Depends(get_db)):
    user = models.User(**body.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=schemas.UserOut)
def update_user(user_id: int, body: schemas.UserUpdate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.query(models.Client).filter(models.Client.relationship_manager_id == user_id).update(
        {"relationship_manager_id": None}, synchronize_session=False
    )
    db.query(models.CrmContact).filter(models.CrmContact.owner_id == user_id).update(
        {"owner_id": None}, synchronize_session=False
    )
    db.query(models.WatchlistItem).filter(models.WatchlistItem.added_by_id == user_id).update(
        {"added_by_id": None}, synchronize_session=False
    )
    db.delete(user)
    db.commit()
    return {"ok": True}
