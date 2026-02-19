import json
import os
import uuid
from pathlib import Path
from typing import List, Optional, Dict
from datetime import datetime
import base64

from app.models import Task, TaskCreate, TaskUpdate, TaskStatus, TaskPriority, Category, Statistics, UserProfile, UserProfileUpdate


class Storage:
    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        self.tasks_file = self.data_dir / "tasks.json"
        self.user_profile_file = self.data_dir / "user_profile.json"
        self.task_folders_dir = self.data_dir / "task_folders"
        self.avatars_dir = self.data_dir / "avatars"
        
        # Ensure directories exist
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.task_folders_dir.mkdir(parents=True, exist_ok=True)
        self.avatars_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize storage
        self._initialize_storage()
    
    def _initialize_storage(self):
        """Initialize storage files if they don't exist."""
        if not self.tasks_file.exists():
            with open(self.tasks_file, 'w') as f:
                json.dump({"tasks": [], "categories": []}, f)
        
        if not self.user_profile_file.exists():
            # Create default user profile
            default_profile = UserProfile().model_dump()
            with open(self.user_profile_file, 'w') as f:
                json.dump(default_profile, f, indent=2)
    
    def _load_data(self) -> dict:
        """Load data from JSON file."""
        with open(self.tasks_file, 'r') as f:
            return json.load(f)
    
    def _save_data(self, data: dict):
        """Save data to JSON file."""
        with open(self.tasks_file, 'w') as f:
            json.dump(data, f, indent=2, default=str)
    
    def create_task(self, task_create: TaskCreate) -> Task:
        """Create a new task."""
        data = self._load_data()
        
        task_id = str(uuid.uuid4())
        folder_name = f"task_{task_id[:8]}"
        folder_path = str(self.task_folders_dir / folder_name)
        
        # Create task folder
        os.makedirs(folder_path, exist_ok=True)
        
        task = Task(
            id=task_id,
            title=task_create.title,
            description=task_create.description,
            category=task_create.category,
            priority=task_create.priority,
            due_date=task_create.due_date,
            folder_path=folder_path
        )
        
        data["tasks"].append(task.model_dump())
        
        # Ensure category exists
        if task_create.category not in [c["name"] for c in data["categories"]]:
            data["categories"].append({"name": task_create.category, "color": "#007bff"})
        
        self._save_data(data)
        return task
    
    def get_tasks(self, category: Optional[str] = None, status: Optional[TaskStatus] = None) -> List[Task]:
        """Get all tasks, optionally filtered by category and status."""
        data = self._load_data()
        tasks = data["tasks"]
        
        if category:
            tasks = [t for t in tasks if t["category"] == category]
        if status:
            tasks = [t for t in tasks if t["status"] == status]
        
        return [Task(**task) for task in tasks]
    
    def get_task(self, task_id: str) -> Optional[Task]:
        """Get a specific task by ID."""
        data = self._load_data()
        for task in data["tasks"]:
            if task["id"] == task_id:
                return Task(**task)
        return None
    
    def update_task(self, task_id: str, task_update: TaskUpdate) -> Optional[Task]:
        """Update a task."""
        data = self._load_data()
        
        for i, task in enumerate(data["tasks"]):
            if task["id"] == task_id:
                # Update only provided fields
                update_dict = task_update.model_dump(exclude_unset=True)
                for key, value in update_dict.items():
                    data["tasks"][i][key] = value
                
                self._save_data(data)
                return Task(**data["tasks"][i])
        
        return None
    
    def delete_task(self, task_id: str) -> bool:
        """Delete a task and its folder."""
        data = self._load_data()
        
        for i, task in enumerate(data["tasks"]):
            if task["id"] == task_id:
                # Delete task folder
                folder_path = task["folder_path"]
                if os.path.exists(folder_path):
                    import shutil
                    shutil.rmtree(folder_path)
                
                # Remove task from list
                data["tasks"].pop(i)
                self._save_data(data)
                return True
        
        return False
    
    def search_tasks(self, query: str) -> List[Task]:
        """Search tasks by title or description."""
        data = self._load_data()
        query_lower = query.lower()
        
        matching_tasks = []
        for task in data["tasks"]:
            if (query_lower in task["title"].lower() or 
                (task.get("description") and query_lower in task["description"].lower())):
                matching_tasks.append(Task(**task))
        
        return matching_tasks
    
    def get_categories(self) -> List[Category]:
        """Get all categories."""
        data = self._load_data()
        return [Category(**cat) for cat in data["categories"]]
    
    def get_statistics(self) -> Statistics:
        """Get task statistics."""
        data = self._load_data()
        tasks = data["tasks"]
        
        total_tasks = len(tasks)
        completed_tasks = len([t for t in tasks if t["status"] == "completed"])
        pending_tasks = len([t for t in tasks if t["status"] == "pending"])
        in_progress_tasks = len([t for t in tasks if t["status"] == "in_progress"])
        
        completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        
        # Tasks by category
        tasks_by_category = {}
        for task in tasks:
            cat = task["category"]
            tasks_by_category[cat] = tasks_by_category.get(cat, 0) + 1
        
        # Tasks by priority
        tasks_by_priority = {"low": 0, "medium": 0, "high": 0}
        for task in tasks:
            priority = task["priority"]
            tasks_by_priority[priority] = tasks_by_priority.get(priority, 0) + 1
        
        # AI action distribution
        ai_action_enabled = len([t for t in tasks if t.get("has_ai_button", False)])
        ai_action_disabled = total_tasks - ai_action_enabled
        
        return Statistics(
            total_tasks=total_tasks,
            completed_tasks=completed_tasks,
            pending_tasks=pending_tasks,
            in_progress_tasks=in_progress_tasks,
            completion_rate=round(completion_rate, 2),
            tasks_by_category=tasks_by_category,
            tasks_by_priority=tasks_by_priority,
            ai_action_enabled=ai_action_enabled,
            ai_action_disabled=ai_action_disabled
        )
    
    def get_user_profile(self) -> UserProfile:
        """Get user profile."""
        with open(self.user_profile_file, 'r') as f:
            data = json.load(f)
        return UserProfile(**data)
    
    def update_user_profile(self, profile_update: UserProfileUpdate) -> UserProfile:
        """Update user profile."""
        current_profile = self.get_user_profile()
        
        # Update only provided fields
        update_dict = profile_update.model_dump(exclude_unset=True)
        
        # Handle avatar - save to file if base64 provided
        if 'avatar' in update_dict and update_dict['avatar']:
            if update_dict['avatar'].startswith('data:image'):
                # Extract base64 data and save
                header, encoded = update_dict['avatar'].split(',', 1)
                ext = header.split('/')[1].split(';')[0]
                avatar_filename = f"avatar_{uuid.uuid4().hex[:8]}.{ext}"
                avatar_path = self.avatars_dir / avatar_filename
                
                with open(avatar_path, 'wb') as f:
                    f.write(base64.b64decode(encoded))
                
                update_dict['avatar'] = str(avatar_path)
        
        # Update current profile
        for key, value in update_dict.items():
            setattr(current_profile, key, value)
        
        # Save updated profile
        with open(self.user_profile_file, 'w') as f:
            json.dump(current_profile.model_dump(), f, indent=2)
        
        return current_profile