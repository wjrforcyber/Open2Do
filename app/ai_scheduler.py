import os
import asyncio
import json
from typing import List, Optional
from datetime import datetime, timedelta

from app.models import Task


class AIScheduler:
    def __init__(self):
        """Initialize AI scheduler with OpenCode integration."""
        self.opencode_command = os.getenv("OPENCODE_COMMAND", "opencode")
    
    async def schedule_tasks(self, tasks: List[Task]) -> List[Task]:
        """
        Use OpenCode to suggest optimal scheduling for tasks.
        Returns tasks with ai_suggested_time populated.
        """
        if not tasks:
            return tasks
        
        try:
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
            
            prompt = f"""You are a task scheduling assistant. Given the following tasks with priorities and due dates, suggest optimal times to work on each task. Consider:
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
}}"""
            
            result = await self._run_opencode(prompt)
            
            if result:
                schedules = json.loads(result).get("schedules", [])
                
                task_map = {task.id: task for task in tasks}
                for schedule in schedules:
                    task_id = schedule.get("task_id")
                    suggested_time = schedule.get("suggested_time")
                    if task_id in task_map and suggested_time:
                        task_map[task_id].ai_suggested_time = datetime.fromisoformat(suggested_time)
                
                return list(task_map.values())
            
        except Exception as e:
            print(f"OpenCode scheduling failed, falling back to rule-based: {e}")
        
        return self._rule_based_schedule(tasks)
    
    def _rule_based_schedule(self, tasks: List[Task]) -> List[Task]:
        """
        Fallback rule-based scheduling when AI is not available.
        Prioritizes by due date and priority.
        """
        priority_order = {"high": 0, "medium": 1, "low": 2}
        
        def sort_key(task):
            due_date = task.due_date or datetime.max
            return (priority_order.get(task.priority, 2), due_date)
        
        sorted_tasks = sorted(tasks, key=sort_key)
        
        start_time = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=1)
        
        for task in sorted_tasks:
            task.ai_suggested_time = start_time
            start_time += timedelta(hours=2)
            
            if start_time.hour >= 18:
                start_time = (start_time + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        
        return sorted_tasks
    
    async def check_execution_permission(self, task: Task) -> bool:
        """
        Use OpenCode to analyze if task execution requires permission outside the task folder.
        Returns True if permission is needed, False otherwise.
        """
        try:
            prompt = f"""Analyze this task and determine if executing it will require modifying files or directories OUTSIDE of the task's isolated folder ({task.folder_path}).

Task:
Title: {task.title}
Description: {task.description or 'No description provided'}
Category: {task.category}
Priority: {task.priority}

Consider:
- Does the task need to modify system files, global configs, or user home directory?
- Does it need to install packages globally?
- Does it need to access files outside the task folder?

Return ONLY "true" if permission is needed, or "false" if execution can be contained within the task folder."""
            
            result = await self._run_opencode(prompt)
            
            if result:
                result_lower = result.strip().lower()
                return result_lower == "true"
            
        except Exception as e:
            print(f"OpenCode permission check failed, using fallback: {e}")
        
        return self._check_permission_fallback(task)
    
    async def execute_task_via_opencode(self, task: Task) -> dict:
        """
        Execute task by calling OpenCode.
        """
        try:
            prompt = f"""Execute the following task. Work within the task folder: {task.folder_path}

Task Details:
Title: {task.title}
Description: {task.description or 'No description provided'}
Category: {task.category}
Priority: {task.priority}

Please execute this task and report the results."""
            
            result = await self._run_opencode(prompt)
            
            if result is not None:
                return {
                    "success": True,
                    "message": "Task execution triggered successfully",
                    "opencode_response": result
                }
            else:
                return {
                    "success": False,
                    "message": "OpenCode execution failed"
                }
                
        except Exception as e:
            print(f"OpenCode not available, simulating execution: {e}")
            return {
                "success": True,
                "message": "Task execution simulated (OpenCode not available)",
                "simulated": True,
                "task_details": {
                    "task_id": task.id,
                    "title": task.title,
                    "folder_path": task.folder_path
                }
            }
    
    async def _run_opencode(self, prompt: str) -> Optional[str]:
        """
        Run OpenCode with the given prompt and return the output.
        """
        try:
            process = await asyncio.create_subprocess_exec(
                self.opencode_command,
                "run",
                prompt,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=120.0)
            
            if process.returncode == 0:
                return stdout.decode().strip()
            else:
                error_msg = stderr.decode().strip()
                print(f"OpenCode error: {error_msg}")
                return None
                
        except asyncio.TimeoutError:
            print("OpenCode timed out")
            return None
        except FileNotFoundError:
            print(f"OpenCode command not found: {self.opencode_command}")
            return None
        except Exception as e:
            print(f"Error running OpenCode: {e}")
            return None
    
    async def parse_natural_language_input(self, input_text: str) -> dict:
        """
        Parse natural language input to extract task creation, filtering, and sorting information.
        Returns a structured dict with fields for New Task, Filter, and Sort forms.
        """
        try:
            prompt = f"""Parse the following natural language input and extract information for a TODO application.

Input: {input_text}

Extract information for three forms:
1. New Task (for creating a new task)
2. Filter Tasks (for filtering existing tasks)
3. Sort By (for sorting tasks)

Only include fields that are explicitly mentioned in the input.
Omit fields that are not mentioned (use null or omit them entirely).

For New Task:
- title: Extract only KEYWORDS from the input to create a concise, short title (2-5 words maximum). Focus on the main task/action only. Do NOT include details like "I would like to", "This belongs to", "has high priority", etc.
- category: String (task category like Work, Personal, Shopping)
- priority: One of "low", "medium", "high"
- due_date: String in ISO 8601 format (YYYY-MM-DDTHH:MM:SS) if a date/time is mentioned
- description: Use the FULL original input sentence as the description

For Filter:
- category: String (category name to filter by)
- status: One of "pending", "in_progress", "completed"
- search: String (text to search for in task titles/descriptions)
- created_from: String in YYYY-MM-DD format (start of created date range)
- created_to: String in YYYY-MM-DD format (end of created date range)
- due_from: String in YYYY-MM-DD format (start of due date range)
- due_to: String in YYYY-MM-DD format (end of due date range)

For Sort:
- by: One of "custom", "created_date", "due_date", "priority"
- order: One of "asc" (ascending/oldest first), "desc" (descending/newest first)

Return ONLY a JSON object with this structure:
{{
    "new_task": {{
        "title": "...",
        "category": "...",
        "priority": "...",
        "due_date": "...",
        "description": "..."
    }},
    "filter": {{
        "category": "...",
        "status": "...",
        "search": "...",
        "created_from": "...",
        "created_to": "...",
        "due_from": "...",
        "due_to": "..."
    }},
    "sort": {{
        "by": "...",
        "order": "..."
    }}
}}

Omit any entire section (new_task, filter, or sort) if no relevant information is mentioned."""
            
            result = await self._run_opencode(prompt)
            
            if result:
                cleaned_result = result.strip()
                
                if cleaned_result.startswith('```json'):
                    cleaned_result = cleaned_result[7:]
                elif cleaned_result.startswith('```'):
                    cleaned_result = cleaned_result[3:]
                
                if cleaned_result.endswith('```'):
                    cleaned_result = cleaned_result[:-3]
                
                cleaned_result = cleaned_result.strip()
                
                parsed = json.loads(cleaned_result)
                
                if "new_task" not in parsed:
                    parsed["new_task"] = {}
                if "filter" not in parsed:
                    parsed["filter"] = {}
                if "sort" not in parsed:
                    parsed["sort"] = {}
                
                return parsed
            
        except Exception as e:
            print(f"OpenCode natural language parsing failed: {e}")
        
        return {
            "new_task": {},
            "filter": {},
            "sort": {}
        }
    
    def _check_permission_fallback(self, task: Task) -> bool:
        """Fallback keyword-based permission check when OpenCode is not available."""
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
