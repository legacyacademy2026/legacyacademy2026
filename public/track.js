let currentPackage = null;

function getToken() {
  return new URLSearchParams(window.location.search).get('token');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function timeToMinutes(timeStr) {
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  let displayHours = hours % 12;
  if (displayHours === 0) displayHours = 12;
  const hh = String(displayHours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm} ${period}`;
}

function parseSessionDateTime(dateStr, timeStr) {
  const minutes = timeToMinutes(timeStr);
  const dt = new Date(dateStr);
  dt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return dt;
}

async function loadPackage() {
  const token = getToken();
  const card = document.getElementById('trackCard');

  if (!token) {
    card.innerHTML = '<p class="error-text">Invalid tracking link.</p>';
    return;
  }

  try {
    const res = await fetch(`/api/packages/track/${token}`);
    if (!res.ok) {
      card.innerHTML = '<p class="error-text">Package not found. Please check your link.</p>';
      return;
    }
    currentPackage = await res.json();
    renderPackage();
    loadSessions();
    renderRefundCard();

    const remaining = currentPackage.sessionsTotal - currentPackage.sessionsBooked;
    if (currentPackage.approvalStatus === 'Approved' && !currentPackage.finished && !currentPackage.expired && !currentPackage.frozen && remaining > 0) {
      document.getElementById('bookingCard').style.display = 'block';
      document.getElementById('sessionTimeLabel').textContent = `Time (${currentPackage.sessionDuration || 45} min)`;
      document.getElementById('sessionDate').addEventListener('change', refreshSessionTimes);
    }
  } catch (err) {
    card.innerHTML = '<p class="error-text">Could not load your package. Please try again later.</p>';
  }
}

function renderPackage() {
  const pkg = currentPackage;
  const card = document.getElementById('trackCard');
  const pending = pkg.sessionsTotal - pkg.sessionsCompleted;

  let approvalBadge = '';
  if (pkg.approvalStatus === 'Pending') {
    approvalBadge = '<div class="status-banner pending-banner">⏳ Waiting for Admin Approval</div>';
  } else if (pkg.approvalStatus === 'Approved') {
    if (pkg.expired) {
      approvalBadge = '<div class="status-banner rejected-banner">⌛ Package Expired — the 2-month validity period has ended.</div>';
    } else {
      approvalBadge = pkg.finished
        ? '<div class="status-banner approved-banner">🎉 Package Completed — Thank you!</div>'
        : '<div class="status-banner approved-banner">✅ Approved — Book your sessions below!</div>';
    }
  } else {
    approvalBadge = '<div class="status-banner rejected-banner">❌ This request was not approved. Please contact the academy.</div>';
  }

  card.innerHTML = `
    <h2>🐴 ${escapeHtml(pkg.name)}'s Package</h2>
    <p class="package-name">${escapeHtml(pkg.packageType)} — ${escapeHtml(pkg.tierLabel)}</p>
    ${approvalBadge}

    <div class="progress-ring-wrap">
      <svg class="progress-ring" viewBox="0 0 120 120">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#8a9b74"></stop>
            <stop offset="100%" stop-color="#5c6b47"></stop>
          </linearGradient>
        </defs>
        <circle class="ring-track" cx="60" cy="60" r="52"></circle>
        <circle class="ring-fill" cx="60" cy="60" r="52"
          style="stroke-dasharray:${2*Math.PI*52}; stroke-dashoffset:${(2*Math.PI*52)*(1 - (pkg.sessionsTotal ? pkg.sessionsCompleted/pkg.sessionsTotal : 0))}"></circle>
      </svg>
      <div class="ring-center">
        <span class="ring-num">${pkg.sessionsCompleted}<span class="ring-total">/${pkg.sessionsTotal}</span></span>
        <span class="ring-label">Sessions Done</span>
      </div>
    </div>

    <div class="progress-stats">
      <div class="progress-stat">
        <span class="progress-num">${pkg.sessionsCompleted}</span>
        <span class="progress-label">Completed</span>
      </div>
      <div class="progress-stat">
        <span class="progress-num">${pending}</span>
        <span class="progress-label">Remaining</span>
      </div>
      <div class="progress-stat">
        <span class="progress-num">${pkg.sessionsTotal}</span>
        <span class="progress-label">Total</span>
      </div>
    </div>

    <p class="package-detail-line">💰 Price: AED ${pkg.price} • Payment: ${pkg.paymentStatus} (${pkg.paymentMethod})</p>
    <p class="package-detail-line">📅 ${escapeHtml(pkg.validity)} • 🧊 ${escapeHtml(pkg.freeze)}</p>
    ${pkg.approvalStatus === 'Approved' && pkg.expiresAt ? `<p class="package-detail-line">${pkg.expired ? '⌛ Expired on' : (pkg.frozen ? '❄️ Frozen — validity paused. Was valid until' : '⏳ Valid until')}: ${new Date(pkg.expiresAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</p>` : ''}
    ${renderFreezeControls(pkg)}
    ${buildTerms(pkg)}
  `;
}

function renderFreezeControls(pkg) {
  if (pkg.approvalStatus !== 'Approved' || pkg.finished || pkg.expired) return '';
  const daysLeft = Math.max(0, 14 - Math.round(pkg.freezeDaysUsed || 0));
  const remaining = pkg.sessionsTotal - pkg.sessionsBooked;

  if (pkg.frozen) {
    return `<div class="status-banner frozen-banner" style="margin-top:14px;">❄️ Your package is frozen — booking is paused. Please contact us to unfreeze.</div>`;
  }
  if (pkg.freezeRequested) {
    return `<div class="status-banner pending-banner" style="margin-top:14px;">⏳ Your freeze request is awaiting admin approval.</div>`;
  }
  if (daysLeft > 0 && remaining > 0) {
    return `
      <div style="margin-top:16px; text-align:center;">
        <button class="btn-freeze" onclick="requestFreeze()">❄️ Request Freeze (${daysLeft} day${daysLeft===1?'':'s'} left)</button>
        <p class="sub-label" style="margin-top:6px; font-size:0.75rem; color:#9a938c;">For emergencies (e.g. travel). Pauses your validity — up to 14 days total.</p>
      </div>`;
  }
  return '';
}

async function requestFreeze() {
  if (!confirm('Request to freeze this package? Your remaining sessions and validity will be paused (up to 14 days total) once an admin approves.')) return;
  try {
    const res = await fetch(`/api/packages/${currentPackage._id}/request-freeze`, { method: 'POST' });
    const result = await res.json();
    alert(result.message);
    await loadPackage();
  } catch (err) {
    alert('Could not submit your freeze request. Please try again.');
  }
}

function buildTerms(pkg) {
  const multi = (pkg.sessionsTotal || 1) > 1;
  const lines = [];
  lines.push('Sessions must be cancelled at least <strong>24 hours</strong> in advance. Cancelled in time, the session returns to your balance to rebook within your validity period.');
  lines.push('No-shows and sessions cancelled less than 24 hours before start are marked completed and <strong>cannot be refunded or rearranged</strong>.');
  if (multi) {
    lines.push('This package is valid for <strong>2 months</strong> from the date of approval. Any unused sessions <strong>expire</strong> at the end of this period and are <strong>non-refundable</strong>.');
    lines.push('In case of emergency (e.g. travel), the package may be <strong>frozen</strong>, for a <strong>maximum of 14 days in total</strong>, which extends the validity by the frozen days. The 14-day allowance is the maximum and is intended for emergencies only.');
  }
  lines.push('All bookings are subject to availability and academy operating hours (6:00 AM – 5:00 PM).');
  return `
    <details class="terms-details">
      <summary>Terms &amp; Conditions</summary>
      <ul class="terms-list">
        ${lines.map(l => `<li>${l}</li>`).join('')}
      </ul>
    </details>`;
}

function renderRefundCard() {
  const pkg = currentPackage;
  const refundCard = document.getElementById('refundCard');
  const note = document.getElementById('refundNote');
  const btn = document.getElementById('refundButton');

  if (pkg.finished || pkg.approvalStatus === 'Rejected') {
    refundCard.style.display = 'none';
    return;
  }

  refundCard.style.display = 'block';

  if (pkg.refundStatus === 'Pending') {
    note.textContent = '⏳ Your cancellation/refund request is awaiting admin review.';
    btn.disabled = true;
    btn.textContent = 'Request Pending';
  } else if (pkg.refundStatus === 'Refunded') {
    note.textContent = '✅ This package has been refunded/closed.';
    btn.style.display = 'none';
  } else {
    note.textContent = 'Need to stop using this package entirely? You can request a cancellation below — our team will review it.';
    btn.disabled = false;
    btn.textContent = 'Cancel My Package / Request Refund';
  }
}

async function requestRefund() {
  if (!confirm('Are you sure you want to request cancellation of your whole package? This will be reviewed by our team.')) return;

  try {
    const res = await fetch(`/api/packages/${currentPackage._id}/request-refund`, { method: 'POST' });
    const result = await res.json();
    alert(result.message);
    await loadPackage();
  } catch (err) {
    alert('Could not submit your request. Please try again.');
  }
}

async function refreshSessionTimes() {
  const date = document.getElementById('sessionDate').value;
  const timeSelect = document.getElementById('sessionTime');
  const status = document.getElementById('bookingStatus');
  status.textContent = '';
  timeSelect.innerHTML = '';

  if (!date) {
    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option value="">-- Choose Date First --</option>';
    return;
  }

  let workEnd = 17 * 60;

  try {
    const closedRes = await fetch(`/api/closed-days/${date}`);
    const closedInfo = await closedRes.json();
    if (closedInfo) {
      if (closedInfo.type === 'Holiday') {
        timeSelect.disabled = true;
        timeSelect.innerHTML = '<option value="">-- Closed --</option>';
        status.textContent = '🚫 The academy is closed on this date. Please choose another date.';
        status.className = 'track-status error';
        return;
      }
      if (closedInfo.type === 'HalfDay' && closedInfo.closeTime) {
        workEnd = timeToMinutes(closedInfo.closeTime);
      }
    }
  } catch (err) {}

  let existingBookings = [];
  try {
    const res = await fetch(`/api/bookings/availability?date=${date}`);
    const data = await res.json();
    existingBookings = data.bookings || [];
  } catch (err) {}

  timeSelect.disabled = false;
  timeSelect.innerHTML = '<option value="">-- Choose a Time --</option>';

  const workStart = 6 * 60;
  const duration = currentPackage.sessionDuration || 45; // actual package duration (20, 30, 45, etc.)

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  let currentMinutes = -1;
  if (date === todayStr()) {
    const now = new Date();
    currentMinutes = now.getHours() * 60 + now.getMinutes();
  }

  let anyOptionAdded = false;
  for (let startMin = workStart; startMin + duration <= workEnd; startMin += 60) {
    if (currentMinutes !== -1 && startMin < currentMinutes) continue;
    const endMin = startMin + duration;
    const isBooked = existingBookings.some(b => {
      if (!b.startTime || typeof b.duration !== 'number') return false;
      const bStart = timeToMinutes(b.startTime);
      const bEnd = bStart + b.duration * 60;
      return startMin < bEnd && bStart < endMin;
    });

    const opt = document.createElement('option');
    opt.value = minutesToTime(startMin);
    opt.textContent = isBooked ? `${minutesToTime(startMin)} (Already Booked)` : `${minutesToTime(startMin)} - ${minutesToTime(endMin)}`;
    opt.disabled = isBooked;
    timeSelect.appendChild(opt);
    anyOptionAdded = true;
  }

  if (!anyOptionAdded) {
    status.textContent = 'No available times left for today. Please choose another date.';
    status.className = 'track-status error';
  }
}

async function bookSession() {
  const status = document.getElementById('bookingStatus');
  const date = document.getElementById('sessionDate').value;
  const startTime = document.getElementById('sessionTime').value;

  if (!date || !startTime) {
    status.textContent = '⚠️ Please pick a date and time.';
    status.className = 'track-status error';
    return;
  }

  try {
    const res = await fetch(`/api/packages/${currentPackage._id}/book-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, startTime })
    });
    const result = await res.json();

    if (!res.ok) {
      status.textContent = result.message;
      status.className = 'track-status error';
      return;
    }

    status.textContent = '✅ Session booked successfully!';
    status.className = 'track-status success';
    document.getElementById('sessionDate').value = '';
    document.getElementById('sessionTime').innerHTML = '<option value="">-- Choose Date First --</option>';

    await loadPackage();
  } catch (err) {
    status.textContent = '❌ Could not connect to server.';
    status.className = 'track-status error';
  }
}

async function loadSessions() {
  try {
    const res = await fetch(`/api/packages/${currentPackage._id}/sessions`);
    const sessions = await res.json();
    const card = document.getElementById('sessionsCard');
    const list = document.getElementById('sessionsList');

    if (sessions.length === 0) {
      list.innerHTML = '<p class="no-sessions-text">No sessions booked yet.</p>';
    } else {
      list.innerHTML = sessions.map(s => {
        const sessionTime = parseSessionDateTime(s.date, s.startTime);
        const hoursUntil = (sessionTime - new Date()) / (1000 * 60 * 60);
        const cancelStatus = s.cancellationStatus || 'None';
        const bookingStatus = s.status || 'Pending';

        let statusHtml = '';
        if (bookingStatus === 'Cancelled') {
          statusHtml = '<span class="session-status declined">❌ Declined — please choose another date</span>';
        } else if (bookingStatus === 'Completed') {
          statusHtml = '<span class="session-status completed">🎉 Completed</span>';
        } else if (bookingStatus === 'Confirmed') {
          statusHtml = '<span class="session-status approved">✅ Approved</span>';
        } else {
          statusHtml = '<span class="session-status pending">⏳ Pending Review</span>';
        }

        let actionHtml = '';
        if (bookingStatus === 'Cancelled' || bookingStatus === 'Completed') {
          actionHtml = '';
        } else if (cancelStatus === 'Pending') {
          actionHtml = `<span class="cancel-status-badge cancel-pending">Cancellation Requested</span>`;
        } else if (cancelStatus === 'Rejected') {
          actionHtml = `<span class="cancel-status-badge cancel-rejected">Cancel Request Declined</span>`;
        } else if (hoursUntil >= 24) {
          actionHtml = `<button class="btn-cancel-session" onclick="cancelSession('${s._id}')">Cancel</button>`;
        } else {
          actionHtml = `<span class="sub-label">Within 24h — can't cancel</span>`;
        }

        return `
          <div class="session-item">
            <span>${escapeHtml(s.date)} • ${escapeHtml(s.startTime)}</span>
            <span>${statusHtml} ${actionHtml}</span>
          </div>
        `;
      }).join('');
    }
    card.style.display = 'block';
  } catch (err) {
    console.log('Could not load sessions');
  }
}

async function cancelSession(bookingId) {
  if (!confirm('Request cancellation of this session? Our team will review it.')) return;

  try {
    const res = await fetch(`/api/bookings/${bookingId}/request-cancellation`, { method: 'POST' });
    const result = await res.json();
    alert(result.message);
    await loadSessions();
  } catch (err) {
    alert('Could not submit cancellation request.');
  }
}

loadPackage();