import os
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, FileResponse
from dotenv import load_dotenv

from app.models import Task, TaskCreate, TaskUpdate, TaskStatus, Category, Statistics, UserProfile, UserProfileUpdate
from app.storage import Storage
from app.ai_scheduler import AIScheduler

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="Open2Do", description="Local web-based TODO application with AI automation")

# Get data directory from environment or use default
DATA_DIR = os.getenv("DATA_DIR", str(Path(__file__).parent.parent / "data"))

# Initialize storage and AI scheduler
storage = Storage(DATA_DIR)
ai_scheduler = AIScheduler()

# Mount static files and templates
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Render the main TODO list page."""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Render the statistics dashboard."""
    return templates.TemplateResponse("dashboard.html", {"request": request})


# API Routes

@app.get("/api/tasks")
async def get_tasks(category: Optional[str] = None, status: Optional[str] = None):
    """Get all tasks, optionally filtered by category and status."""
    task_status = TaskStatus(status) if status else None
    tasks = storage.get_tasks(category=category, status=task_status)
    return {"tasks": [task.model_dump() for task in tasks]}


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    """Get a specific task by ID."""
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.model_dump()


@app.post("/api/tasks")
async def create_task(task_create: TaskCreate):
    """Create a new task."""
    task = storage.create_task(task_create)
    return task.model_dump()


@app.post("/api/parse-natural-language")
async def parse_natural_language(request: dict):
    """Parse natural language input to extract task/filter/sort information."""
    input_text = request.get("input", "")
    
    if not input_text or not input_text.strip():
        raise HTTPException(status_code=400, detail="Input text is required")
    
    try:
        parsed_data = await ai_scheduler.parse_natural_language_input(input_text)
        return {
            "success": True,
            "data": parsed_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse natural language: {str(e)}")


@app.put("/api/tasks/{task_id}")
async def update_task(task_id: str, task_update: TaskUpdate):
    """Update a task."""
    task = storage.update_task(task_id, task_update)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.model_dump()


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str):
    """Delete a task."""
    success = storage.delete_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted successfully"}


@app.get("/api/tasks/search/{query}")
async def search_tasks(query: str):
    """Search tasks by title or description."""
    tasks = storage.search_tasks(query)
    return {"tasks": [task.model_dump() for task in tasks]}


@app.get("/api/categories")
async def get_categories():
    """Get all categories."""
    categories = storage.get_categories()
    return {"categories": [cat.model_dump() for cat in categories]}


@app.get("/api/statistics")
async def get_statistics():
    """Get task statistics."""
    stats = storage.get_statistics()
    return stats.model_dump()


# User Profile Routes

@app.get("/api/user-profile")
async def get_user_profile():
    """Get user profile."""
    profile = storage.get_user_profile()
    return profile.model_dump()


@app.put("/api/user-profile")
async def update_user_profile(profile_update: UserProfileUpdate):
    """Update user profile."""
    profile = storage.update_user_profile(profile_update)
    return profile.model_dump()


@app.get("/api/user-profile/avatar/{filename}")
async def get_avatar(filename: str):
    """Get user avatar image."""
    avatar_path = storage.avatars_dir / filename
    if not avatar_path.exists():
        raise HTTPException(status_code=404, detail="Avatar not found")
    return FileResponse(avatar_path)


@app.post("/api/schedule")
async def schedule_tasks():
    """Schedule tasks using iFlow."""
    tasks = storage.get_tasks()
    # Only schedule pending tasks
    pending_tasks = [t for t in tasks if t.status == TaskStatus.pending]
    
    if not pending_tasks:
        return {"message": "No pending tasks to schedule", "tasks": []}
    
    scheduled_tasks = await ai_scheduler.schedule_tasks(pending_tasks)
    
    # Update tasks with suggested times
    for task in scheduled_tasks:
        storage.update_task(task.id, TaskUpdate(ai_suggested_time=task.ai_suggested_time))
    
    return {"tasks": [task.model_dump() for task in scheduled_tasks]}


@app.post("/api/tasks/{task_id}/execute")
async def execute_task(task_id: str):
    """Execute a task using iFlow."""
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Use AI to analyze if execution requires permission outside task folder
    requires_permission = await ai_scheduler.check_execution_permission(task)
    
    execution_result = {
        "task_id": task_id,
        "requires_permission": requires_permission,
        "task_folder": task.folder_path
    }
    
    if not requires_permission:
        # Auto-execute without permission
        result = await ai_scheduler.execute_task_via_iflow(task)
        execution_result["status"] = "executed"
        execution_result["result"] = result
        
        # Update task status to completed after execution
        storage.update_task(task_id, TaskUpdate(status=TaskStatus.completed))
    else:
        # Ask for permission
        execution_result["status"] = "awaiting_permission"
        execution_result["message"] = "This task requires permission to modify files outside the task folder."
    
    return execution_result


@app.post("/api/tasks/{task_id}/execute/confirm")
async def confirm_execute_task(task_id: str):
    """Execute a task after user confirmation."""
    task = storage.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Execute with permission
    result = await ai_scheduler.execute_task_via_iflow(task)
    
    # Update task status to completed after execution
    storage.update_task(task_id, TaskUpdate(status=TaskStatus.completed))
    
    return {
        "task_id": task_id,
        "status": "executed",
        "result": result
    }


@app.post("/api/tasks/reorder")
async def reorder_tasks(request: dict):
    """Reorder tasks based on new order."""
    task_order = request.get("task_order", [])
    
    if not task_order:
        return {"success": False, "message": "No task order provided"}
    
    try:
        # Get all current tasks
        all_tasks_data = storage._load_data()
        all_tasks = all_tasks_data["tasks"]
        
        # Create a mapping of task ID to task data
        task_map = {task["id"]: task for task in all_tasks}
        
        # Reorder tasks based on the provided order
        reordered_tasks = []
        for task_id in task_order:
            if task_id in task_map:
                reordered_tasks.append(task_map[task_id])
        
        # Add any tasks not in the order (just in case)
        for task in all_tasks:
            if task["id"] not in task_order:
                reordered_tasks.append(task)
        
        # Save the reordered tasks
        all_tasks_data["tasks"] = reordered_tasks
        storage._save_data(all_tasks_data)
        
        return {"success": True}
    except Exception as e:
        return {"success": False, "message": str(e)}


@app.post("/api/open-folder")
async def open_folder(request: dict):
    """Open a folder in the system's file explorer."""
    folder_path = request.get("path")
    
    if not folder_path:
        return {"success": False, "message": "No path provided"}
    
    try:
        import subprocess
        import platform
        
        # Check if folder exists
        if not os.path.exists(folder_path):
            return {"success": False, "message": "Folder does not exist"}
        
        # Open folder based on OS
        system = platform.system()
        if system == "Windows":
            subprocess.run(["explorer", folder_path])
        elif system == "Darwin":  # macOS
            subprocess.run(["open", folder_path])
        elif system == "Linux":
            subprocess.run(["xdg-open", folder_path])
        else:
            return {"success": False, "message": "Unsupported operating system"}
        
        return {"success": True}
    except Exception as e:
        return {"success": False, "message": str(e)}


@app.post("/api/open-terminal")
async def open_terminal(request: dict):
    """Open a terminal window in the specified folder."""
    folder_path = request.get("path")
    
    if not folder_path:
        return {"success": False, "message": "No path provided"}
    
    try:
        import subprocess
        import os
        import platform
        
        # Convert relative path to absolute path
        if not os.path.isabs(folder_path):
            folder_path = os.path.abspath(folder_path)
        
        # Check if folder exists
        if not os.path.exists(folder_path):
            return {"success": False, "message": f"Folder does not exist: {folder_path}"}
        
        # Open terminal based on OS
        system = platform.system()
        if system == "Windows":
            subprocess.run(["start", "cmd", "/k", f"cd /d \"{folder_path}\""], shell=True)
        elif system == "Darwin":  # macOS
            subprocess.run(["osascript", "-e", f'tell application "Terminal" to do script "cd \\"{folder_path}\\""'])
        elif system == "Linux":
            # Try common terminal emulators
            terminals = ["gnome-terminal", "konsole", "xfce4-terminal", "xterm"]
            for term in terminals:
                try:
                    subprocess.Popen([term, "--working-directory", folder_path])
                    return {"success": True}
                except:
                    continue
            return {"success": False, "message": "No terminal emulator found"}
        else:
            return {"success": False, "message": "Unsupported operating system"}
        
        return {"success": True}
    except Exception as e:
        return {"success": False, "message": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)