// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', function() {
    loadStatistics();
    setupAutoRefresh();
});

// Load statistics from server
async function loadStatistics() {
    try {
        const response = await fetch('/api/statistics');
        const stats = await response.json();
        updateDashboard(stats);
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Update dashboard with statistics
function updateDashboard(stats) {
    console.log('Updating dashboard with stats:', stats);
    
    // Update stat cards
    animateValue('totalTasks', stats.total_tasks);
    animateValue('completedTasks', stats.completed_tasks);
    animateValue('inProgressTasks', stats.in_progress_tasks);
    animateValue('pendingTasks', stats.pending_tasks);
    
    // Update completion rate
    const completionRate = stats.completion_rate.toFixed(1);
    document.getElementById('completionRateBar').style.width = `${completionRate}%`;
    document.getElementById('completionRateBar').textContent = `${completionRate}%`;
    document.getElementById('completionRateText').textContent = `${completionRate}%`;
    
    // Update priority distribution
    document.getElementById('highPriorityCount').textContent = stats.tasks_by_priority.high || 0;
    document.getElementById('mediumPriorityCount').textContent = stats.tasks_by_priority.medium || 0;
    document.getElementById('lowPriorityCount').textContent = stats.tasks_by_priority.low || 0;
    
    // Update AI action distribution
    const aiEnabled = stats.ai_action_enabled || 0;
    const aiDisabled = stats.ai_action_disabled || 0;
    console.log('AI Action - Enabled:', aiEnabled, 'Disabled:', aiDisabled);
    updateAIActionChart(aiEnabled, aiDisabled);
    
    // Update category stats
    updateCategoryStats(stats.tasks_by_category);
}

// Update AI action pie chart
function updateAIActionChart(enabled, disabled) {
    console.log('updateAIActionChart called with:', enabled, disabled);
    
    const ctx = document.getElementById('aiActionChart');
    if (!ctx) {
        console.error('Canvas element not found');
        return;
    }
    
    // Update counts
    const enabledEl = document.getElementById('aiActionEnabled');
    const disabledEl = document.getElementById('aiActionDisabled');
    
    if (enabledEl) enabledEl.textContent = enabled;
    if (disabledEl) disabledEl.textContent = disabled;
    
    console.log('Updated UI - Enabled:', enabled, 'Disabled:', disabled);
    
    // Destroy existing chart if it exists
    if (window.aiActionChartInstance) {
        window.aiActionChartInstance.destroy();
        console.log('Destroyed existing chart');
    }
    
    // Don't create chart if no data
    if (enabled === 0 && disabled === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        console.log('No data, skipping chart creation');
        return;
    }
    
    // Check if Chart is available
    if (typeof Chart === 'undefined') {
        console.error('Chart.js is not loaded');
        return;
    }
    
    // Create new chart
    console.log('Creating new chart with data:', [enabled, disabled]);
    window.aiActionChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['AI Action Enabled', 'AI Action Disabled'],
            datasets: [{
                data: [enabled, disabled],
                backgroundColor: ['#198754', '#6c757d'],
                borderColor: ['#ffffff', '#ffffff'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
    
    console.log('Chart created successfully');
}

// Update category statistics display
function updateCategoryStats(categories) {
    const container = document.getElementById('categoryStats');
    
    const categoryEntries = Object.entries(categories);
    
    if (categoryEntries.length === 0) {
        container.innerHTML = '<p class="text-muted">No categories yet.</p>';
        return;
    }
    
    const maxTasks = Math.max(...Object.values(categories));
    
    container.innerHTML = categoryEntries.map(([category, count]) => {
        const percentage = (count / maxTasks * 100).toFixed(0);
        return `
            <div class="mb-3">
                <div class="d-flex justify-content-between mb-1">
                    <strong>${escapeHtml(category)}</strong>
                    <span>${count} task${count !== 1 ? 's' : ''}</span>
                </div>
                <div class="progress" style="height: 20px;">
                    <div class="progress-bar bg-dark" role="progressbar" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// Animate number changes
function animateValue(elementId, endValue) {
    const element = document.getElementById(elementId);
    const startValue = parseInt(element.textContent) || 0;
    const duration = 500;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function for smooth animation
        const easeOutQuad = t => t * (2 - t);
        const currentValue = Math.round(startValue + (endValue - startValue) * easeOutQuad(progress));
        
        element.textContent = currentValue;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Setup auto-refresh every 10 seconds
function setupAutoRefresh() {
    setInterval(loadStatistics, 10000);
}

// Refresh button handler
document.getElementById('refreshDashboard').addEventListener('click', function() {
    const btn = this;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Refreshing...';
    btn.disabled = true;
    
    loadStatistics().finally(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
});