"""
main.py
-------
FastAPI backend for Stud Extraction.

Endpoints:
  GET  /                 -> serves the frontend
  GET  /api/health       -> Tesseract status
  POST /api/extract      -> upload image/PDF, returns beams + studs + summary
  GET  /api/history      -> list of past extractions
  GET  /api/history/{id} -> full stored result for one extraction

Run:  python -m uvicorn backend.main:app  (or just use run.bat)
"""

import hashlib
import json
import os
import secrets
import sqlite3
import time
from contextlib import closing
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Depends, Header, status
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import extractor

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Production: serve the built React app (frontend/dist).
# Fallback to frontend/ so the API still boots before the first build.
FRONTEND_DIR = os.path.join(ROOT, "frontend", "dist")
if not os.path.isdir(FRONTEND_DIR):
    FRONTEND_DIR = os.path.join(ROOT, "frontend")
DATA_DIR = os.path.join(ROOT, "data")
DB_PATH = os.path.join(DATA_DIR, "extractions.db")
os.makedirs(DATA_DIR, exist_ok=True)

MAX_BYTES = 25 * 1024 * 1024  # 25 MB upload cap
ALLOWED_EXT = (".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp", ".pdf")


# ---------------------------------------------------------------------------
# Password Hashing Helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}:{key.hex()}"


def verify_password(stored_password: str, provided_password: str) -> bool:
    try:
        salt, stored_key = stored_password.split(":")
        key = hashlib.pbkdf2_hmac('sha256', provided_password.encode('utf-8'), salt.encode('utf-8'), 100000)
        return secrets.compare_digest(key.hex(), stored_key)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Tiny SQLite history and auth store
# ---------------------------------------------------------------------------
def _db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with closing(_db()) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT UNIQUE,
                password_hash TEXT,
                role          TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT PRIMARY KEY,
                user_id    INTEGER,
                created_at REAL,
                expires_at REAL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS extractions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                filename    TEXT,
                created_at  REAL,
                total_beams INTEGER,
                total_studs INTEGER,
                payload     TEXT,
                user_id     INTEGER,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )
        # Migrate existing table if user_id does not exist
        try:
            conn.execute("ALTER TABLE extractions ADD COLUMN user_id INTEGER")
        except sqlite3.OperationalError:
            pass
        
        # Seed default accounts if users table is empty
        cur = conn.execute("SELECT COUNT(*) FROM users")
        if cur.fetchone()[0] == 0:
            admin_pwd = hash_password("admin123")
            user_pwd = hash_password("user123")
            conn.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", ("admin", admin_pwd, "admin"))
            conn.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", ("user", user_pwd, "user"))
        conn.commit()


def save_extraction(result: dict, user_id: int) -> int:
    with closing(_db()) as conn:
        cur = conn.execute(
            "INSERT INTO extractions (filename, created_at, total_beams, total_studs, payload, user_id)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (
                result["filename"],
                time.time(),
                result["summary"]["total_beams"],
                result["summary"]["total_studs"],
                json.dumps(result),
                user_id,
            ),
        )
        conn.commit()
        return cur.lastrowid


# ---------------------------------------------------------------------------
# FastAPI Dependency Injection for Auth & RBAC
# ---------------------------------------------------------------------------
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication token"
        )
    token = authorization.split(" ")[1]
    with closing(_db()) as conn:
        row = conn.execute(
            "SELECT u.id, u.username, u.role, s.expires_at FROM sessions s "
            "JOIN users u ON s.user_id = u.id WHERE s.token = ?", (token,)
        ).fetchone()
        
    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token"
        )
        
    if row["expires_at"] < time.time():
        with closing(_db()) as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired. Please log in again."
        )
        
    return {"id": row["id"], "username": row["username"], "role": row["role"]}


def require_role(allowed_roles: list):
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this operation"
            )
        return user
    return dependency


# ---------------------------------------------------------------------------
# Authentication Pydantic Schemas
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Stud Extraction API", version="1.0")


@app.on_event("startup")
def _startup():
    init_db()


# --- Authentication Routes ---

@app.post("/api/auth/register")
def register_endpoint(req: RegisterRequest):
    username = req.username.strip()
    password = req.password
    
    if len(username) < 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Username must be at least 3 characters.")
    if len(password) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password must be at least 6 characters.")
        
    pwd_hash = hash_password(password)
    with closing(_db()) as conn:
        try:
            conn.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                (username, pwd_hash, "user")
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Username '{username}' is already taken.")
            
    return {"status": "ok", "message": "Registered successfully"}


@app.post("/api/auth/login")
def login_endpoint(req: LoginRequest):
    username = req.username.strip()
    password = req.password
    
    with closing(_db()) as conn:
        row = conn.execute("SELECT id, username, password_hash, role FROM users WHERE username = ?", (username,)).fetchone()
        
    if not row or not verify_password(row["password_hash"], password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
        
    token = secrets.token_hex(32)
    expires_at = time.time() + (7 * 24 * 3600)  # 7 days
    
    with closing(_db()) as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, row["id"], time.time(), expires_at)
        )
        conn.commit()
        
    return {
        "token": token,
        "user": {
            "id": row["id"],
            "username": row["username"],
            "role": row["role"]
        }
    }


@app.post("/api/auth/logout")
def logout_endpoint(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        with closing(_db()) as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
    return {"status": "ok"}


@app.get("/api/auth/me")
def me_endpoint(user: dict = Depends(get_current_user)):
    return user


# --- User Management Routes (Admin Only) ---

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str


@app.get("/api/users")
def get_users_endpoint(admin_user: dict = Depends(require_role(["admin"]))):
    with closing(_db()) as conn:
        rows = conn.execute("SELECT id, username, role FROM users ORDER BY id ASC").fetchall()
    return [dict(r) for r in rows]


@app.post("/api/users")
def create_user_endpoint(req: CreateUserRequest, admin_user: dict = Depends(require_role(["admin"]))):
    username = req.username.strip()
    password = req.password
    role = req.role.strip()
    
    if len(username) < 3:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Username must be at least 3 characters.")
    if len(password) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password must be at least 6 characters.")
    if role not in ["admin", "user"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid role. Allowed roles: admin, user.")
        
    pwd_hash = hash_password(password)
    with closing(_db()) as conn:
        try:
            conn.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                (username, pwd_hash, role)
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Username '{username}' is already taken.")
            
    return {"status": "ok", "message": "User created successfully"}


@app.delete("/api/users/{user_id}")
def delete_user_endpoint(user_id: int, admin_user: dict = Depends(require_role(["admin"]))):
    if user_id == admin_user["id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Self-deletion is forbidden. You cannot delete your own account.")
        
    with closing(_db()) as conn:
        row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
            
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM extractions WHERE user_id = ?", (user_id,))
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        
    return {"status": "ok", "message": "User and associated records deleted successfully"}


class EditUserRequest(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None


@app.put("/api/users/{user_id}")
def edit_user_endpoint(user_id: int, req: EditUserRequest, admin_user: dict = Depends(require_role(["admin"]))):
    with closing(_db()) as conn:
        row = conn.execute("SELECT id, username, role FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
            
        if user_id == admin_user["id"] and req.role and req.role != "admin":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Self-demotion is forbidden. You cannot change your own admin role.")
            
        if req.password:
            if len(req.password) < 6:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password must be at least 6 characters.")
            pwd_hash = hash_password(req.password)
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pwd_hash, user_id))
            
        if req.role:
            if req.role not in ["admin", "user"]:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid role. Allowed roles: admin, user.")
            conn.execute("UPDATE users SET role = ? WHERE id = ?", (req.role, user_id))
            
        conn.commit()
        
    return {"status": "ok", "message": "User updated successfully"}


# --- Application Routes (Protected by get_current_user / RBAC) ---

@app.get("/api/health")
def health():
    return {"status": "ok", "tesseract": extractor.tesseract_status()}


@app.post("/api/extract")
async def extract_endpoint(
    file: UploadFile = File(...), 
    page: int = Query(None, ge=0),
    user: dict = Depends(get_current_user)
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXT)}")

    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large (max 25 MB).")

    try:
        if page is not None:
            result = extractor.extract_page(data, file.filename, page)
        else:
            result = extractor.extract(data, file.filename)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except (ValueError, IndexError) as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {e}")

    if page is None:
        result["id"] = save_extraction(result, user["id"])
    return JSONResponse(result)


@app.post("/api/pagecount")
async def pagecount_endpoint(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    data = await file.read()
    name = (file.filename or "").lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        try:
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(data)
            count = len(pdf)
            pdf.close()
            return {"page_count": count}
        except Exception:
            return {"page_count": 1}
    return {"page_count": 1}


@app.post("/api/preview")
async def preview_endpoint(
    file: UploadFile = File(...), 
    page: int = Query(0, ge=0),
    user: dict = Depends(get_current_user)
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type '{ext}'.")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file.")
    try:
        png = extractor.render_preview(data, file.filename, page=page)
    except Exception as e:
        raise HTTPException(500, f"Could not render preview: {e}")
    return Response(content=png, media_type="image/png")


@app.get("/api/history")
def history(user: dict = Depends(get_current_user)):
    with closing(_db()) as conn:
        if user["role"] == "admin":
            rows = conn.execute(
                "SELECT e.id, e.filename, e.created_at, e.total_beams, e.total_studs, u.username as uploader "
                " FROM extractions e LEFT JOIN users u ON e.user_id = u.id"
                " ORDER BY e.id DESC LIMIT 50"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, filename, created_at, total_beams, total_studs"
                " FROM extractions WHERE user_id = ?"
                " ORDER BY id DESC LIMIT 50", (user["id"],)
            ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/history/{item_id}")
def history_item(item_id: int, user: dict = Depends(get_current_user)):
    with closing(_db()) as conn:
        row = conn.execute(
            "SELECT payload, user_id FROM extractions WHERE id = ?", (item_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Not found.")
        
    # Check permissions: owner or admin
    if user["role"] != "admin" and row["user_id"] != user["id"]:
        raise HTTPException(403, "You do not have access to view this extraction history item.")
        
    return json.loads(row["payload"])


@app.delete("/api/history/{item_id}")
def delete_history_item(item_id: int, user: dict = Depends(require_role(["admin"]))):
    with closing(_db()) as conn:
        row = conn.execute("SELECT id FROM extractions WHERE id = ?", (item_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Not found.")
        conn.execute("DELETE FROM extractions WHERE id = ?", (item_id,))
        conn.commit()
    return {"status": "ok", "message": "History record deleted successfully."}


# Serve the frontend (must be mounted last so /api/* wins).
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

