async function loadEntries() {
  const container = document.getElementById('entriesContainer');
  
  try {
    const response = await fetch('/api/submissions');
    const entries = await response.json();

    if (entries.length === 0) {
      container.innerHTML = `
        <div class="no-entries">
          <p>No entries found.</p>
          <p><a href="index.html">Go back to form</a></p>
        </div>
      `;
      return;
    }

    container.innerHTML = entries.map(entry => `
      <div class="entry-card">
        <h3>${entry.name} - ${entry.month} ${entry.year}</h3>
        <p><strong>Position:</strong> ${entry.position}</p>
        <p><strong>College/School:</strong> ${entry.college}</p>
        <p><strong>Declaration:</strong> ${entry.declaration_month || 'N/A'}</p>
        <p><strong>Total Hours:</strong> ${entry.total_hours || 'N/A'}</p>
        <p><strong>Activities:</strong></p>
        <ul class="activity-list">
          ${entry.activities.map((act, i) => `<li>${act} (${entry.hoursPerWeek[i]} hrs/week)</li>`).join('')}
        </ul>
        <p><strong>Submitted:</strong> ${new Date(entry.created_at).toLocaleString()}</p>
        <div class="entry-meta">
          <span>Entry #${entry.id}</span>
          <button class="btn-delete" onclick="deleteEntry(${entry.id})">Delete</button>
        </div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading entries:', error);
    container.innerHTML = '<p class="no-entries">Error loading entries. Make sure the server is running.</p>';
  }
}

async function deleteEntry(id) {
  if (!confirm('Are you sure you want to delete this entry?')) return;

  try {
    const response = await fetch(`/api/submissions/${id}`, { method: 'DELETE' });
    const result = await response.json();
    
    if (result.success) {
      loadEntries();
    } else {
      alert('Failed to delete entry');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error deleting entry');
  }
}

loadEntries();
