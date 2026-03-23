const canvas = document.getElementById('signatureCanvas');
const ctx = canvas.getContext('2d');
const placeholder = document.getElementById('sigPlaceholder');
let isDrawing = false;
let hasSignature = false;

function resizeCanvas() {
  const container = canvas.parentElement;
  canvas.width = container.offsetWidth;
  canvas.height = container.offsetHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseleave', stopDrawing);

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  startDrawing({ offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top });
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  draw({ offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top });
});

canvas.addEventListener('touchend', stopDrawing);

function startDrawing(e) {
  isDrawing = true;
  hasSignature = true;
  placeholder.style.display = 'none';
  ctx.beginPath();
  ctx.moveTo(e.offsetX, e.offsetY);
}

function draw(e) {
  if (!isDrawing) return;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#000';
  ctx.lineTo(e.offsetX, e.offsetY);
  ctx.stroke();
}

function stopDrawing() {
  isDrawing = false;
}

function clearSignature() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasSignature = false;
  placeholder.style.display = 'block';
}

function addActivity() {
  const container = document.getElementById('activitiesContainer');
  const index = container.children.length;
  const card = document.createElement('div');
  card.className = 'activity-card';
  card.dataset.index = index;
  card.innerHTML = `
    <button type="button" class="remove-btn" onclick="removeActivity(this)">&times;</button>
    <div class="form-row">
      <div class="form-group">
        <label>Activities (research, extension, etc.):</label>
        <input type="text" name="activity[]" placeholder="Describe the activity" required>
      </div>
      <div class="form-group" style="max-width: 200px;">
        <label>Hours per Week:</label>
        <input type="number" name="hours[]" min="0" max="168" placeholder="0" oninput="calculateTotal()" required>
      </div>
    </div>
  `;
  container.appendChild(card);
  updateRemoveButtons();
}

function removeActivity(btn) {
  const card = btn.closest('.activity-card');
  card.remove();
  updateRemoveButtons();
  calculateTotal();
}

function updateRemoveButtons() {
  const cards = document.querySelectorAll('.activity-card');
  cards.forEach((card, index) => {
    const btn = card.querySelector('.remove-btn');
    btn.style.display = cards.length > 1 ? 'block' : 'none';
  });
}

function calculateTotal() {
  const hours = document.querySelectorAll('input[name="hours[]"]');
  let total = 0;
  hours.forEach(input => {
    total += parseFloat(input.value) || 0;
  });
  const weeksInMonth = 4;
  document.getElementById('totalHours').value = total * weeksInMonth;
}

document.querySelectorAll('input[name="hours[]"]').forEach(input => {
  input.addEventListener('input', calculateTotal);
});

document.getElementById('declarationMonth').addEventListener('input', function() {
  const preview = document.getElementById('declarationPreview');
  preview.textContent = this.value || '_____';
});

document.getElementById('sigDate').valueAsDate = new Date();

function resetForm() {
  document.getElementById('cosForm').reset();
  clearSignature();
  
  const container = document.getElementById('activitiesContainer');
  container.innerHTML = `
    <div class="activity-card" data-index="0">
      <button type="button" class="remove-btn" onclick="removeActivity(this)" style="display: none;">&times;</button>
      <div class="form-row">
        <div class="form-group">
          <label>Activities (research, extension, etc.):</label>
          <input type="text" name="activity[]" placeholder="Describe the activity" required>
        </div>
        <div class="form-group" style="max-width: 200px;">
          <label>Hours per Week:</label>
          <input type="number" name="hours[]" min="0" max="168" placeholder="0" oninput="calculateTotal()" required>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('totalHours').value = '';
  document.getElementById('declarationPreview').textContent = '_____';
  document.getElementById('year').value = '2026';
  document.getElementById('sigDate').valueAsDate = new Date();
  updateRemoveButtons();
}

document.getElementById('cosForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  if (!hasSignature) {
    alert('Please provide your signature before submitting.');
    return;
  }

  const activities = Array.from(document.querySelectorAll('input[name="activity[]"]')).map(input => input.value);
  const hoursPerWeek = Array.from(document.querySelectorAll('input[name="hours[]"]')).map(input => input.value);
  const totalHours = document.getElementById('totalHours').value;
  const signatureData = canvas.toDataURL();

  const formData = {
    month: document.getElementById('month').value,
    year: document.getElementById('year').value,
    name: document.getElementById('name').value,
    position: document.getElementById('position').value,
    college: document.getElementById('college').value,
    activities: activities,
    hoursPerWeek: hoursPerWeek,
    totalHours: totalHours,
    declarationMonth: document.getElementById('declarationMonth').value,
    signatureData: signatureData,
    submissionDate: document.getElementById('sigDate').value
  };

  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const result = await response.json();
    if (result.success) {
      alert('Form submitted and saved successfully!');
      resetForm();
    } else {
      alert('Failed to save: ' + result.error);
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error submitting form. Please try again.');
  }
});

updateRemoveButtons();
