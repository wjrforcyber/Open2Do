import os
import asyncio
import subprocess
import json
from typing import List, Optional
from datetime import datetime, timedelta

from app.models import Task, TaskPriority


class AIScheduler:
    def __init__(self):
        """Initialize AI scheduler with iFlow CLI integration."""
        self.iflow_command = os.getenv("IFLOW_COMMAND", "iflow")
    
    async def schedule_tasks(self, tasks: List[Task]) -> List[Task]:
        """
        Use iFlow CLI to suggest optimal scheduling for tasks.
        Returns tasks with ai_suggested_time populated.
        """
        if not tasks:
            return tasks
        
        try:
            # Prepare task data for iFlow
            task_data = [
                {
                    "id": task.id,
                    "title": task.title,
                    "description": task.description,
                    "category": task.category,
                    "priority": task.priority,
                    "due_date": task.due_date.isoformat() if task.due_date else None
                }
                for task in tasks
            ]
            
            prompt = f"""
            You are a task scheduling assistant. Given the following tasks with priorities and due dates, 
            suggest optimal times to work on each task. Consider:
            1. Priority order (high > medium > low)
            2. Due date constraints
            3. Time needed for each task (estimate 1-2 hours per task)
            
            Tasks:
            {json.dumps(task_data, indent=2)}
            
            Return a JSON object with task IDs and suggested times in ISO 8601 format.
            Start scheduling from tomorrow at 9:00 AM. Work hours are 9 AM to 6 PM.
            
            Format:
            {{
                "schedules": [
                    {{"task_id": "id1", "suggested_time": "2024-01-01T09:00:00"}},
                    ...
                ]
            }}
            """
            
            # Run iFlow CLI with prompt
            result = await self._run_iflow(prompt)
            
            if result:
                # Parse iFlow response
                schedules = json.loads(result).get("schedules", [])
                
                task_map = {task.id: task for task in tasks}
                for schedule in schedules:
                    task_id = schedule.get("task_id")
                    suggested_time = schedule.get("suggested_time")
                    if task_id in task_map and suggested_time:
                        task_map[task_id].ai_suggested_time = datetime.fromisoformat(suggested_time)
                
                return list(task_map.values())
            
        except Exception as e:
            print(f"iFlow scheduling failed, falling back to rule-based: {e}")
        
        # Fallback: simple rule-based scheduling without iFlow
        return self._rule_based_schedule(tasks)
    
    def _rule_based_schedule(self, tasks: List[Task]) -> List[Task]:
        """
        Fallback rule-based scheduling when AI is not available.
        Prioritizes by due date and priority.
        """
        # Sort tasks by priority (high to low) and due date
        priority_order = {"high": 0, "medium": 1, "low": 2}
        
        def sort_key(task):
            due_date = task.due_date or datetime.max
            return (priority_order.get(task.priority, 2), due_date)
        
        sorted_tasks = sorted(tasks, key=sort_key)
        
        # Schedule tasks starting from tomorrow 9 AM
        start_time = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=1)
        
        for task in sorted_tasks:
            task.ai_suggested_time = start_time
            # Move to next time slot (2 hours per task)
            start_time += timedelta(hours=2)
            
            # Skip to next day if after 6 PM
            if start_time.hour >= 18:
                start_time = (start_time + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        
        return sorted_tasks
    
    async def check_execution_permission(self, task: Task) -> bool:
        """
        Use iFlow CLI to analyze if task execution requires permission outside the task folder.
        Returns True if permission is needed, False otherwise.
        """
        try:
            prompt = f"""
            Analyze this task and determine if executing it will require modifying files or directories 
            OUTSIDE of the task's isolated folder ({task.folder_path}).
            
            Task:
            Title: {task.title}
            Description: {task.description or 'No description provided'}
            Category: {task.category}
            Priority: {task.priority}
            
            Consider:
            - Does the task need to modify system files, global configs, or user home directory?
            - Does it need to install packages globally?
            - Does it need to access files outside the task folder?
            
            Return ONLY "true" if permission is needed, or "false" if execution can be contained within the task folder.
            """
            
            # Run iFlow CLI with prompt
            result = await self._run_iflow(prompt)
            
            if result:
                result_lower = result.strip().lower()
                return result_lower == "true"
            
        except Exception as e:
            print(f"iFlow permission check failed, using fallback: {e}")
        
        # Fallback: simple keyword-based analysis
        return self._check_permission_fallback(task)
    
    async def execute_task_via_iflow(self, task: Task) -> dict:
        """
        Execute task by calling iFlow CLI.
        """
        try:
            prompt = f"""
            Execute the following task. Work within the task folder: {task.folder_path}
            
            Task Details:
            Title: {task.title}
            Description: {task.description or 'No description provided'}
            Category: {task.category}
            Priority: {task.priority}
            
            Please execute this task and report the results.
            """
            
            # Run iFlow CLI with prompt
            result = await self._run_iflow(prompt)
            
            if result is not None:
                return {
                    "success": True,
                    "message": "Task execution triggered successfully",
                    "iflow_response": result
                }
            else:
                return {
                    "success": False,
                    "message": "iFlow execution failed"
                }
                
        except Exception as e:
            # If iFlow CLI is not available, simulate execution
            print(f"iFlow CLI not available, simulating execution: {e}")
            return {
                "success": True,
                "message": "Task execution simulated (iFlow CLI not available)",
                "simulated": True,
                "task_details": {
                    "task_id": task.id,
                    "title": task.title,
                    "folder_path": task.folder_path
                }
            }
    
    async def _run_iflow(self, prompt: str) -> Optional[str]:
        """
        Run iFlow CLI with the given prompt and return the output.
        """
        try:
            # Run iFlow CLI in non-interactive mode with prompt
            process = await asyncio.create_subprocess_exec(
                self.iflow_command,
                "-p", prompt,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60.0)
            
            if process.returncode == 0:
                return stdout.decode().strip()
            else:
                print(f"iFlow CLI error: {stderr.decode()}")
                return None
                
        except asyncio.TimeoutError:
            print("iFlow CLI timed out")
            return None
        except Exception as e:
            print(f"Error running iFlow CLI: {e}")
            return None
    
    def _check_permission_fallback(self, task: Task) -> bool:
        """Fallback keyword-based permission check when iFlow is not available."""
        description_lower = (task.description or "").lower()
        title_lower = task.title.lower()
        
        external_keywords = [
            "system", "global", "config", "settings", "install", "uninstall",
            "modify system", "change settings", "update config", "root",
            "admin", "permission", "outside", "external", "home directory",
            "/etc", "/usr", "/opt", "~", "home", "desktop", "documents"
        ]
        
        for keyword in external_keywords:
            if keyword in description_lower or keyword in title_lower:
                return True
        
        return False