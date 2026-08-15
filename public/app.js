async function saveSettings(event) {
  event.preventDefault();
  const newPassword = document.getElementById('newPassword').value;

  try {
    const res = await fetch('/api/settings/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Settings saved successfully!', 'success');
      document.getElementById('newPassword').value = '';
    } else {
      showToast(data.message || 'Failed to update settings', 'error');
    }
  } catch (err) {
    showToast('Server connection error', 'error');
  }
}

async function signOut() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  } catch (err) {
    window.location.href = '/login.html';
  }
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.innerText = msg;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}