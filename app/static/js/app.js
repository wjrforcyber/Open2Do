// Global state
let allTasks = [];
let categories = [];
let editModal;

// Toast notification function
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    
    // Create toast element
    const toastElement = document.createElement('div');
    toastElement.className = `toast align-items-center text-white bg-${getToastType(type)} border-0`;
    toastElement.setAttribute('role', 'alert');
    toastElement.setAttribute('aria-live', 'assertive');
    toastElement.setAttribute('aria-atomic', 'true');
    
    toastElement.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    
    // Add to container
    toastContainer.appendChild(toastElement);
    
    // Create Bootstrap toast instance
    const toast = new bootstrap.Toast(toastElement, {
        delay: 3000,
        autohide: true
    });
    
    // Show toast
    toast.show();
    
    // Remove element after hide
    toastElement.addEventListener('hidden.bs.toast', function () {
        toastElement.remove();
    });
}

function getToastType(type) {
    switch (type) {
        case 'success': return 'success';
        case 'error': return 'danger';
        case 'warning': return 'warning';
        case 'info': return 'info';
        default: return 'secondary';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('=== DOMContentLoaded START ===');
    editModal = new bootstrap.Modal(document.getElementById('editTaskModal'));
    
    // Load categories first, then load filter state, then create dropdown with selections, then load tasks
    loadCategories().then(() => {
        console.log('Categories loaded');
        // Update task form datalists
        updateCategorySelects();
        return loadFilterState();
    }).then((filterData) => {
        console.log('Filter state loaded, creating dropdown with selections:', filterData.categories);
        // Recreate category dropdown with saved selections
        updateCategoryDropdown(filterData.categories);
        console.log('Dropdown updated, now loading tasks');
        return loadTasks();
    }).then(() => {
        console.log('Tasks loaded, applying filters');
        filterTasks();
    });
    
    loadCanvasAssignmentsFromStorage();
    setupEventListeners();
    console.log('=== DOMContentLoaded END ===');
});

// Setup event listeners
function setupEventListeners() {
    // Task form submission
    document.getElementById('taskForm').addEventListener('submit', handleCreateTask);
    
    // Edit task save
    document.getElementById('saveTaskBtn').addEventListener('click', handleUpdateTask);
    
    // Filter changes
    document.getElementById('filterCategory').addEventListener('change', filterTasks);
    document.getElementById('filterStatus').addEventListener('change', filterTasks);
    document.getElementById('filterPriority').addEventListener('change', filterTasks);
    document.getElementById('filterCreatedFrom').addEventListener('change', filterTasks);
    document.getElementById('filterCreatedTo').addEventListener('change', filterTasks);
    document.getElementById('filterDueFrom').addEventListener('change', filterTasks);
    document.getElementById('filterDueTo').addEventListener('change', filterTasks);
    
    // Sort changes
    const sortBySelect = document.getElementById('sortBy');
    const sortOrderSelect = document.getElementById('sortOrder');
    
    if (sortBySelect) {
        sortBySelect.addEventListener('change', function() {
            // Enable/disable sort order based on sort by selection
            if (sortOrderSelect) {
                sortOrderSelect.disabled = (this.value === 'custom');
            }
            filterTasks();
        });
    }
    
    if (sortOrderSelect) {
        sortOrderSelect.addEventListener('change', filterTasks);
    }
    
    // Search input with debounce
    let searchTimeout;
    document.getElementById('searchTasks').addEventListener('input', function(e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => filterTasks(), 300);
    });
    
    // Clear filters
    document.getElementById('clearFilters').addEventListener('click', clearFilters);
    
    // Edit profile button
    document.getElementById('editProfileBtn').addEventListener('click', loadUserProfile);
    
    // Save profile button
    document.getElementById('saveProfileBtn').addEventListener('click', handleSaveProfile);
    
    // Auto-detect location button
    document.getElementById('detectLocationBtn').addEventListener('click', detectLocation);
    
    // AI autofill confirmation
    document.getElementById('confirmAutofillBtn').addEventListener('click', confirmAutofill);
    
    // Avatar upload button
    document.getElementById('avatarUploadBtn').addEventListener('click', function() {
        document.getElementById('avatarInput').click();
    });
}

// Populate modal when opened
document.getElementById('editProfileModal').addEventListener('show.bs.modal', populateEditProfileModal);

// Toggle sidebar visibility
function toggleSidebar() {
    const sidebar = document.getElementById('sidebarColumn');
    const mainContent = document.getElementById('mainContentColumn');
    
    if (sidebar.classList.contains('collapsed')) {
        // Show sidebar
        sidebar.classList.remove('collapsed');
        mainContent.classList.remove('col-md-12');
        mainContent.classList.add('col-md-9', 'col-lg-10');
    } else {
        // Hide sidebar
        sidebar.classList.add('collapsed');
        mainContent.classList.remove('col-md-9', 'col-lg-10');
        mainContent.classList.add('col-md-12');
    }
}

// Load categories from server
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        const data = await response.json();
        categories = data.categories;
        // Don't call updateCategorySelects() here - it will be called after filter state is loaded
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

// Update category select elements
function updateCategorySelects() {
    const categoryList = document.getElementById('categoryList');
    const editCategoryList = document.getElementById('editCategoryList');
    
    // Clear existing options
    categoryList.innerHTML = '';
    editCategoryList.innerHTML = '';
    
    // Add categories
    categories.forEach(cat => {
        categoryList.innerHTML += `<option value="${cat.name}">`;
        editCategoryList.innerHTML += `<option value="${cat.name}">`;
    });
}

// Update category dropdown with checkboxes
function updateCategoryDropdown(selectedCategories = []) {
    const dropdownMenu = document.getElementById('categoryDropdownMenu');
    console.log('updateCategoryDropdown called with:', selectedCategories);
    
    // Save current selected categories before clearing
    const currentSelectedCategories = getSelectedCategories();
    console.log('Current selected categories:', currentSelectedCategories);
    
    // Keep the first 3 items (Select All, Clear All, divider)
    const existingItems = dropdownMenu.querySelectorAll('li');
    for (let i = existingItems.length - 1; i >= 3; i--) {
        existingItems[i].remove();
    }
    
    // Add categories as checkboxes
    categories.forEach(cat => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="dropdown-item" onclick="event.stopPropagation();">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" value="${cat.name}" id="cat-${cat.name}" onchange="toggleCategory('${cat.name}')">
                    <label class="form-check-label" for="cat-${cat.name}">
                        ${cat.name}
                    </label>
                </div>
            </div>
        `;
        dropdownMenu.appendChild(li);
    });
    
    console.log(`Created ${categories.length} category checkboxes`);
    
    // Use the provided selected categories, or restore current selections
    const categoriesToCheck = selectedCategories.length > 0 ? selectedCategories : currentSelectedCategories;
    console.log('Categories to check:', categoriesToCheck);
    
    if (categoriesToCheck.length > 0) {
        console.log(`Checking ${categoriesToCheck.length} categories:`, categoriesToCheck);
        categoriesToCheck.forEach(catName => {
            const checkbox = document.getElementById(`cat-${catName}`);
            if (checkbox) {
                checkbox.checked = true;
                console.log(`Checked checkbox for: ${catName}`);
            } else {
                console.warn(`Checkbox not found for category: ${catName}`);
            }
        });
        updateSelectedCategoriesDisplay();
    }
    
    // Log final state
    const finalSelected = getSelectedCategories();
    console.log('Final selected categories after update:', finalSelected);
}

// Toggle category selection
function toggleCategory(categoryName) {
    updateSelectedCategoriesDisplay();
    filterTasks();
}

// Get selected categories
function getSelectedCategories() {
    const checkboxes = document.querySelectorAll('#categoryDropdownMenu input[type="checkbox"]:checked');
    const selected = Array.from(checkboxes).map(cb => cb.value);
    console.log(`getSelectedCategories: found ${selected.length} checked checkboxes:`, selected);
    return selected;
}

// Toggle all categories
function toggleAllCategories(selectAll) {
    const checkboxes = document.querySelectorAll('#categoryDropdownMenu input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = selectAll;
    });
    updateSelectedCategoriesDisplay();
    filterTasks();
}

// Update selected categories display
function updateSelectedCategoriesDisplay() {
    const selectedCategories = getSelectedCategories();
    const displayDiv = document.getElementById('selectedCategories');
    const dropdownButton = document.querySelector('#categoryDropdown span');
    
    if (selectedCategories.length === 0) {
        displayDiv.innerHTML = '';
        dropdownButton.textContent = 'Select Categories';
    } else {
        dropdownButton.textContent = `${selectedCategories.length} Selected`;
        displayDiv.innerHTML = selectedCategories.map(cat => `
            <span class="badge bg-dark">
                ${cat}
                <i class="bi bi-x ms-1" style="cursor: pointer;" onclick="removeCategory('${cat}')"></i>
            </span>
        `).join('');
    }
}

// Remove a category from selection
function removeCategory(categoryName) {
    const checkbox = document.getElementById(`cat-${categoryName}`);
    if (checkbox) {
        checkbox.checked = false;
        updateSelectedCategoriesDisplay();
        filterTasks();
    }
}

// Load tasks from server
async function loadTasks() {
    try {
        const response = await fetch('/api/tasks');
        const data = await response.json();
        allTasks = data.tasks;
        filterTasks();
        updateTaskCount();
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

// Filter and display tasks
function filterTasks() {
    console.log('=== filterTasks START ===');
    const selectedCategories = getSelectedCategories();
    const statusFilter = document.getElementById('filterStatus').value;
    const priorityFilter = document.getElementById('filterPriority').value;
    const searchQuery = document.getElementById('searchTasks').value.toLowerCase();
    
    console.log('Filter inputs:', {
        selectedCategories,
        statusFilter,
        priorityFilter,
        searchQuery
    });
    
    // Date filters
    const createdFrom = document.getElementById('filterCreatedFrom').value;
    const createdTo = document.getElementById('filterCreatedTo').value;
    const dueFrom = document.getElementById('filterDueFrom').value;
    const dueTo = document.getElementById('filterDueTo').value;
    
    // Sort options
    const sortBy = document.getElementById('sortBy').value;
    const sortOrder = document.getElementById('sortOrder').value;
    
    console.log(`Starting with ${allTasks.length} tasks`);
    let filteredTasks = allTasks;
    
    // Apply category filter (multiple categories)
    if (selectedCategories.length > 0) {
        filteredTasks = filteredTasks.filter(task => selectedCategories.includes(task.category));
    }
    
    // Apply status filter
    if (statusFilter) {
        filteredTasks = filteredTasks.filter(task => task.status === statusFilter);
    }
    
    // Apply priority filter
    if (priorityFilter) {
        filteredTasks = filteredTasks.filter(task => task.priority === priorityFilter);
    }
    
    // Apply created date range filter
    if (createdFrom) {
        const fromDate = new Date(createdFrom);
        filteredTasks = filteredTasks.filter(task => {
            const createdDate = new Date(task.created_at);
            return createdDate >= fromDate;
        });
    }
    
    if (createdTo) {
        const toDate = new Date(createdTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        filteredTasks = filteredTasks.filter(task => {
            const createdDate = new Date(task.created_at);
            return createdDate <= toDate;
        });
    }
    
    // Apply due date range filter
    if (dueFrom) {
        const fromDate = new Date(dueFrom);
        filteredTasks = filteredTasks.filter(task => {
            if (!task.due_date) return false;
            const dueDate = new Date(task.due_date);
            return dueDate >= fromDate;
        });
    }
    
    if (dueTo) {
        const toDate = new Date(dueTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        filteredTasks = filteredTasks.filter(task => {
            if (!task.due_date) return false;
            const dueDate = new Date(task.due_date);
            return dueDate <= toDate;
        });
    }
    
    // Apply search filter
    if (searchQuery) {
        filteredTasks = filteredTasks.filter(task => 
            task.title.toLowerCase().includes(searchQuery) ||
            (task.description && task.description.toLowerCase().includes(searchQuery))
        );
    }
    
    // Apply sorting (only if not custom order)
    if (sortBy !== 'custom') {
        filteredTasks = sortTasks(filteredTasks, sortBy, sortOrder);
    }
    
    displayTasks(filteredTasks, sortBy === 'custom');
    
    console.log('filterTasks completed, displaying', filteredTasks.length, 'tasks out of', allTasks.length, 'total');
    
    // Save filter state
    saveFilterState();
}

// Sort tasks
function sortTasks(tasks, sortBy, sortOrder) {
    const sortedTasks = [...tasks];
    
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    
    sortedTasks.sort((a, b) => {
        let comparison = 0;
        
        switch (sortBy) {
            case 'created_date':
                const createdA = new Date(a.created_at).getTime();
                const createdB = new Date(b.created_at).getTime();
                comparison = createdA - createdB;
                break;
            
            case 'due_date':
                // Handle null due dates - put them at the end
                if (!a.due_date && !b.due_date) {
                    comparison = 0;
                } else if (!a.due_date) {
                    comparison = 1;
                } else if (!b.due_date) {
                    comparison = -1;
                } else {
                    const dueA = new Date(a.due_date).getTime();
                    const dueB = new Date(b.due_date).getTime();
                    comparison = dueA - dueB;
                }
                break;
            
            case 'priority':
                const priorityA = priorityOrder[a.priority] || 0;
                const priorityB = priorityOrder[b.priority] || 0;
                comparison = priorityA - priorityB;
                break;
        }
        
        // Apply sort order
        return sortOrder === 'desc' ? -comparison : comparison;
    });
    
    return sortedTasks;
}

// Display tasks in the list
function displayTasks(tasks, enableDrag = false) {
    const tasksList = document.getElementById('tasksList');
    
    console.log('displayTasks called with', tasks.length, 'tasks, enableDrag:', enableDrag);
    
    if (tasks.length === 0) {
        tasksList.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-inbox fs-1"></i>
                <p class="mt-3">No tasks found.</p>
            </div>
        `;
        return;
    }
    
    tasksList.innerHTML = tasks.map(task => createTaskCard(task)).join('');
    
    // Add drag and drop event listeners to task cards only if custom order
    if (enableDrag) {
        setupDragAndDrop();
    }
}

// Create task card HTML
function createTaskCard(task) {
    const statusClass = `status-${task.status}`;
    const priorityClass = task.priority;
    const completedClass = task.status === 'completed' ? 'status-completed' : '';
    const hasAIButton = task.has_ai_button || false;
    
    const formatDate = (dateStr) => {
        if (!dateStr) return 'No due date';
        const date = new Date(dateStr);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    };
    
    const aiTimeHtml = task.ai_suggested_time ? `
        <div class="ai-suggested-time">
            <i class="bi bi-robot"></i>
            <strong>AI Suggested:</strong> ${formatDate(task.ai_suggested_time)}
        </div>
    ` : '';
    
    // Build buttons
    let buttonsHtml = '';
    if (hasAIButton) {
        buttonsHtml += `
            <button class="btn btn-sm btn-success btn-icon mb-1" onclick="executeTask('${task.id}')" title="Execute Task">
                <i class="bi bi-play-fill"></i>
            </button>
        `;
    }
    buttonsHtml += `
        <button class="btn btn-sm btn-outline-dark btn-icon mb-1" onclick="editTask('${task.id}')" title="Edit Task">
            <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger btn-icon" onclick="deleteTask('${task.id}')" title="Delete Task">
            <i class="bi bi-trash"></i>
        </button>
    `;
    
    return `
        <div class="card task-card ${priorityClass} ${statusClass} ${completedClass} mb-3" data-task-id="${task.id}">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1 d-flex align-items-start">
                        <div class="form-check me-3">
                            <input class="form-check-input task-checkbox" type="checkbox" value="${task.id}" onchange="updateBulkActions()">
                        </div>
                        <div>
                            <h5 class="task-title">${escapeHtml(task.title)}</h5>
                            ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
                            
                            <div class="task-meta mb-2">
                                <span class="category-badge bg-dark text-white me-2">
                                    <i class="bi bi-tag"></i> ${escapeHtml(task.category)}
                                </span>
                                <span class="priority-badge ${priorityClass} me-2">
                                    <i class="bi bi-flag"></i> ${task.priority}
                                </span>
                                <span class="status-badge ${statusClass}">
                                    <i class="bi bi-circle"></i> ${formatStatus(task.status)}
                                </span>
                            </div>
                            
                            <div class="task-meta">
                                                        <span class="me-3"><i class="bi bi-calendar-plus"></i> Created: ${formatDate(task.created_at)}</span>
                                                        <span class="me-3"><i class="bi bi-calendar-event"></i> Due: ${formatDate(task.due_date)}</span>
                                                        <span class="folder-path clickable" onclick="openFolder('${escapeHtml(task.folder_path)}')" title="Click to open folder">
                                                            <i class="bi bi-folder"></i> ${escapeHtml(task.folder_path)}
                                                        </span>
                                                        <span class="terminal-link clickable" onclick="openTerminalInFolder('${escapeHtml(task.folder_path)}')" title="Click to open terminal in this folder">
                                                            <i class="bi bi-terminal"></i> Open Terminal
                                                        </span>
                                                    </div>
                            
                            ${aiTimeHtml}
                        </div>
                    </div>
                    
                    <div class="btn-group-vertical ms-3">
                        ${buttonsHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Format status for display
function formatStatus(status) {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle create task
async function handleCreateTask(event) {
    event.preventDefault();
    
    const taskData = {
        title: document.getElementById('taskTitle').value,
        description: document.getElementById('taskDescription').value || null,
        category: document.getElementById('taskCategory').value,
        priority: document.getElementById('taskPriority').value,
        due_date: document.getElementById('taskDueDate').value || null
    };
    
    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskData)
        });
        
        if (response.ok) {
            // Reset form
            document.getElementById('taskForm').reset();
            // Reload tasks and categories
            await loadTasks();
            await loadCategories();
        } else {
            alert('Failed to create task');
        }
    } catch (error) {
        console.error('Error creating task:', error);
        alert('Error creating task');
    }
}

// Edit task
function editTask(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Populate edit form
    document.getElementById('editTaskId').value = task.id;
    document.getElementById('editTaskTitle').value = task.title;
    document.getElementById('editTaskDescription').value = task.description || '';
    document.getElementById('editTaskCategory').value = task.category;
    document.getElementById('editTaskPriority').value = task.priority;
    document.getElementById('editTaskStatus').value = task.status;
    document.getElementById('editTaskDueDate').value = task.due_date ? task.due_date.slice(0, 16) : '';
    
    // Show modal
    editModal.show();
}

// Handle update task
async function handleUpdateTask() {
    const taskId = document.getElementById('editTaskId').value;
    
    const updateData = {
        title: document.getElementById('editTaskTitle').value,
        description: document.getElementById('editTaskDescription').value || null,
        category: document.getElementById('editTaskCategory').value,
        priority: document.getElementById('editTaskPriority').value,
        status: document.getElementById('editTaskStatus').value,
        due_date: document.getElementById('editTaskDueDate').value || null
    };
    
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            editModal.hide();
            await loadTasks();
            await loadCategories();
        } else {
            alert('Failed to update task');
        }
    } catch (error) {
        console.error('Error updating task:', error);
        alert('Error updating task');
    }
}

// Delete task
async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadTasks();
        } else {
            alert('Failed to delete task');
        }
    } catch (error) {
        console.error('Error deleting task:', error);
        alert('Error deleting task');
    }
}

// Clear filters
function clearFilters() {
    toggleAllCategories(false);
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterPriority').value = '';
    document.getElementById('searchTasks').value = '';
    document.getElementById('filterCreatedFrom').value = '';
    document.getElementById('filterCreatedTo').value = '';
    document.getElementById('filterDueFrom').value = '';
    document.getElementById('filterDueTo').value = '';
    
    // Clear saved filter state
    localStorage.removeItem('taskFilterState');
    
    filterTasks();
}

// Collapse all collapsible sections
function collapseAllSections() {
    const newTaskCollapse = new bootstrap.Collapse(document.getElementById('newTaskCollapse'), { toggle: false });
    const filterCollapse = new bootstrap.Collapse(document.getElementById('filterCollapse'), { toggle: false });
    const sortCollapse = new bootstrap.Collapse(document.getElementById('sortCollapse'), { toggle: false });
    
    newTaskCollapse.hide();
    filterCollapse.hide();
    sortCollapse.hide();
}

// Update bulk actions bar
function updateBulkActions() {
    const checkboxes = document.querySelectorAll('.task-checkbox:checked');
    const bulkActionsBar = document.getElementById('bulkActionsBar');
    const selectedCount = document.getElementById('selectedCount');
    
    if (checkboxes.length > 0) {
        bulkActionsBar.style.display = 'block';
        selectedCount.textContent = checkboxes.length;
    } else {
        bulkActionsBar.style.display = 'none';
    }
}

// Select all tasks
function selectAllTasks() {
    const checkboxes = document.querySelectorAll('.task-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    // Toggle: if all are checked, uncheck all; otherwise check all
    checkboxes.forEach(cb => cb.checked = !allChecked);
    
    // Update bulk actions
    updateBulkActions();
}

// Bulk delete selected tasks
async function bulkDelete() {
    const checkboxes = document.querySelectorAll('.task-checkbox:checked');
    const taskIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (taskIds.length === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${taskIds.length} task(s)?`)) return;
    
    try {
        // Delete all selected tasks
        const deletePromises = taskIds.map(taskId => 
            fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
        );
        
        await Promise.all(deletePromises);
        
        // Reload tasks
        await loadTasks();
        
        // Update bulk actions
        updateBulkActions();
        
        alert(`Successfully deleted ${taskIds.length} task(s).`);
    } catch (error) {
        console.error('Error bulk deleting tasks:', error);
        alert('Error deleting tasks');
    }
}

// Toggle AI action on selected tasks
async function toggleAIAction() {
    const checkboxes = document.querySelectorAll('.task-checkbox:checked');
    const taskIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (taskIds.length === 0) return;
    
    try {
        // Check if any selected tasks already have AI button
        const selectedTasks = allTasks.filter(task => taskIds.includes(task.id));
        const hasAIButtonTasks = selectedTasks.filter(task => task.has_ai_button);
        
        // Toggle: if any have AI button, remove from all; otherwise add to all
        const newStatus = hasAIButtonTasks.length > 0 ? false : true;
        
        // Update all selected tasks
        const updatePromises = taskIds.map(taskId => 
            fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ has_ai_button: newStatus })
            })
        );
        
        await Promise.all(updatePromises);
        
        // Reload tasks to reflect changes
        await loadTasks();
        
        // Uncheck all checkboxes
        checkboxes.forEach(cb => cb.checked = false);
        updateBulkActions();
        
        const actionText = newStatus ? 'enabled' : 'disabled';
        alert(`AI action ${actionText} on ${taskIds.length} task(s).`);
    } catch (error) {
        console.error('Error toggling AI action:', error);
        alert('Error toggling AI action');
    }
}

async function openFolder(folderPath) {
    try {
        const response = await fetch('/api/open-folder', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ path: folderPath }),
        });

        if (response.ok) {
            showToast('Folder opened successfully', 'success');
        } else {
            const error = await response.json();
            showToast(`Failed to open folder: ${error.detail}`, 'error');
        }
    } catch (error) {
        showToast('Failed to open folder', 'error');
    }
}

async function openTerminalInFolder(folderPath) {
    try {
        const response = await fetch('/api/open-terminal', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ path: folderPath }),
        });

        if (response.ok) {
            showToast('Terminal opened successfully', 'success');
        } else {
            const error = await response.json();
            showToast(`Failed to open terminal: ${error.detail}`, 'error');
        }
    } catch (error) {
        showToast('Failed to open terminal', 'error');
    }
}

// Setup drag and drop functionality
function setupDragAndDrop() {
    const taskCards = document.querySelectorAll('.task-card');
    
    taskCards.forEach(card => {
        // Make card draggable
        card.setAttribute('draggable', 'true');
        
        // Drag start
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', card.dataset.taskId);
            e.dataTransfer.effectAllowed = 'move';
        });
        
        // Drag end
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            // Remove drag-over class from all cards
            document.querySelectorAll('.task-card').forEach(c => {
                c.classList.remove('drag-over');
            });
        });
        
        // Drag over
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            // Add visual feedback
            document.querySelectorAll('.task-card').forEach(c => {
                c.classList.remove('drag-over');
            });
            card.classList.add('drag-over');
        });
        
        // Drag leave
        card.addEventListener('dragleave', (e) => {
            card.classList.remove('drag-over');
        });
        
        // Drop
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const draggedTaskId = e.dataTransfer.getData('text/plain');
            const targetTaskId = card.dataset.taskId;
            
            if (draggedTaskId !== targetTaskId) {
                reorderTasks(draggedTaskId, targetTaskId);
            }
            
            card.classList.remove('drag-over');
        });
    });
}

// Reorder tasks
async function reorderTasks(draggedTaskId, targetTaskId) {
    try {
        // Get current task order
        const tasksList = document.getElementById('tasksList');
        const taskCards = Array.from(tasksList.querySelectorAll('.task-card'));
        
        // Find indices
        const draggedIndex = taskCards.findIndex(card => card.dataset.taskId === draggedTaskId);
        const targetIndex = taskCards.findIndex(card => card.dataset.taskId === targetTaskId);
        
        // Get task objects in current order
        const currentOrder = [];
        taskCards.forEach(card => {
            const task = allTasks.find(t => t.id === card.dataset.taskId);
            if (task) currentOrder.push(task);
        });
        
        // Remove dragged task from current position
        const [draggedTask] = currentOrder.splice(draggedIndex, 1);
        
        // Insert dragged task at new position
        currentOrder.splice(targetIndex, 0, draggedTask);
        
        // Save new order to server
        await fetch('/api/tasks/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_order: currentOrder.map(t => t.id) })
        });
        
        // Reload tasks to reflect new order
        await loadTasks();
        
    } catch (error) {
        console.error('Error reordering tasks:', error);
        alert('Error reordering tasks');
    }
}

// Update task count
function updateTaskCount() {
    document.getElementById('taskCount').textContent = `${allTasks.length} task${allTasks.length !== 1 ? 's' : ''}`;
}

// Execute task
async function executeTask(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Show warning dialog before proceeding
    const confirmed = confirm(
        `⚠️ AI Task Execution Warning\n\n` +
        `You are about to trigger AI to execute this task:\n\n` +
        `Task: ${task.title}\n` +
        `Description: ${task.description || 'No description'}\n` +
        `Category: ${task.category}\n` +
        `Priority: ${task.priority}\n` +
        `Task Folder: ${task.folder_path}\n\n` +
        `The AI will analyze and execute this task. The task status will be set to 'Completed' after execution.\n\n` +
        `Do you want to proceed?`
    );
    
    if (!confirmed) return;
    
    console.log(`Executing task: ${task.title} (ID: ${task.id})`);
    
    // Disable execute button
    const button = event.target.closest('button');
    const originalHtml = button.innerHTML;
    button.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    button.disabled = true;
    
    try {
        // Call backend API to execute task
        const response = await fetch(`/api/tasks/${taskId}/execute`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            alert(`Failed to execute task: ${result.message || 'Unknown error'}`);
            button.innerHTML = originalHtml;
            button.disabled = false;
            return;
        }
        
        if (result.requires_permission) {
            // Task requires permission - ask user
            const permissionConfirmed = confirm(
                `This task requires permission to modify files outside the task folder.\n\n` +
                `Task: ${task.title}\n` +
                `Description: ${task.description || 'No description'}\n` +
                `Task Folder: ${task.folder_path}\n\n` +
                `Do you want to proceed with execution?`
            );
            
            if (permissionConfirmed) {
                // User confirmed - execute with permission
                await executeTaskWithPermission(taskId);
            }
        } else {
            // Auto-executed without permission
            alert(`Task execution started successfully!\n\nTask: ${task.title}\nStatus: ${result.result.message}`);
            // Reload tasks to update status
            await loadTasks();
        }
        
    } catch (error) {
        console.error('Error executing task:', error);
        alert('Error executing task');
    } finally {
        button.innerHTML = originalHtml;
        button.disabled = false;
    }
}

// Execute task after user confirmation
async function executeTaskWithPermission(taskId) {
    const task = allTasks.find(t => t.id === taskId);
    
    try {
        const response = await fetch(`/api/tasks/${taskId}/execute/confirm`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(`Task execution started successfully!\n\nTask: ${task.title}\nStatus: ${result.result.message}`);
            // Reload tasks to update status
            await loadTasks();
        } else {
            alert(`Failed to execute task: ${result.message || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error executing task:', error);
        alert('Error executing task');
    }
}

// User Profile Functions
let userProfile = null;
let editProfileModal;

// Load user profile
async function loadUserProfile() {
    try {
        const response = await fetch('/api/user-profile');
        userProfile = await response.json();
        updateProfileDisplay();
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

// Update profile display on the page
function updateProfileDisplay() {
    if (!userProfile) return;
    
    // Update name
    document.getElementById('profileName').textContent = userProfile.name || 'User';
    
    // Update avatar
    const avatarIcon = document.getElementById('avatarIcon');
    const avatarImage = document.getElementById('avatarImage');
    
    if (userProfile.avatar) {
        // Check if avatar is a file path or URL
        if (userProfile.avatar.startsWith('http') || userProfile.avatar.startsWith('/api/user-profile/avatar/')) {
            avatarImage.src = userProfile.avatar;
            avatarImage.classList.remove('d-none');
            avatarIcon.classList.add('d-none');
        } else if (userProfile.avatar.startsWith('data:image')) {
            // Base64 encoded image
            avatarImage.src = userProfile.avatar;
            avatarImage.classList.remove('d-none');
            avatarIcon.classList.add('d-none');
        } else {
            // File path
            avatarImage.src = `/api/user-profile/avatar/${userProfile.avatar.split('/').pop()}`;
            avatarImage.classList.remove('d-none');
            avatarIcon.classList.add('d-none');
        }
    } else {
        avatarImage.classList.add('d-none');
        avatarIcon.classList.remove('d-none');
    }
    
    // Update location
    const locationEl = document.getElementById('profileLocation');
    if (userProfile.location) {
        locationEl.innerHTML = `<i class="bi bi-geo-alt me-1"></i>${escapeHtml(userProfile.location)}`;
    } else {
        locationEl.innerHTML = `<i class="bi bi-geo-alt me-1"></i>Location not set`;
    }
    
    // Update data directory
    document.getElementById('dataDirectory').textContent = userProfile.data_directory || './data';
}

// Focus avatar upload when opening modal
function focusAvatarUpload() {
    setTimeout(() => {
        document.getElementById('profileAvatarUpload').focus();
    }, 300);
}

// Populate edit profile modal
function populateEditProfileModal() {
    if (!userProfile) return;
    
    // Populate form fields
    document.getElementById('profileNameInput').value = userProfile.name || '';
    document.getElementById('profileLocationInput').value = userProfile.location || '';
    document.getElementById('dataDirectoryInput').value = userProfile.data_directory || './data';
    
    // Update avatar preview
    const modalAvatarPreview = document.getElementById('modalAvatarPreview');
    const modalAvatarIcon = document.getElementById('modalAvatarIcon');
    
    const avatarIcon = document.getElementById('avatarIcon');
    const avatarImage = document.getElementById('avatarImage');
    
    if (!avatarIcon.classList.contains('d-none')) {
        modalAvatarPreview.classList.add('d-none');
        modalAvatarIcon.classList.remove('d-none');
    } else {
        modalAvatarPreview.src = avatarImage.src;
        modalAvatarPreview.classList.remove('d-none');
        modalAvatarIcon.classList.add('d-none');
    }
}

// Handle avatar upload
function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
    }
    
    // Check file type
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }
    
    // Read file and display preview
    const reader = new FileReader();
    reader.onload = function(e) {
        const modalAvatarPreview = document.getElementById('modalAvatarPreview');
        const modalAvatarIcon = document.getElementById('modalAvatarIcon');
        
        modalAvatarPreview.src = e.target.result;
        modalAvatarPreview.classList.remove('d-none');
        modalAvatarIcon.classList.add('d-none');
    };
    reader.readAsDataURL(file);
}

// Detect user location
async function detectLocation() {
    const locationInput = document.getElementById('profileLocationInput');
    
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }
    
    locationInput.value = 'Detecting...';
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            try {
                // Use reverse geocoding to get address
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                const data = await response.json();
                
                if (data && data.address) {
                    // Format address
                    const addressParts = [
                        data.address.city,
                        data.address.town,
                        data.address.village,
                        data.address.state,
                        data.address.country
                    ].filter(Boolean);
                    
                    locationInput.value = addressParts.join(', ');
                } else {
                    locationInput.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
                }
            } catch (error) {
                console.error('Error getting location name:', error);
                locationInput.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
            }
        },
        (error) => {
            console.error('Error getting location:', error);
            alert('Unable to retrieve your location. Please enter it manually.');
            locationInput.value = '';
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

// Save user profile
async function saveUserProfile() {
    const name = document.getElementById('profileNameInput').value.trim();
    const location = document.getElementById('profileLocationInput').value.trim();
    const dataDirectory = document.getElementById('dataDirectoryInput').value.trim();
    
    if (!name) {
        alert('Please enter a name');
        return;
    }
    
    const updateData = {
        name: name,
        location: location || null,
        data_directory: dataDirectory || './data'
    };
    
    // Check if avatar was uploaded
    const modalAvatarPreview = document.getElementById('modalAvatarPreview');
    if (!modalAvatarPreview.classList.contains('d-none')) {
        updateData.avatar = modalAvatarPreview.src;
    }
    
    try {
        const response = await fetch('/api/user-profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            userProfile = await response.json();
            updateProfileDisplay();
            
            // Close modal
            editProfileModal.hide();
            
            alert('Profile updated successfully!');
        } else {
            alert('Failed to update profile');
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Error saving profile');
    }
}

// AI Natural Language Parsing and Autofill
let parsedAutofillData = null;
let aiAutofillModal;

async function parseNaturalLanguageInput() {
    const input = document.getElementById('aiNaturalLanguageInput').value.trim();
    const parseButton = document.getElementById('aiParseButton');
    
    if (!input) {
        showToast('Please enter some text to parse', 'error');
        return;
    }
    
    try {
        // Show loading state
        parseButton.disabled = true;
        parseButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Parsing...';
        
        const response = await fetch('/api/parse-natural-language', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ input: input })
        });
        
        const result = await response.json();
        
        // Reset button state
        parseButton.disabled = false;
        parseButton.innerHTML = '<i class="bi bi-magic me-1"></i>Parse';
        
        if (response.ok && result.success) {
            parsedAutofillData = result.data;
            showAutofillConfirmation(parsedAutofillData);
        } else {
            showToast('Failed to parse input. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error parsing natural language:', error);
        showToast('Error parsing input. Please try again.', 'error');
        
        // Reset button state
        parseButton.disabled = false;
        parseButton.innerHTML = '<i class="bi bi-magic me-1"></i>Parse';
    }
}

function showAutofillConfirmation(parsedData) {
    const content = document.getElementById('aiAutofillContent');
    
    let html = '<p>The following forms will be autofilled:</p>';
    
    let hasData = false;
    
    // New Task section
    if (parsedData.new_task && Object.keys(parsedData.new_task).length > 0) {
        hasData = true;
        html += '<div class="mb-3"><h6>New Task</h6><ul class="list-unstyled">';
        for (const [key, value] of Object.entries(parsedData.new_task)) {
            if (value) {
                html += `<li><strong>${key}:</strong> ${escapeHtml(String(value))}</li>`;
            }
        }
        html += '</ul></div>';
    }
    
    // Filter section
    if (parsedData.filter && Object.keys(parsedData.filter).length > 0) {
        hasData = true;
        html += '<div class="mb-3"><h6>Filter Tasks</h6><ul class="list-unstyled">';
        for (const [key, value] of Object.entries(parsedData.filter)) {
            if (value) {
                html += `<li><strong>${key}:</strong> ${escapeHtml(String(value))}</li>`;
            }
        }
        html += '</ul></div>';
    }
    
    // Sort section
    if (parsedData.sort && Object.keys(parsedData.sort).length > 0) {
        hasData = true;
        html += '<div class="mb-3"><h6>Sort By</h6><ul class="list-unstyled">';
        for (const [key, value] of Object.entries(parsedData.sort)) {
            if (value) {
                html += `<li><strong>${key}:</strong> ${escapeHtml(String(value))}</li>`;
            }
        }
        html += '</ul></div>';
    }
    
    if (!hasData) {
        html += '<p class="text-muted">No data found to autofill. Please try again with a more specific input.</p>';
    }
    
    content.innerHTML = html;
    
    // Show modal
    if (!aiAutofillModal) {
        aiAutofillModal = new bootstrap.Modal(document.getElementById('aiAutofillConfirmModal'));
    }
    aiAutofillModal.show();
}

async function confirmAutofill() {
    if (!parsedAutofillData) return;
    
    try {
        // Apply new task data
        if (parsedAutofillData.new_task && Object.keys(parsedAutofillData.new_task).length > 0) {
            const nt = parsedAutofillData.new_task;
            
            if (nt.title) document.getElementById('taskTitle').value = nt.title;
            if (nt.category) document.getElementById('taskCategory').value = nt.category;
            if (nt.priority) document.getElementById('taskPriority').value = nt.priority;
            if (nt.due_date) document.getElementById('taskDueDate').value = nt.due_date;
            if (nt.description) document.getElementById('taskDescription').value = nt.description;
            
            // Auto-expand new task form
            const newTaskCollapse = new bootstrap.Collapse(document.getElementById('newTaskCollapse'));
            newTaskCollapse.show();
        }
        
        // Apply filter data
        if (parsedAutofillData.filter && Object.keys(parsedAutofillData.filter).length > 0) {
            const ft = parsedAutofillData.filter;
            
            if (ft.category) document.getElementById('filterCategory').value = ft.category;
            if (ft.status) document.getElementById('filterStatus').value = ft.status;
            if (ft.priority) document.getElementById('filterPriority').value = ft.priority;
            if (ft.search) document.getElementById('searchTasks').value = ft.search;
            if (ft.created_from) document.getElementById('filterCreatedFrom').value = ft.created_from;
            if (ft.created_to) document.getElementById('filterCreatedTo').value = ft.created_to;
            if (ft.due_from) document.getElementById('filterDueFrom').value = ft.due_from;
            if (ft.due_to) document.getElementById('filterDueTo').value = ft.due_to;
            
            // Auto-expand filter form
            const filterCollapse = new bootstrap.Collapse(document.getElementById('filterCollapse'));
            filterCollapse.show();
            
            // Apply filters
            filterTasks();
        }
        
        // Apply sort data
        if (parsedAutofillData.sort && Object.keys(parsedAutofillData.sort).length > 0) {
            const st = parsedAutofillData.sort;
            
            if (st.by) document.getElementById('sortBy').value = st.by;
            if (st.order) document.getElementById('sortOrder').value = st.order;
            
            // Auto-expand sort form
            const sortCollapse = new bootstrap.Collapse(document.getElementById('sortCollapse'));
            sortCollapse.show();
            
            // Apply sorting
            filterTasks();
        }
        
        // Hide modal and clear input
        aiAutofillModal.hide();
        document.getElementById('aiNaturalLanguageInput').value = '';
        parsedAutofillData = null;
        
        showToast('Forms autofilled successfully!', 'success');
    } catch (error) {
        console.error('Error applying autofill:', error);
        showToast('Error applying autofill. Please try again.', 'error');
    }
}

// Speech Recognition
let recognition = null;
let isListening = false;

function startSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('Speech recognition is not supported in your browser. Please use Chrome or Edge.', 'error');
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (isListening) {
        recognition.stop();
        return;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    let finalTranscript = '';
    
    recognition.onstart = function() {
        isListening = true;
        finalTranscript = '';
        const speechButton = document.getElementById('speechButton');
        speechButton.classList.remove('btn-outline-dark');
        speechButton.classList.add('btn-danger');
        speechButton.innerHTML = '<i class="bi bi-stop-circle me-1"></i>';
        showToast('Listening... Speak now.', 'info');
    };
    
    recognition.onresult = function(event) {
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        
        // Show interim results in the input field while speaking
        const displayText = finalTranscript || interimTranscript;
        if (displayText) {
            document.getElementById('aiNaturalLanguageInput').value = displayText;
        }
        
        // If we have final transcript, notify user
        if (finalTranscript) {
            console.log('Final transcript:', finalTranscript);
        }
    };
    
    recognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        let errorMessage = 'Speech recognition failed.';
        if (event.error === 'no-speech') {
            errorMessage = 'No speech detected. Please try again.';
        } else if (event.error === 'not-allowed') {
            errorMessage = 'Microphone access denied. Please allow microphone access.';
        } else if (event.error === 'network') {
            errorMessage = 'Network error. Please check your connection.';
        }
        showToast(errorMessage, 'error');
        resetSpeechButton();
    };
    
    recognition.onend = function() {
        resetSpeechButton();
        
        // Check if we have a final result to display
        if (finalTranscript) {
            document.getElementById('aiNaturalLanguageInput').value = finalTranscript;
            showToast('Speech recognized! Click Parse to continue.', 'success');
        }
    };
    
    recognition.start();
}

function resetSpeechButton() {
    isListening = false;
    const speechButton = document.getElementById('speechButton');
    speechButton.classList.remove('btn-danger');
    speechButton.classList.add('btn-outline-dark');
    speechButton.innerHTML = '<i class="bi bi-mic me-1"></i>';
}

// Initialize profile modal and event listeners
editProfileModal = new bootstrap.Modal(document.getElementById('editProfileModal'));

// Load user profile on page load
loadUserProfile();

// Event listeners for profile editing
document.getElementById('profileAvatarUpload').addEventListener('change', handleAvatarUpload);
document.getElementById('detectLocationBtn').addEventListener('click', detectLocation);
document.getElementById('saveProfileBtn').addEventListener('click', saveUserProfile);

// Canvas Assignments Functions
function loadCanvasAssignmentsFromStorage() {
    const storedAssignments = localStorage.getItem('canvasAssignments');
    
    if (storedAssignments) {
        try {
            const assignments = JSON.parse(storedAssignments);
            if (assignments && assignments.length > 0) {
                displayCanvasAssignments(assignments);
            }
        } catch (error) {
            console.error('Error loading Canvas assignments from storage:', error);
        }
    }
}

function saveCanvasAssignmentsToStorage(assignments) {
    try {
        localStorage.setItem('canvasAssignments', JSON.stringify(assignments));
        localStorage.setItem('canvasAssignmentsTimestamp', new Date().toISOString());
    } catch (error) {
        console.error('Error saving Canvas assignments to storage:', error);
    }
}

async function fetchCanvasAssignments() {
    const listElement = document.getElementById('canvasAssignmentsList');
    const loadingElement = document.getElementById('canvasAssignmentsLoading');
    const errorElement = document.getElementById('canvasAssignmentsError');
    
    // Show loading, hide error
    loadingElement.style.display = 'block';
    errorElement.style.display = 'none';
    
    try {
        const response = await fetch('/api/canvas-assignments');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Failed to fetch assignments');
        }
        
        displayCanvasAssignments(data.assignments);
        saveCanvasAssignmentsToStorage(data.assignments);
        showToast(`Loaded ${data.total} Canvas assignments`, 'success');
    } catch (error) {
        console.error('Error fetching Canvas assignments:', error);
        showCanvasError(error.message);
    } finally {
        loadingElement.style.display = 'none';
    }
}

function displayCanvasAssignments(assignments) {
    const listElement = document.getElementById('canvasAssignmentsList');
    
    if (!assignments || assignments.length === 0) {
        listElement.innerHTML = `
            <div class="text-center text-muted py-3">
                <small>No assignments found</small>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    assignments.forEach((assignment, index) => {
        const name = assignment.name || 'Unnamed Assignment';
        const courseName = assignment._course_name || 'Unknown Course';
        const points = assignment.points_possible || 0;
        const dueAt = assignment.due_at;
        const published = assignment.published;
        const submission = assignment.submission || {};
        const submissionState = submission.state || 'not submitted';
        const score = submission.score;
        const htmlUrl = assignment.html_url;
        
        // Format due date
        let dueDateDisplay = 'No due date';
        let isOverdue = false;
        if (dueAt) {
            const dueDate = new Date(dueAt);
            const now = new Date();
            isOverdue = dueDate < now && submissionState !== 'submitted' && submissionState !== 'graded';
            dueDateDisplay = dueDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        // Status badge
        let statusBadge = '';
        if (submissionState === 'submitted' || submissionState === 'graded') {
            statusBadge = '<span class="badge bg-success">Submitted</span>';
        } else if (isOverdue) {
            statusBadge = '<span class="badge bg-danger">Overdue</span>';
        } else if (dueAt) {
            statusBadge = '<span class="badge bg-warning text-dark">Pending</span>';
        } else {
            statusBadge = '<span class="badge bg-secondary">No Due Date</span>';
        }
        
        // Score display
        let scoreDisplay = '';
        if (score !== null && score !== undefined) {
            scoreDisplay = `<span class="text-success fw-bold">${score}/${points}</span>`;
        } else if (points > 0) {
            scoreDisplay = `<span class="text-muted">${points} pts</span>`;
        }
        
        // Published indicator
        const publishedIcon = published ? '' : '<i class="bi bi-eye-slash text-muted" title="Unpublished"></i> ';
        
        // Assignment name with link if available
        let nameDisplay = name;
        if (htmlUrl) {
            nameDisplay = `<a href="${htmlUrl}" target="_blank" class="text-decoration-none" title="Open in Canvas">${name} <i class="bi bi-box-arrow-up-right small"></i></a>`;
        }
        
        html += `
            <div class="canvas-assignment-item p-2 mb-2 border rounded ${isOverdue ? 'border-danger' : ''}" style="background: ${isOverdue ? '#fff5f5' : ''}">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <small class="text-muted d-block">${publishedIcon}${courseName}</small>
                        <div class="fw-semibold small mb-1">${nameDisplay}</div>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="${isOverdue ? 'text-danger' : 'text-muted'}">
                                <i class="bi bi-calendar3 me-1"></i>${dueDateDisplay}
                            </small>
                            <div class="d-flex gap-1 align-items-center">
                                ${statusBadge}
                                ${scoreDisplay ? `<small class="text-muted ms-1">${scoreDisplay}</small>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    listElement.innerHTML = html;
}

function showCanvasError(message) {
    const errorElement = document.getElementById('canvasAssignmentsError');
    const errorText = document.getElementById('canvasAssignmentsErrorText');
    const listElement = document.getElementById('canvasAssignmentsList');
    
    errorText.textContent = message;
    errorElement.style.display = 'block';
    listElement.innerHTML = `
        <div class="text-center text-muted py-3">
            <small>Failed to load assignments</small>
        </div>
    `;
}

function hideCanvasError() {
    document.getElementById('canvasAssignmentsError').style.display = 'none';
}

// Filter state persistence
function saveFilterState() {
    const filterState = {
        selectedCategories: getSelectedCategories(),
        status: document.getElementById('filterStatus').value,
        priority: document.getElementById('filterPriority').value,
        search: document.getElementById('searchTasks').value,
        createdFrom: document.getElementById('filterCreatedFrom').value,
        createdTo: document.getElementById('filterCreatedTo').value,
        dueFrom: document.getElementById('filterDueFrom').value,
        dueTo: document.getElementById('filterDueTo').value,
        sortBy: document.getElementById('sortBy').value,
        sortOrder: document.getElementById('sortOrder').value
    };
    localStorage.setItem('taskFilterState', JSON.stringify(filterState));
    console.log('Filter state saved:', filterState);
}

async function loadFilterState() {
    console.log('=== loadFilterState START ===');
    const savedState = localStorage.getItem('taskFilterState');
    console.log('Saved state from localStorage:', savedState);
    
    if (!savedState) {
        console.log('No saved filter state found');
        return { categories: [] };
    }
    
    try {
        const filterState = JSON.parse(savedState);
        console.log('Loading filter state:', filterState);
        console.log('Selected categories in saved state:', filterState.selectedCategories);
        
        // Restore status filter
        if (filterState.status) {
            document.getElementById('filterStatus').value = filterState.status;
        }
        
        // Restore priority filter
        if (filterState.priority) {
            document.getElementById('filterPriority').value = filterState.priority;
        }
        
        // Restore search
        if (filterState.search) {
            document.getElementById('searchTasks').value = filterState.search;
        }
        
        // Restore date filters
        if (filterState.createdFrom) {
            document.getElementById('filterCreatedFrom').value = filterState.createdFrom;
        }
        if (filterState.createdTo) {
            document.getElementById('filterCreatedTo').value = filterState.createdTo;
        }
        if (filterState.dueFrom) {
            document.getElementById('filterDueFrom').value = filterState.dueFrom;
        }
        if (filterState.dueTo) {
            document.getElementById('filterDueTo').value = filterState.dueTo;
        }
        
        // Restore sort options
        if (filterState.sortBy) {
            document.getElementById('sortBy').value = filterState.sortBy;
        }
        if (filterState.sortOrder) {
            document.getElementById('sortOrder').value = filterState.sortOrder;
        }
        
        // Return selected categories to be used in updateCategoryDropdown
        const selectedCategories = filterState.selectedCategories || [];
        console.log(`Returning ${selectedCategories.length} selected categories`);
        return { categories: selectedCategories };
    } catch (error) {
        console.error('Error loading filter state:', error);
        return { categories: [] };
    }
    console.log('=== loadFilterState END ===');
}

// Populate modal when opened
document.getElementById('editProfileModal').addEventListener('show.bs.modal', populateEditProfileModal);