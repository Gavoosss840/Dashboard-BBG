from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import models, schemas
from app.auth import create_access_token, hash_password, verify_password
from app.database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_to_out(user: models.User) -> schemas.UserOut:
    item = schemas.UserOut.model_validate(user)
    item.has_login = bool(user.hashed_password)
    return item


def get_current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    user_id = getattr(request.state, "user_id", None)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.get("/bootstrap-status", response_model=schemas.BootstrapStatusOut)
def bootstrap_status(db: Session = Depends(get_db)):
    has_admin = db.query(models.User).filter(models.User.hashed_password.isnot(None)).count() > 0
    return schemas.BootstrapStatusOut(needs_bootstrap=not has_admin)


@router.post("/bootstrap", response_model=schemas.TokenResponse)
def bootstrap(body: schemas.BootstrapRequest, db: Session = Depends(get_db)):
    has_admin = db.query(models.User).filter(models.User.hashed_password.isnot(None)).count() > 0
    if has_admin:
        raise HTTPException(status_code=400, detail="Un compte admin existe déjà — utilisez la connexion.")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit faire au moins 8 caractères.")

    existing = db.query(models.User).filter(models.User.email == body.email).first()
    if existing:
        existing.hashed_password = hash_password(body.password)
        existing.role = "admin"
        user = existing
    else:
        initials = "".join(p[0].upper() for p in body.name.split()[:2]) or "AD"
        user = models.User(
            name=body.name,
            email=body.email,
            hashed_password=hash_password(body.password),
            role="admin",
            title="Administrateur",
            avatar_initials=initials,
        )
        db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.email)
    return schemas.TokenResponse(access_token=token, user=_user_to_out(user))


@router.post("/login", response_model=schemas.TokenResponse)
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")
    if not user.active:
        raise HTTPException(status_code=403, detail="Ce compte est désactivé.")
    token = create_access_token(user.id, user.email)
    return schemas.TokenResponse(access_token=token, user=_user_to_out(user))


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return _user_to_out(current_user)


@router.post("/change-password")
def change_password(
    body: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.hashed_password or not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Mot de passe actuel incorrect.")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit faire au moins 8 caractères.")
    current_user.hashed_password = hash_password(body.new_password)
    db.commit()
    return {"ok": True}
