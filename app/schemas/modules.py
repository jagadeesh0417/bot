from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import PageParams

# ---------- Departments ----------


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    code: str = Field(min_length=2, max_length=20)
    head_name: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=1000)
    established_year: int | None = Field(default=None, ge=1950, le=2100)


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    code: str | None = Field(default=None, min_length=2, max_length=20)
    head_name: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=1000)
    established_year: int | None = Field(default=None, ge=1950, le=2100)

# ---------- Students ----------


class StudentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    department_id: str
    semester: int = Field(ge=1, le=12)
    roll_number: str | None = Field(default=None, max_length=30)
    phone: str | None = Field(default=None, max_length=20)
    gender: str | None = Field(default=None, max_length=10)
    date_of_birth: str | None = None
    address: str | None = Field(default=None, max_length=300)
    courses: list[str] = Field(default_factory=list)


class StudentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    department_id: str | None = None
    semester: int | None = Field(default=None, ge=1, le=12)
    roll_number: str | None = Field(default=None, max_length=30)
    phone: str | None = Field(default=None, max_length=20)
    gender: str | None = Field(default=None, max_length=10)
    date_of_birth: str | None = None
    address: str | None = Field(default=None, max_length=300)
    courses: list[str] | None = None
    status: str | None = Field(default=None, pattern="^(active|inactive|graduated|suspended)$")

# ---------- Faculty ----------


class FacultyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    department_id: str
    designation: str = Field(max_length=80)
    qualification: str | None = Field(default=None, max_length=200)
    experience_years: int | None = Field(default=None, ge=0, le=60)
    subjects: list[str] = Field(default_factory=list)
    phone: str | None = Field(default=None, max_length=20)
    office: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=1000)
    joining_date: str | None = None


class FacultyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    email: EmailStr | None = None
    department_id: str | None = None
    designation: str | None = Field(default=None, max_length=80)
    qualification: str | None = Field(default=None, max_length=200)
    experience_years: int | None = Field(default=None, ge=0, le=60)
    subjects: list[str] | None = None
    phone: str | None = Field(default=None, max_length=20)
    office: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=1000)

# ---------- Courses ----------


class SubjectItem(BaseModel):
    name: str
    code: str | None = None
    credits: int = Field(default=3, ge=0, le=12)
    semester: int = Field(ge=1, le=12)


class CourseCreate(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=100)
    department_id: str
    description: str | None = Field(default=None, max_length=1000)
    semesters: int = Field(ge=1, le=12)
    credits: int = Field(default=120, ge=1, le=300)
    subjects: list[SubjectItem] = Field(default_factory=list)


class CourseUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=20)
    name: str | None = Field(default=None, min_length=2, max_length=100)
    department_id: str | None = None
    description: str | None = Field(default=None, max_length=1000)
    semesters: int | None = Field(default=None, ge=1, le=12)
    credits: int | None = Field(default=None, ge=1, le=300)
    subjects: list[SubjectItem] | None = None

# ---------- Notices ----------


class NoticeCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(min_length=2, max_length=10000)
    priority: str = Field(default="normal", pattern="^(normal|important|urgent)$")
    pinned: bool = False
    category: str | None = Field(default=None, max_length=50)
    expires_at: str | None = None
    attachment_type: str | None = Field(default=None, pattern="^(image|pdf|video|link)$")
    attachment_url: str | None = Field(default=None, max_length=500)


class NoticeUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    content: str | None = Field(default=None, min_length=2, max_length=10000)
    priority: str | None = Field(default=None, pattern="^(normal|important|urgent)$")
    pinned: bool | None = None
    category: str | None = Field(default=None, max_length=50)
    expires_at: str | None = None
    attachment_type: str | None = None
    attachment_url: str | None = None

# ---------- Events ----------


class EventCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: str = Field(default="cultural", pattern="^(workshop|seminar|hackathon|sports|cultural|other)$")
    date: str
    time: str | None = None
    venue: str | None = Field(default=None, max_length=150)
    registration_link: str | None = Field(default=None, max_length=500)
    organizer: str | None = Field(default=None, max_length=100)


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = Field(default=None, pattern="^(workshop|seminar|hackathon|sports|cultural|other)$")
    date: str | None = None
    time: str | None = None
    venue: str | None = None
    registration_link: str | None = None
    organizer: str | None = None

# ---------- Placements ----------


class PlacementCreate(BaseModel):
    company: str = Field(min_length=2, max_length=150)
    package: str | None = Field(default=None, max_length=50)
    role: str | None = Field(default=None, max_length=100)
    eligibility: str | None = Field(default=None, max_length=1000)
    drive_date: str
    registration_link: str | None = Field(default=None, max_length=500)
    selection_process: str | None = Field(default=None, max_length=2000)
    interview_tips: str | None = Field(default=None, max_length=2000)
    branches_eligible: list[str] = Field(default_factory=list)
    status: str = Field(default="upcoming", pattern="^(upcoming|ongoing|completed)$")


class PlacementUpdate(BaseModel):
    company: str | None = None
    package: str | None = None
    role: str | None = None
    eligibility: str | None = None
    drive_date: str | None = None
    registration_link: str | None = None
    selection_process: str | None = None
    interview_tips: str | None = None
    branches_eligible: list[str] | None = None
    status: str | None = Field(default=None, pattern="^(upcoming|ongoing|completed)$")

# ---------- Gallery ----------


class GalleryCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    media_type: str = Field(default="image", pattern="^(image|video)$")
    url: str = Field(max_length=500)
    public_id: str | None = Field(default=None, max_length=300)
    album: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    event_id: str | None = None


class GalleryUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    album: str | None = None

# ---------- Timetable ----------


class TimetableEntry(BaseModel):
    day: str = Field(pattern="^(monday|tuesday|wednesday|thursday|friday|saturday)$")
    period: int = Field(ge=1, le=12)
    time: str = Field(max_length=20)
    subject: str = Field(max_length=100)
    faculty_name: str | None = Field(default=None, max_length=80)
    room: str | None = Field(default=None, max_length=50)


class TimetableCreate(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    department_id: str
    semester: int = Field(ge=1, le=12)
    entries: list[TimetableEntry] = Field(default_factory=list)


class TimetableUpdate(BaseModel):
    title: str | None = None
    entries: list[TimetableEntry] | None = None

# ---------- Feedback ----------


class FeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    message: str = Field(min_length=2, max_length=2000)
    category: str | None = Field(default=None, max_length=50)

# ---------- Settings ----------


class SettingsUpdate(BaseModel):
    college_name: str | None = None
    tagline: str | None = None
    logo_url: str | None = None
    contact_email: EmailStr | None = None
    contact_phone: str | None = None
    address: str | None = None
    maintenance_mode: bool | None = None
    welcome_message: str | None = None

# ---------- Notifications ----------


class NotificationCreate(BaseModel):
    user_id: str
    title: str = Field(min_length=2, max_length=150)
    message: str = Field(min_length=2, max_length=1000)
    type: str = Field(default="info", max_length=30)
    link: str | None = None
