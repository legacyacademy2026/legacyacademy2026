const ADMIN_PASSWORD = "mervat2026"; // ⚠️ Change this!

const CATEGORIES = ['Riding Packages','Livery Horse','Horse Selling','Horse Training','Party Renting','Equipment for Sale'];
const CATEGORY_ICONS = {
  'Riding Packages': '🏇', 'Livery Horse': '🏠', 'Horse Selling': '💎',
  'Horse Training': '🐴', 'Party Renting': '🎉', 'Equipment for Sale': '🛍️'
};

let allBookingsCache = [];
let allCustomersCache = [];
let closedDaysCache = [];
let currentCalendarDate = new Date();
let selectedDay = todayStr();

window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('adminAuth') === 'true') showDashboard();
});

function checkPassword() {
  const entered = document.getElementById('passwordInput').value;
  if (entered === ADMIN_PASSWORD) {
    sessionStorage.setItem('adminAuth', 'true');
    showDashboard();
  } else {
    document.getElementById('errorText').style.display = 'block';
  }
}

document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') {
    checkPassword();
  }
});

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  loadBookings();
}

function logout() {
  sessionStorage.removeItem('adminAuth');
  location.reload();
}

async function switchView(view) {
  document.getElementById('bookingsView').style.display = view === 'bookings' ? 'block' : 'none';
  document.getElementById('customersView').style.display = view === 'customers' ? 'block' : 'none';
  document.getElementById('reportsView').style.display = view === 'reports' ? 'block' : 'none';
  document.getElementById('packagesView').style.display = view === 'packages' ? 'block' : 'none';
  document.getElementById('liveryView').style.display = view === 'livery' ? 'block' : 'none';
  document.getElementById('tabBookings').classList.toggle('active', view === 'bookings');
  document.getElementById('tabCustomers').classList.toggle('active', view === 'customers');
  document.getElementById('tabReports').classList.toggle('active', view === 'reports');
  document.getElementById('tabPackages').classList.toggle('active', view === 'packages');
  document.getElementById('tabLivery').classList.toggle('active', view === 'livery');

  if (view === 'customers') await loadCustomers();
  if (view === 'reports') {
    await loadCustomers();
    if (!document.getElementById('dailyReportDate').value) {
      document.getElementById('dailyReportDate').value = todayStr();
    }
    generateDailyReport();
    generateCustomerReport();
  }
  if (view === 'packages') await loadPackages();
  if (view === 'livery') await loadLivery();
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function timeToMinutes(timeStr) {
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function minutesToTimeLabel(totalMinutes) {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? 'PM' : 'AM';
  let displayHours = hours % 12;
  if (displayHours === 0) displayHours = 12;
  const hh = String(displayHours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm} ${period}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

async function loadBookings() {
  try {
    await loadClosedDays();
    const response = await fetch('/api/bookings');
    allBookingsCache = await response.json();
    renderStats();
    renderCalendar();
    renderDayControls(selectedDay);
    renderDailyBookings(selectedDay);
    renderTable();
  } catch (err) {
    alert('Could not load bookings. Is the server running?');
  }
}

async function loadClosedDays() {
  try {
    const res = await fetch('/api/closed-days');
    closedDaysCache = await res.json();
  } catch (err) {
    closedDaysCache = [];
  }
}

function getClosedInfo(dateStr) {
  return closedDaysCache.find(d => d.date === dateStr) || null;
}

function renderStats() {
  document.getElementById('statTotal').textContent = allBookingsCache.length;
  document.getElementById('statToday').textContent = allBookingsCache.filter(b => b.date === todayStr()).length;
  document.getElementById('statPending').textContent = allBookingsCache.filter(b => (b.status || 'Pending') === 'Pending').length;
  renderCancelRequestBanner();
}

function renderCancelRequestBanner() {
  const pending = allBookingsCache.filter(b => b.cancellationStatus === 'Pending');
  const banner = document.getElementById('cancelRequestBanner');

  if (pending.length === 0) {
    banner.innerHTML = '';
    return;
  }

  banner.innerHTML = `
    <div class="cancel-request-banner">
      <h4>⚠️ ${pending.length} Cancellation Request(s) Awaiting Your Review</h4>
      ${pending.map(b => `
        <div class="cancel-request-item">
          <span>${escapeHtml(b.name)} — ${escapeHtml(b.date)} ${escapeHtml(b.startTime)} (${escapeHtml(b.category)})</span>
          <span class="booking-actions">
            <button class="btn-small btn-cancel-approve" onclick="resolveCancellation('${b._id}', 'Approved')">✅ Approve</button>
            <button class="btn-small btn-cancel-reject" onclick="resolveCancellation('${b._id}', 'Rejected')">❌ Reject</button>
          </span>
        </div>
      `).join('')}
    </div>
  `;
}

async function resolveCancellation(id, decision) {
  try {
    await fetch(`/api/bookings/${id}/cancellation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision })
    });
    loadBookings();
  } catch (err) {
    alert('Could not update cancellation request.');
  }
}

function renderCalendar() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  document.getElementById('calendarMonthLabel').textContent =
    currentCalendarDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const countsByDate = {};
  allBookingsCache.forEach(b => { countsByDate[b.date] = (countsByDate[b.date] || 0) + 1; });

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const head = document.createElement('div');
    head.className = 'cal-weekday';
    head.textContent = d;
    grid.appendChild(head);
  });

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (dateStr === todayStr()) cell.classList.add('today');
    if (dateStr === selectedDay) cell.classList.add('selected');

    const closedInfo = getClosedInfo(dateStr);
    let statusIcon = '';
    if (closedInfo?.type === 'Holiday') { cell.classList.add('holiday'); statusIcon = '🚫'; }
    if (closedInfo?.type === 'HalfDay') { cell.classList.add('halfday'); statusIcon = '🌗'; }

    const count = countsByDate[dateStr] || 0;
    cell.innerHTML = `<span class="cal-day-num">${day}</span>` +
      (statusIcon ? `<span class="cal-status-icon">${statusIcon}</span>` : '') +
      (count > 0 ? `<span class="cal-count">${count}</span>` : '');
    cell.onclick = () => selectDay(dateStr);
    grid.appendChild(cell);
  }
}

function changeMonth(offset) {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
  renderCalendar();
}

function selectDay(dateStr) {
  selectedDay = dateStr;
  renderCalendar();
  renderDayControls(dateStr);
  renderDailyBookings(dateStr);
}

function renderDayControls(dateStr) {
  const info = getClosedInfo(dateStr);
  const container = document.getElementById('dayControls');

  if (info?.type === 'Holiday') {
    container.innerHTML = `
      <div class="day-status holiday-status">🚫 Marked as Holiday ${info.reason ? '— ' + escapeHtml(info.reason) : ''}</div>
      <button class="btn-small" onclick="removeClosedDay('${dateStr}')">Remove Holiday</button>
    `;
  } else if (info?.type === 'HalfDay') {
    container.innerHTML = `
      <div class="day-status halfday-status">🌗 Half Day — closes at ${info.closeTime}</div>
      <button class="btn-small" onclick="removeClosedDay('${dateStr}')">Remove Half Day</button>
    `;
  } else {
    container.innerHTML = `
      <button class="btn-small btn-holiday" onclick="markHoliday('${dateStr}')">🚫 Mark as Holiday</button>
      <button class="btn-small btn-halfday" onclick="showHalfDayPicker('${dateStr}')">🌗 Set Half Day</button>
      <div id="halfDayPicker" style="display:none; margin-top:8px;">
        <select id="halfDayCloseTime"></select>
        <button class="btn-small" onclick="saveHalfDay('${dateStr}')">Save</button>
      </div>
    `;
  }
}

async function markHoliday(dateStr) {
  const reason = prompt('Reason for holiday? (optional)', '') || '';
  await fetch('/api/closed-days', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: dateStr, type: 'Holiday', reason })
  });
  await loadBookings();
}

function showHalfDayPicker(dateStr) {
  const picker = document.getElementById('halfDayPicker');
  const select = document.getElementById('halfDayCloseTime');
  select.innerHTML = '';
  for (let h = 7; h <= 17; h++) {
    const label = minutesToTimeLabel(h * 60);
    const opt = document.createElement('option');
    opt.value = label;
    opt.textContent = label;
    select.appendChild(opt);
  }
  picker.style.display = 'block';
}

async function saveHalfDay(dateStr) {
  const closeTime = document.getElementById('halfDayCloseTime').value;
  await fetch('/api/closed-days', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: dateStr, type: 'HalfDay', closeTime })
  });
  await loadBookings();
}

async function removeClosedDay(dateStr) {
  await fetch(`/api/closed-days/${dateStr}`, { method: 'DELETE' });
  await loadBookings();
}

function renderDailyBookings(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  document.getElementById('dailyDateLabel').textContent =
    d.toLocaleDateString('default', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const dayBookings = allBookingsCache.filter(b => b.date === dateStr);
  const container = document.getElementById('dailyBookingsContainer');
  container.innerHTML = '';

  if (dayBookings.length === 0) {
    container.innerHTML = '<p class="no-bookings-text">No bookings for this day.</p>';
    return;
  }

  CATEGORIES.forEach(cat => {
    const inCat = dayBookings
      .filter(b => b.category === cat)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    if (inCat.length === 0) return;

    const section = document.createElement('div');
    section.className = 'category-section';
    section.innerHTML = `<h4>${CATEGORY_ICONS[cat] || '📌'} ${cat} (${inCat.length})</h4>`;

    inCat.forEach(b => {
      const status = b.status || 'Pending';
      const payment = b.paymentStatus || 'Unpaid';
      const card = document.createElement('div');
      card.className = 'mini-booking-card';
      card.innerHTML = `
        <div>
          <strong>${escapeHtml(b.name)}</strong> — ${b.startTime} (${b.duration}h) — AED ${(b.price||0).toFixed(0)}
          ${b.subPackage ? `<br><span class="sub-label">${escapeHtml(b.subPackage)}</span>` : ''}
        </div>
        <div class="booking-actions">
          <select class="payment-select payment-${payment.toLowerCase()}" onchange="updatePaymentStatus('${b._id}', this.value)">
            <option value="Unpaid" ${payment === 'Unpaid' ? 'selected' : ''}>💰 Unpaid</option>
            <option value="Paid" ${payment === 'Paid' ? 'selected' : ''}>✅ Paid</option>
          </select>
          <select class="status-select status-${status.toLowerCase()}" onchange="updateStatus('${b._id}', this.value)">
            <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Confirmed" ${status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="Cancelled" ${status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
          <button class="btn-small btn-edit" onclick="editBooking('${b._id}')">✏️ Edit</button>
        </div>
      `;
      section.appendChild(card);
    });

    container.appendChild(section);
  });
}

async function updateStatus(id, status) {
  try {
    await fetch(`/api/bookings/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadBookings();
  } catch (err) {
    alert('Could not update status.');
  }
}

async function updatePaymentStatus(id, paymentStatus) {
  try {
    await fetch(`/api/bookings/${id}/payment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentStatus })
    });
    loadBookings();
  } catch (err) {
    alert('Could not update payment status.');
  }
}

function renderTable() {
  const categoryFilter = document.getElementById('categoryFilter').value;
  const statusFilter = document.getElementById('statusFilter').value;
  const search = document.getElementById('searchInput').value.toLowerCase();

  let bookings = [...allBookingsCache];

  if (categoryFilter) bookings = bookings.filter(b => b.category === categoryFilter);
  if (statusFilter) bookings = bookings.filter(b => (b.status || 'Pending') === statusFilter);
  if (search) {
    bookings = bookings.filter(b =>
      (b.name || '').toLowerCase().includes(search) ||
      (b.email || '').toLowerCase().includes(search) ||
      (b.phone || '').toLowerCase().includes(search)
    );
  }

  bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const tbody = document.getElementById('bookingsBody');
  const emptyText = document.getElementById('emptyText');
  const countText = document.getElementById('countText');
  tbody.innerHTML = '';

  if (bookings.length === 0) {
    emptyText.style.display = 'block';
    countText.textContent = '0 bookings';
    return;
  }

  emptyText.style.display = 'none';
  countText.textContent = `${bookings.length} booking(s)`;

  bookings.forEach(b => {
    const status = b.status || 'Pending';
    const payment = b.paymentStatus || 'Unpaid';
    const row = document.createElement('tr');
    const submitted = new Date(b.createdAt).toLocaleString();
    row.innerHTML = `
      <td>${escapeHtml(b.name)}</td>
      <td>${escapeHtml(b.email)}</td>
      <td>${escapeHtml(b.phone)}</td>
      <td>${escapeHtml(b.category)}</td>
      <td>${escapeHtml(b.subPackage || '-')}</td>
      <td>${escapeHtml(b.date)}</td>
      <td>${escapeHtml(b.startTime)} (${b.duration}h)</td>
      <td>AED ${(b.price || 0).toFixed(0)}</td>
      <td><span class="payment-badge payment-${payment.toLowerCase()}">${payment}</span></td>
      <td><span class="status-badge status-${status.toLowerCase()}">${status}</span></td>
      <td>${submitted}</td>
      <td class="booking-actions">
        <button class="btn-small btn-edit" onclick="editBooking('${b._id}')">Edit</button>
        <button class="delete-btn" onclick="deleteBooking('${b._id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function deleteBooking(id) {
  if (!confirm('Delete this booking permanently?')) return;
  try {
    const response = await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
    if (response.ok) loadBookings();
    else alert('Could not delete booking.');
  } catch (err) {
    alert('Error deleting booking.');
  }
}

function editBooking(id) {
  const b = allBookingsCache.find(x => x._id === id);
  if (!b) return;
  const status = b.status || 'Pending';
  const payment = b.paymentStatus || 'Unpaid';

  const html = `
    <h3>Edit Booking</h3>
    <div class="edit-form">
      <label>Full Name</label>
      <input type="text" id="editBName" value="${escapeHtml(b.name)}">

      <label>Email</label>
      <input type="email" id="editBEmail" value="${escapeHtml(b.email)}">

      <label>Phone</label>
      <input type="text" id="editBPhone" value="${escapeHtml(b.phone)}">

      <label>Service</label>
      <select id="editBCategory">
        ${CATEGORIES.map(c => `<option value="${c}" ${b.category === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>

      <label>Package / Notes</label>
      <input type="text" id="editBSubPackage" value="${escapeHtml(b.subPackage || '')}">

      <label>Date</label>
      <input type="date" id="editBDate" value="${b.date}">

      <label>Duration</label>
      <select id="editBDuration">
        <option value="1" ${b.duration === 1 ? 'selected' : ''}>1 Hour</option>
        <option value="2" ${b.duration === 2 ? 'selected' : ''}>2 Hours</option>
        <option value="4" ${b.duration === 4 ? 'selected' : ''}>4 Hours</option>
      </select>

      <label>Start Time (e.g. 09:00 AM)</label>
      <input type="text" id="editBStartTime" value="${escapeHtml(b.startTime)}">

      <label>Price (AED)</label>
      <input type="number" id="editBPrice" value="${b.price || 0}" min="0" step="1">

      <label>Payment Status</label>
      <select id="editBPayment">
        <option value="Unpaid" ${payment === 'Unpaid' ? 'selected' : ''}>💰 Unpaid</option>
        <option value="Paid" ${payment === 'Paid' ? 'selected' : ''}>✅ Paid</option>
      </select>

      <label>Status</label>
      <select id="editBStatus">
        <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="Confirmed" ${status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
        <option value="Cancelled" ${status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
      </select>

      <label>Message / Notes</label>
      <textarea id="editBMessage" rows="3">${escapeHtml(b.message || '')}</textarea>

      <button class="btn-save" onclick="saveBookingEdit('${id}')">Save Changes</button>
    </div>
  `;
  openModal(html);
}

async function saveBookingEdit(id) {
  const updated = {
    name: document.getElementById('editBName').value.trim(),
    email: document.getElementById('editBEmail').value.trim(),
    phone: document.getElementById('editBPhone').value.trim(),
    category: document.getElementById('editBCategory').value,
    subPackage: document.getElementById('editBSubPackage').value.trim(),
    date: document.getElementById('editBDate').value,
    duration: parseInt(document.getElementById('editBDuration').value),
    startTime: document.getElementById('editBStartTime').value.trim(),
    price: parseFloat(document.getElementById('editBPrice').value) || 0,
    paymentStatus: document.getElementById('editBPayment').value,
    status: document.getElementById('editBStatus').value,
    message: document.getElementById('editBMessage').value.trim()
  };

  try {
    const res = await fetch(`/api/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    const result = await res.json();

    if (res.status === 409) {
      alert(result.message);
      return;
    }
    if (!res.ok) {
      alert(result.message || 'Could not save changes.');
      return;
    }

    closeModal();
    loadBookings();
  } catch (err) {
    alert('Could not save changes.');
  }
}

async function loadCustomers() {
  try {
    const res = await fetch('/api/customers');
    allCustomersCache = await res.json();
    renderCustomers();
  } catch (err) {
    alert('Could not load customers.');
  }
}

function renderCustomers() {
  const search = document.getElementById('customerSearch').value.toLowerCase();
  let customers = [...allCustomersCache];

  if (search) {
    customers = customers.filter(c =>
      c.name.toLowerCase().includes(search) ||
      c.email.toLowerCase().includes(search) ||
      (c.phone || '').toLowerCase().includes(search)
    );
  }

  customers.sort((a, b) => a.name.localeCompare(b.name));

  const tbody = document.getElementById('customersBody');
  const emptyText = document.getElementById('customersEmptyText');
  const countText = document.getElementById('customerCountText');
  tbody.innerHTML = '';

  if (customers.length === 0) {
    emptyText.style.display = 'block';
    countText.textContent = '0 customers';
    return;
  }

  emptyText.style.display = 'none';
  countText.textContent = `${customers.length} customer(s)`;

  customers.forEach(c => {
    const bookingsForCustomer = allBookingsCache.filter(b => b.email === c.email);
    const servicesUsed = [...new Set(bookingsForCustomer.map(b => b.category))].join(', ') || '-';
    const since = new Date(c.createdAt).toLocaleDateString();

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>${escapeHtml(c.email)}</td>
      <td>${escapeHtml(c.phone || '-')}</td>
      <td>${bookingsForCustomer.length}</td>
      <td>${escapeHtml(servicesUsed)}</td>
      <td>${since}</td>
      <td class="booking-actions">
        <button class="btn-small btn-view" onclick="viewCustomerHistory('${c._id}')">History</button>
        <button class="btn-small btn-edit" onclick="editCustomer('${c._id}')">Edit</button>
        <button class="delete-btn" onclick="deleteCustomer('${c._id}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

async function viewCustomerHistory(id) {
  try {
    const res = await fetch(`/api/customers/${id}`);
    const data = await res.json();
    const { customer, timeline, totalPaid } = data;

    let html = `
      <h3>${escapeHtml(customer.name)}'s Full History</h3>
      <p class="modal-subtext">${escapeHtml(customer.email)} • ${escapeHtml(customer.phone || 'No phone')}</p>
      <p class="sub-label" style="margin-bottom:14px;"><strong>💰 Total Paid (All Time): AED ${totalPaid.toFixed(0)}</strong></p>
    `;

    if (!timeline || timeline.length === 0) {
      html += '<p class="no-bookings-text">No history yet.</p>';
    } else {
      html += '<div class="history-list">';
      timeline.forEach(t => {
        const dateLabel = t.date ? new Date(t.date).toLocaleDateString() : '-';
        const statusClass = (t.status || 'pending').toLowerCase();
        const payClass = (t.paymentStatus || 'unpaid').toLowerCase().replace(/\s+/g, '');
        html += `
          <div class="history-item">
            <div>
              <strong>${t.icon || '📌'} ${escapeHtml(t.type)}</strong> — ${escapeHtml(t.label)}
              ${t.horseName ? `<br><span class="sub-label">🐴 ${escapeHtml(t.horseName)}</span>` : ''}
              <br><span class="sub-label">${dateLabel} • AED ${(t.amount || 0).toFixed(0)}${t.extra ? ' • ' + escapeHtml(t.extra) : ''}</span>
            </div>
            <div style="text-align:right;">
              <span class="status-badge status-${statusClass}">${escapeHtml(t.status || '-')}</span><br>
              <span class="payment-badge payment-${payClass}" style="margin-top:4px; display:inline-block;">${escapeHtml(t.paymentStatus || '-')}</span>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    openModal(html);
  } catch (err) {
    alert('Could not load customer history.');
  }
}

function editCustomer(id) {
  const customer = allCustomersCache.find(c => c._id === id);
  if (!customer) return;

  const html = `
    <h3>Edit Customer</h3>
    <div class="edit-form">
      <label>Name</label>
      <input type="text" id="editName" value="${escapeHtml(customer.name)}">
      <label>Phone</label>
      <input type="text" id="editPhone" value="${escapeHtml(customer.phone || '')}">
      <label>Notes</label>
      <textarea id="editNotes" rows="3">${escapeHtml(customer.notes || '')}</textarea>
      <button class="btn-save" onclick="saveCustomerEdit('${id}')">Save Changes</button>
    </div>
  `;
  openModal(html);
}

async function saveCustomerEdit(id) {
  const name = document.getElementById('editName').value.trim();
  const phone = document.getElementById('editPhone').value.trim();
  const notes = document.getElementById('editNotes').value.trim();

  try {
    await fetch(`/api/customers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, notes })
    });
    closeModal();
    loadCustomers();
  } catch (err) {
    alert('Could not save changes.');
  }
}

async function deleteCustomer(id) {
  if (!confirm('Delete this customer profile? (Their past booking records will stay.)')) return;
  try {
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
    if (res.ok) loadCustomers();
    else alert('Could not delete customer.');
  } catch (err) {
    alert('Error deleting customer.');
  }
}

function generateDailyReport() {
  const date = document.getElementById('dailyReportDate').value;
  if (!date) { alert('Please pick a date'); return; }

  const dayBookings = allBookingsCache.filter(b => b.date === date);
  const totalRevenue = dayBookings.reduce((sum, b) => sum + (b.price || 0), 0);

  const byCategory = {};
  CATEGORIES.forEach(cat => {
    const catBookings = dayBookings.filter(b => b.category === cat);
    byCategory[cat] = {
      count: catBookings.length,
      revenue: catBookings.reduce((sum, b) => sum + (b.price || 0), 0)
    };
  });

  const byStatus = { Pending: 0, Confirmed: 0, Cancelled: 0 };
  dayBookings.forEach(b => { byStatus[b.status || 'Pending']++; });

  document.getElementById('dailyReportResult').innerHTML = `
    <div class="report-summary">
      <div class="report-stat"><span class="report-num">${dayBookings.length}</span><span>Total Bookings</span></div>
      <div class="report-stat"><span class="report-num">AED ${totalRevenue.toFixed(0)}</span><span>Total Revenue</span></div>
    </div>
    <table class="report-table">
      <thead><tr><th>Service</th><th>Bookings</th><th>Revenue</th></tr></thead>
      <tbody>
        ${CATEGORIES.map(cat => `<tr><td>${CATEGORY_ICONS[cat]} ${cat}</td><td>${byCategory[cat].count}</td><td>AED ${byCategory[cat].revenue.toFixed(0)}</td></tr>`).join('')}
      </tbody>
    </table>
    <p class="report-status-line">Status: ✅ ${byStatus.Confirmed} Confirmed • ⏳ ${byStatus.Pending} Pending • ❌ ${byStatus.Cancelled} Cancelled</p>
  `;
}

function generateMonthlyReport() {
  const monthValue = document.getElementById('monthlyReportMonth').value;
  if (!monthValue) { alert('Please pick a month'); return; }

  const monthBookings = allBookingsCache.filter(b => b.date.startsWith(monthValue));
  const totalRevenue = monthBookings.reduce((sum, b) => sum + (b.price || 0), 0);
  const uniqueCustomers = new Set(monthBookings.map(b => b.email)).size;

  const byCategory = {};
  CATEGORIES.forEach(cat => {
    const catBookings = monthBookings.filter(b => b.category === cat);
    byCategory[cat] = {
      count: catBookings.length,
      revenue: catBookings.reduce((sum, b) => sum + (b.price || 0), 0)
    };
  });

  document.getElementById('monthlyReportResult').innerHTML = `
    <div class="report-summary">
      <div class="report-stat"><span class="report-num">${monthBookings.length}</span><span>Total Bookings</span></div>
      <div class="report-stat"><span class="report-num">AED ${totalRevenue.toFixed(0)}</span><span>Total Revenue</span></div>
      <div class="report-stat"><span class="report-num">${uniqueCustomers}</span><span>Unique Customers</span></div>
    </div>
    <table class="report-table">
      <thead><tr><th>Service</th><th>Bookings</th><th>Revenue</th></tr></thead>
      <tbody>
        ${CATEGORIES.map(cat => `<tr><td>${CATEGORY_ICONS[cat]} ${cat}</td><td>${byCategory[cat].count}</td><td>AED ${byCategory[cat].revenue.toFixed(0)}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}

function generateCustomerReport() {
  const rows = allCustomersCache.map(c => {
    const bookings = allBookingsCache.filter(b => b.email === c.email);
    const revenue = bookings.reduce((sum, b) => sum + (b.price || 0), 0);
    const lastVisit = bookings.length > 0 ? bookings.map(b => b.date).sort().reverse()[0] : '-';
    return { name: c.name, bookings: bookings.length, revenue, lastVisit };
  });

  rows.sort((a, b) => b.revenue - a.revenue);

  document.getElementById('customerReportResult').innerHTML = `
    <table class="report-table">
      <thead><tr><th>#</th><th>Customer</th><th>Bookings</th><th>Revenue</th><th>Last Visit</th></tr></thead>
      <tbody>
        ${rows.map((r, i) => `<tr><td>${i+1}</td><td>${escapeHtml(r.name)}</td><td>${r.bookings}</td><td>AED ${r.revenue.toFixed(0)}</td><td>${r.lastVisit}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}
let allPackagesCache = [];

async function loadPackages() {
  try {
    const res = await fetch('/api/packages');
    allPackagesCache = await res.json();
    renderPackages();
  } catch (err) {
    alert('Could not load packages.');
  }
}

function renderPackages() {
  const statusFilter = document.getElementById('packageStatusFilter').value;
  const showFinished = document.getElementById('showFinishedPackages').checked;

  let packages = [...allPackagesCache];

  if (!showFinished) packages = packages.filter(p => !p.finished);
  if (statusFilter) packages = packages.filter(p => p.approvalStatus === statusFilter);

  packages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const container = document.getElementById('packagesContainer');
  document.getElementById('packageCountText').textContent = `${packages.length} package(s)`;

  if (packages.length === 0) {
    container.innerHTML = '<p class="no-bookings-text">No packages to show.</p>';
    return;
  }

  container.innerHTML = packages.map(p => {
    const pending = p.sessionsTotal - p.sessionsCompleted;
    const percent = Math.round((p.sessionsCompleted / p.sessionsTotal) * 100);
    const approvalClass = p.approvalStatus.toLowerCase();

    let actionButtons = '';
    if (p.approvalStatus === 'Pending') {
      actionButtons += `<button class="btn-small btn-approve" onclick="approvePackage('${p._id}')">✅ Approve</button>`;
      actionButtons += `<button class="btn-small btn-reject" onclick="rejectPackage('${p._id}')">❌ Reject</button>`;
    }
    if (p.approvalStatus === 'Approved' && !p.finished) {
      actionButtons += `<button class="btn-small btn-approve" onclick="incrementSession('${p._id}')">+1 Session Completed</button>`;
    }
    if (p.paymentStatus === 'Unpaid') {
      actionButtons += `<button class="btn-small btn-paid" onclick="markPackagePaid('${p._id}')">💰 Mark Paid</button>`;
    }
    if (!p.finished) {
      actionButtons += `<button class="btn-small btn-finish" onclick="finishPackage('${p._id}')">📁 Mark Finished</button>`;
    }
    if (p.refundStatus === 'Pending') {
      actionButtons += `<button class="btn-small btn-mark-refunded" onclick="markRefunded('${p._id}')">💸 Mark Refunded</button>`;
    }

    return `
      <div class="package-card">
        <div class="package-card-top">
          <div>
            <div class="package-card-title">${escapeHtml(p.name)}</div>
            <div class="package-card-sub">${escapeHtml(p.packageType)} — ${escapeHtml(p.tierLabel)}</div>
            <div class="package-card-contact">${escapeHtml(p.email)} • ${escapeHtml(p.phone)}</div>
          </div>
          <div>
            <span class="approval-badge approval-${approvalClass}">${p.approvalStatus}</span>
            <span class="payment-badge payment-${p.paymentStatus.toLowerCase()}">${p.paymentStatus} (${p.paymentMethod})</span>
            ${p.finished ? '<span class="approval-badge" style="background:#e8e0d5;color:#555;">Finished</span>' : ''}
            ${p.refundStatus && p.refundStatus !== 'Not Applicable' ? `<span class="refund-status-badge refund-${p.refundStatus.toLowerCase()}">${p.refundStatus === 'Pending' ? '⏳ Refund Requested' : '💸 Refunded'}</span>` : ''}
            ${p.refundStatus === 'Pending' ? `<p class="payment-method-note">${p.paymentMethod === 'Card' ? '💳 Paid by card — process the refund in your payment system, then mark it Refunded here.' : '💵 Paid by cash — settle directly with the customer, then mark it Refunded here.'}</p>` : ''}
          </div>
        </div>

        <div class="package-progress-row">
          <div class="package-progress-bar"><div class="package-progress-fill" style="width:${percent}%"></div></div>
          <div class="package-progress-text">${p.sessionsCompleted} done • ${pending} pending of ${p.sessionsTotal}</div>
        </div>

        <p class="sub-label">💰 AED ${p.price} • 📅 ${escapeHtml(p.validity)} • 🧊 ${escapeHtml(p.freeze)}</p>
        <p class="sub-label">🔗 Tracking link: ${window.location.origin}/track.html?token=${p.token}</p>

        <div class="package-actions">
          ${actionButtons}
          <button class="btn-small" onclick="toggleSessionsList('${p._id}')">📋 View/Manage Sessions</button>
        </div>
        <div id="sessionsList-${p._id}" style="display:none; margin-top:12px;"></div>
      </div>
    `;
  }).join('');
}

async function approvePackage(id) {
  await fetch(`/api/packages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalStatus: 'Approved' })
  });
  loadPackages();
}

async function rejectPackage(id) {
  if (!confirm('Reject this package request?')) return;
  await fetch(`/api/packages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalStatus: 'Rejected' })
  });
  loadPackages();
}

async function markPackagePaid(id) {
  await fetch(`/api/packages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentStatus: 'Paid' })
  });
  loadPackages();
}

async function incrementSession(id) {
  const pkg = allPackagesCache.find(p => p._id === id);
  if (!pkg) return;
  const newCompleted = Math.min(pkg.sessionsCompleted + 1, pkg.sessionsTotal);
  const updates = { sessionsCompleted: newCompleted };
  if (newCompleted >= pkg.sessionsTotal) updates.finished = true;

  await fetch(`/api/packages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  loadPackages();
}

async function finishPackage(id) {
  if (!confirm('Mark this package as finished? It will move out of the active list but stay saved under the customer.')) return;
  await fetch(`/api/packages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ finished: true })
  });
  loadPackages();
}
async function markRefunded(id) {
  if (!confirm('Confirm that you have processed this refund? This is just for your records — it does not move any money.')) return;
  await fetch(`/api/packages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refundStatus: 'Refunded' })
  });
  loadPackages();
}
function toggleSessionsList(packageId) {
  const container = document.getElementById(`sessionsList-${packageId}`);
  if (!container) return;
  if (container.style.display === 'block') {
    container.style.display = 'none';
  } else {
    container.style.display = 'block';
    loadSessionsForPackage(packageId);
  }
}

async function loadSessionsForPackage(packageId) {
  const container = document.getElementById(`sessionsList-${packageId}`);
  container.innerHTML = '<p class="sub-label">Loading sessions...</p>';
  try {
    const res = await fetch(`/api/packages/${packageId}/sessions`);
    const sessions = await res.json();

    if (sessions.length === 0) {
      container.innerHTML = '<p class="no-bookings-text">No sessions booked yet.</p>';
      return;
    }

    container.innerHTML = sessions.map(s => {
      const status = s.status || 'Pending';
      return `
        <div class="mini-booking-card">
          <div>📅 ${escapeHtml(s.date)} • 🕐 ${escapeHtml(s.startTime)}</div>
          <select class="status-select status-${status.toLowerCase()}" onchange="updateSessionStatus('${s._id}', this.value, '${packageId}')">
            <option value="Pending" ${status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="Confirmed" ${status === 'Confirmed' ? 'selected' : ''}>Confirmed (Approved)</option>
            <option value="Cancelled" ${status === 'Cancelled' ? 'selected' : ''}>Cancelled (Declined)</option>
            <option value="Completed" ${status === 'Completed' ? 'selected' : ''}>Completed ✅</option>
          </select>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<p class="error-text">Could not load sessions.</p>';
  }
}

async function updateSessionStatus(bookingId, status, packageId) {
  try {
    await fetch(`/api/bookings/${bookingId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadSessionsForPackage(packageId);
  } catch (err) {
    alert('Could not update session status.');
  }
}
// ===================== LIVERY =====================
let allLiveryCache = [];

async function loadLivery() {
  try {
    const res = await fetch('/api/livery');
    allLiveryCache = await res.json();
    renderLiverySlots();
  } catch (err) {
    alert('Could not load livery bookings.');
  }
}

function daysRemainingFor(booking) {
  if (booking.approvalStatus !== 'Approved' || !booking.endDate) return null;
  const ms = new Date(booking.endDate) - new Date();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function renderLiverySlots() {
  const grid = document.getElementById('liverySlotsGrid');
  const totalSlots = 10;

  // Active bookings (Pending or Approved, active=true) keyed by slot number
  const bySlot = {};
  allLiveryCache.forEach(b => {
    if (b.active && (b.approvalStatus === 'Pending' || b.approvalStatus === 'Approved')) {
      bySlot[b.slotNumber] = b;
    }
  });

  const occupiedCount = Object.keys(bySlot).length;
  document.getElementById('liverySlotCountText').textContent = `${occupiedCount} of ${totalSlots} slots occupied`;

  let html = '';
  for (let i = 1; i <= totalSlots; i++) {
    const booking = bySlot[i];
    if (!booking) {
      html += `
        <div class="livery-slot-card slot-empty">
          <div class="livery-slot-number">Slot ${i}</div>
          <div class="livery-slot-name" style="color:#aaa;">Empty</div>
        </div>`;
    } else {
      const statusClass = booking.approvalStatus === 'Approved' ? 'slot-approved' : 'slot-pending';
      const remaining = daysRemainingFor(booking);
      html += `
        <div class="livery-slot-card ${statusClass}" onclick="openLiveryModal('${booking._id}')">
          <div class="livery-slot-number">Slot ${i}</div>
          <div class="livery-slot-name">${escapeHtml(booking.name)}</div>
          <div class="livery-slot-horse">🐴 ${escapeHtml(booking.horseName)}</div>
          ${booking.approvalStatus === 'Pending' ? '<div class="livery-slot-days">⏳ Pending approval</div>' : ''}
          ${remaining !== null ? `<div class="livery-slot-days">${remaining} day(s) left</div>` : ''}
          ${booking.approvalStatus === 'Approved' ? `<div class="livery-slot-days" style="color:${booking.paymentStatus === 'Paid' ? '#1e7e34' : '#a71d2a'};">${booking.paymentStatus === 'Paid' ? '💰 Paid' : '⚠️ Unpaid'}</div>` : ''}
          ${booking.renewalRequested ? '<div class="livery-slot-days" style="color:#a07840;">🔁 Renewal requested</div>' : ''}
        </div>`;
    }
  }
  grid.innerHTML = html;
}

function openLiveryModal(id) {
  const booking = allLiveryCache.find(b => b._id === id);
  if (!booking) return;

  const remaining = daysRemainingFor(booking);
  let actionButtons = '';
  if (booking.approvalStatus === 'Pending') {
    actionButtons += `<button class="btn-small btn-approve" onclick="approveLivery('${booking._id}')">✅ Approve</button>`;
    actionButtons += `<button class="btn-small btn-reject" onclick="rejectLivery('${booking._id}')">❌ Reject</button>`;
  }
  if (booking.approvalStatus === 'Approved') {
    if (booking.paymentStatus === 'Unpaid') {
      actionButtons += `<button class="btn-small btn-paid" onclick="markLiveryPaid('${booking._id}')">💰 Mark Paid</button>`;
    }
    actionButtons += `<button class="btn-small btn-approve" onclick="renewLivery('${booking._id}')">🔁 Renew for Another Month</button>`;
    actionButtons += `<button class="btn-small" style="background:#e8e0d5;color:#555;" onclick="endLivery('${booking._id}')">🔚 End &amp; Free Slot</button>`;
  }

  let dayGridHtml = '';
  if (booking.approvalStatus === 'Approved' && booking.dailyLog && booking.dailyLog.length) {
    dayGridHtml = `
      <h4 style="margin-top:18px; margin-bottom:6px; font-size:0.95rem; color:#2c1a0e;">Daily Care Log</h4>
      <p class="sub-label" style="margin-bottom:8px;">Click a day to add or edit a note about what was done.</p>
      <div class="livery-day-grid">
        ${booking.dailyLog.map(d => `
          <div class="livery-day-cell ${d.note ? 'has-note' : ''}" onclick="openDayNoteEditor('${booking._id}', ${d.dayNumber})">
            <strong>Day ${d.dayNumber}</strong>
            ${d.date ? `<div style="color:#999;">${d.date}</div>` : ''}
          </div>
        `).join('')}
      </div>`;
  }

  openModal(`
    <h3>${escapeHtml(booking.name)} — Slot ${booking.slotNumber}</h3>
    <p class="sub-label">🐴 Horse: ${escapeHtml(booking.horseName)}</p>
    <p class="sub-label">📧 ${escapeHtml(booking.email)} • 📱 ${escapeHtml(booking.phone)}</p>
    <p class="sub-label">💰 AED ${booking.price} / month</p>
    <p style="margin:10px 0;">
      <span class="approval-badge approval-${booking.approvalStatus.toLowerCase()}">${booking.approvalStatus}</span>
      ${booking.approvalStatus === 'Approved' ? `<span class="payment-badge payment-${booking.paymentStatus.toLowerCase()}">${booking.paymentStatus}</span>` : ''}
      ${booking.renewalCount > 0 ? `<span class="approval-badge" style="background:#e8e0d5;color:#555;">Renewed ${booking.renewalCount}×</span>` : ''}
    </p>
    ${booking.startDate ? `<p class="sub-label">📅 Started: ${new Date(booking.startDate).toLocaleDateString()}</p>` : ''}
    ${booking.endDate ? `<p class="sub-label">📅 Expires: ${new Date(booking.endDate).toLocaleDateString()}</p>` : ''}
    ${remaining !== null ? `<p class="sub-label"><strong>${remaining} day(s) remaining</strong></p>` : ''}
    ${booking.renewalRequested ? '<p class="sub-label" style="color:#a07840;">🔁 Customer has requested renewal</p>' : ''}
    <p class="sub-label">🔗 Tracking link: ${window.location.origin}/livery-track.html?token=${booking.token}</p>
    <div class="package-actions" style="margin-top:12px;">${actionButtons}</div>
    ${dayGridHtml}
  `);
}

async function approveLivery(id) {
  await fetch(`/api/livery/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalStatus: 'Approved' })
  });
  closeModal();
  loadLivery();
}

async function rejectLivery(id) {
  if (!confirm('Reject this livery request?')) return;
  await fetch(`/api/livery/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalStatus: 'Rejected' })
  });
  closeModal();
  loadLivery();
}

async function markLiveryPaid(id) {
  await fetch(`/api/livery/${id}/mark-paid`, { method: 'POST' });
  const idx = allLiveryCache.findIndex(b => b._id === id);
  if (idx !== -1) {
    const res = await fetch('/api/livery');
    allLiveryCache = await res.json();
  }
  openLiveryModal(id);
  renderLiverySlots();
}

async function renewLivery(id) {
  if (!confirm('Renew this livery for another month? This resets payment status to Unpaid and adds 30 more days to the care log.')) return;
  try {
    const res = await fetch(`/api/livery/${id}/renew`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Could not renew livery.');
      return;
    }
    await loadLivery();
    openLiveryModal(id);
  } catch (err) {
    alert('Could not renew livery.');
  }
}

async function endLivery(id) {
  if (!confirm('End this livery and free up the slot? This cannot be undone.')) return;
  await fetch(`/api/livery/${id}/end`, { method: 'POST' });
  closeModal();
  loadLivery();
}

function openDayNoteEditor(bookingId, dayNumber) {
  const booking = allLiveryCache.find(b => b._id === bookingId);
  if (!booking) return;
  const entry = booking.dailyLog.find(d => d.dayNumber === dayNumber);
  const existingNote = entry ? entry.note || '' : '';

  openModal(`
    <h3>Day ${dayNumber} — ${escapeHtml(booking.horseName)}</h3>
    <p class="sub-label">What did you do with ${escapeHtml(booking.horseName)} today?</p>
    <textarea id="dayNoteInput" rows="5" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; font-size:0.9rem; margin-top:8px;">${escapeHtml(existingNote)}</textarea>
    <div class="package-actions" style="margin-top:12px;">
      <button class="btn-small btn-approve" onclick="saveDayNote('${bookingId}', ${dayNumber})">💾 Save</button>
      <button class="btn-small" onclick="openLiveryModal('${bookingId}')">← Back</button>
    </div>
  `);
}

async function saveDayNote(bookingId, dayNumber) {
  const note = document.getElementById('dayNoteInput').value;
  try {
    const res = await fetch(`/api/livery/${bookingId}/log/${dayNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note })
    });
    const data = await res.json();
    const idx = allLiveryCache.findIndex(b => b._id === bookingId);
    if (idx !== -1) allLiveryCache[idx] = data.booking;
    openLiveryModal(bookingId);
    renderLiverySlots();
  } catch (err) {
    alert('Could not save day note.');
  }
}
