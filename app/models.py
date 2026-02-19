from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class TaskStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"


class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Task(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    category: str
    priority: TaskPriority = TaskPriority.medium
    status: TaskStatus = TaskStatus.pending
    due_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)
    folder_path: str
    ai_suggested_time: Optional[datetime] = None
    has_ai_button: bool = False


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str
    priority: TaskPriority = TaskPriority.medium
    due_date: Optional[datetime] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[TaskPriority] = None
    status: Optional[TaskStatus] = None
    due_date: Optional[datetime] = None
    has_ai_button: Optional[bool] = None


class Category(BaseModel):
    name: str
    color: str = "#007bff"


class Statistics(BaseModel):
    total_tasks: int
    completed_tasks: int
    pending_tasks: int
    in_progress_tasks: int
    completion_rate: float
    tasks_by_category: dict
    tasks_by_priority: dict
    ai_action_enabled: int = 0
    ai_action_disabled: int = 0


class UserProfile(BaseModel):
    name: str = "User"
    avatar: Optional[str] = None  # Base64 encoded image or path
    location: Optional[str] = None
    data_directory: str = "./data"


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None  # Base64 encoded image
    location: Optional[str] = None
    data_directory: Optional[str] = None