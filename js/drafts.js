async function loadDrafts() {
  const container = document.getElementById('draftsContainer');
  
  try {
    const response = await fetch('/api/drafts');
    const drafts = await response.json();

    if (drafts.length === 0) {
      container.innerHTML = `
        <div class="no-entries">
          <p>No drafts saved.</p>
          <p><a href="form.html">Go to form to create a new draft.</a></p>
        </div>
      `;
      return;
    }

    container.innerHTML = drafts.map(draft => `
      <div class="entry-card">
        <h3>${draft.name} - ${draft.month} ${draft.year}</h3>
        <p><strong>Position:</strong> ${draft.position}</p>
        <p><strong>College/School:</strong> ${draft.college}</p>
        <p><strong>Total Hours:</strong> ${draft.total_hours || 'N/A'}</p>
        <p><strong>Activities:</strong></p>
        <ul class="activity-list">
          ${draft.activities.map((act, i) => `<li>${act} (${draft.hoursPerWeek[i]} hrs/week)</li>`).join('')}
        </ul>
        <p><strong>Last saved:</strong> ${new Date(draft.created_at).toLocaleString()}</p>
        <div class="entry-meta">
          <span>Draft #${draft.id}</span>
          <button class="btn-delete" onclick="deleteDraft(${draft.id})">Delete</button>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading drafts:', error);
    container.innerHTML = '<p class="no-entries">Error loading drafts. Make sure the server is running.</p>';
  }
}

async function deleteDraft(id) {
  if (!confirm('Are you sure you want to delete this draft?')) return;

  try {
    const response = await fetch(`/api/drafts/${id}`, { method: 'DELETE' });
    const result = await response.json();
    
    if (result.success) {
      loadDrafts();
    } else {
      alert('Failed to delete draft');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error deleting draft');
  }
}

loadDrafts();