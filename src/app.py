"""
High School Management System API

A super simple FastAPI application that allows teachers to manage
extracurricular activities at Mergington High School.
"""

from functools import lru_cache
from hashlib import sha256
import hmac
import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

BASE_DIR = Path(__file__).parent
TEACHERS_FILE = BASE_DIR / "data" / "teachers.json"
SESSION_SECRET_KEY = os.getenv("SESSION_SECRET_KEY", "dev-session-secret")

app = FastAPI(
    title="Mergington High School API",
    description="API for viewing and managing extracurricular activities",
)

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET_KEY,
    same_site="lax",
    https_only=False,
)

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


class LoginRequest(BaseModel):
    username: str
    password: str


# In-memory activity database
activities = {
    "Chess Club": {
        "description": "Learn strategies and compete in chess tournaments",
        "schedule": "Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 12,
        "participants": ["michael@mergington.edu", "daniel@mergington.edu"],
    },
    "Programming Class": {
        "description": "Learn programming fundamentals and build software projects",
        "schedule": "Tuesdays and Thursdays, 3:30 PM - 4:30 PM",
        "max_participants": 20,
        "participants": ["emma@mergington.edu", "sophia@mergington.edu"],
    },
    "Gym Class": {
        "description": "Physical education and sports activities",
        "schedule": "Mondays, Wednesdays, Fridays, 2:00 PM - 3:00 PM",
        "max_participants": 30,
        "participants": ["john@mergington.edu", "olivia@mergington.edu"],
    },
    "Soccer Team": {
        "description": "Join the school soccer team and compete in matches",
        "schedule": "Tuesdays and Thursdays, 4:00 PM - 5:30 PM",
        "max_participants": 22,
        "participants": ["liam@mergington.edu", "noah@mergington.edu"],
    },
    "Basketball Team": {
        "description": "Practice and play basketball with the school team",
        "schedule": "Wednesdays and Fridays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["ava@mergington.edu", "mia@mergington.edu"],
    },
    "Art Club": {
        "description": "Explore your creativity through painting and drawing",
        "schedule": "Thursdays, 3:30 PM - 5:00 PM",
        "max_participants": 15,
        "participants": ["amelia@mergington.edu", "harper@mergington.edu"],
    },
    "Drama Club": {
        "description": "Act, direct, and produce plays and performances",
        "schedule": "Mondays and Wednesdays, 4:00 PM - 5:30 PM",
        "max_participants": 20,
        "participants": ["ella@mergington.edu", "scarlett@mergington.edu"],
    },
    "Math Club": {
        "description": "Solve challenging problems and participate in math competitions",
        "schedule": "Tuesdays, 3:30 PM - 4:30 PM",
        "max_participants": 10,
        "participants": ["james@mergington.edu", "benjamin@mergington.edu"],
    },
    "Debate Team": {
        "description": "Develop public speaking and argumentation skills",
        "schedule": "Fridays, 4:00 PM - 5:30 PM",
        "max_participants": 12,
        "participants": ["charlotte@mergington.edu", "henry@mergington.edu"],
    },
}


@lru_cache(maxsize=1)
def load_teacher_accounts() -> dict[str, dict[str, str]]:
    with TEACHERS_FILE.open("r", encoding="utf-8") as file_handle:
        payload = json.load(file_handle)

    return {
        entry["username"]: {
            "password_hash": entry["password_hash"],
            "role": entry.get("role", "teacher"),
        }
        for entry in payload.get("teachers", [])
    }


def hash_password(password: str) -> str:
    return sha256(password.encode("utf-8")).hexdigest()


def get_current_user(request: Request) -> dict[str, str] | None:
    username = request.session.get("username")
    role = request.session.get("role")
    if not username or not role:
        return None
    return {"username": username, "role": role}


def require_teacher(request: Request) -> dict[str, str]:
    user = get_current_user(request)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Teacher login required",
        )

    if user["role"] not in {"teacher", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    return user


def get_activity(activity_name: str) -> dict:
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activities[activity_name]


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/auth/me")
def auth_me(request: Request):
    user = get_current_user(request)
    return {"authenticated": user is not None, "user": user}


@app.post("/auth/login")
def login(request: Request, payload: LoginRequest):
    teachers = load_teacher_accounts()
    account = teachers.get(payload.username)

    if account is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not hmac.compare_digest(account["password_hash"], hash_password(payload.password)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    request.session["username"] = payload.username
    request.session["role"] = account["role"]
    return {
        "message": "Logged in successfully",
        "user": {"username": payload.username, "role": account["role"]},
    }


@app.post("/auth/logout")
def logout(request: Request):
    request.session.clear()
    return {"message": "Logged out successfully"}


@app.get("/activities")
def get_activities():
    return activities


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(activity_name: str, email: str, request: Request):
    require_teacher(request)
    activity = get_activity(activity_name)

    if not email:
        raise HTTPException(status_code=400, detail="Student email is required")

    if email in activity["participants"]:
        raise HTTPException(status_code=400, detail="Student is already signed up")

    if len(activity["participants"]) >= activity["max_participants"]:
        raise HTTPException(status_code=400, detail="Activity is full")

    activity["participants"].append(email)
    return {"message": f"Signed up {email} for {activity_name}"}


@app.delete("/activities/{activity_name}/unregister")
def unregister_from_activity(activity_name: str, email: str, request: Request):
    require_teacher(request)
    activity = get_activity(activity_name)

    if not email:
        raise HTTPException(status_code=400, detail="Student email is required")

    if email not in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is not signed up for this activity",
        )

    activity["participants"].remove(email)
    return {"message": f"Unregistered {email} from {activity_name}"}
