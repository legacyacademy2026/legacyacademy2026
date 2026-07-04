window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (navbar) {
    if (window.scrollY > 50) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  }
});

const hamburgerEl = document.getElementById('hamburger');
if (hamburgerEl) {
  hamburgerEl.addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('open');
  });
}

function presetCategory(value) {
  setTimeout(() => {
    const categorySelect = document.getElementById('category');
    if (categorySelect) {
      categorySelect.value = value;
      showSubPackage();
    }
  }, 350);
}

const TRAINING_PACKAGES = {
  "Private Lessons for Horse Owners": {
    tiers: [
      { label: "10 Private Lessons", price: 1500, sessions: 10, duration: 45, validity: "Valid for 2 months", freeze: "Freeze up to 2 weeks" }
    ]
  },
  "Private Lessons for Non-Horse Owners": {
    tiers: [
      { label: "Single Lesson", price: 200, sessions: 1, duration: 45, validity: "-", freeze: "-" },
      { label: "5 Lessons Package", price: 1400, sessions: 5, duration: 45, validity: "Valid for 1 month", freeze: "Freeze up to 1 week" },
      { label: "10 Lessons Package", price: 2700, sessions: 10, duration: 45, validity: "Valid for 2 months", freeze: "Freeze up to 2 weeks" }
    ]
  },
  "Group Riding Package": {
    tiers: [
      { label: "Single Lesson", price: 180, sessions: 1, duration: 45, validity: "-", freeze: "-" },
      { label: "5 Lessons Package", price: 850, sessions: 5, duration: 45, validity: "Valid for 1 month", freeze: "Freeze up to 1 week" },
      { label: "10 Lessons Package", price: 1600, sessions: 10, duration: 45, validity: "Valid for 2 months", freeze: "Freeze up to 2 weeks" }
    ]
  },
  "Family Riding Package": {
    tiers: [
      { label: "Single Lesson", price: 180, sessions: 1, duration: 45, validity: "-", freeze: "-" },
      { label: "5 Lessons Package", price: 850, sessions: 5, duration: 45, validity: "Valid for 1 month", freeze: "Freeze up to 1 week" },
      { label: "10 Lessons Package", price: 1600, sessions: 10, duration: 45, validity: "Valid for 2 months", freeze: "Freeze up to 2 weeks" }
    ]
  },
  "Special Needs Riding Program": {
    tiers: [
      { label: "Single Session (20 min)", price: 100, sessions: 1, duration: 20, validity: "-", freeze: "-" },
      { label: "5 Sessions Package (20 min each)", price: 2000, sessions: 5, duration: 20, validity: "-", freeze: "-" }
    ]
  },
  "Mixed Package (Private & Group Lessons)": {
    tiers: [
      { label: "Package One: 5 Private + 5 Group", price: 2000, sessions: 10, duration: 45, validity: "Valid for 2 months", freeze: "Freeze up to 2 weeks" },
      { label: "Package Two: 10 Private + 10 Group", price: 4000, sessions: 20, duration: 45, validity: "Valid for 2 months", freeze: "Freeze up to 3 weeks" }
    ]
  },
  "Hand Ride Experience": {
    tiers: [
      { label: "20 Minutes", price: 40, sessions: 1, duration: 20, validity: "-", freeze: "-" },
      { label: "40 Minutes", price: 80, sessions: 1, duration: 40, validity: "-", freeze: "-" },
      { label: "60 Minutes (1 Hour)", price: 120, sessions: 1, duration: 60, validity: "-", freeze: "-" }
    ]
  },
  "Outdoor Lessons": {
    tiers: [
      { label: "1 Private Session", price: 200, sessions: 1, duration: 45, validity: "Valid for 2 months", freeze: "Freeze up to 2 weeks" },
      { label: "1 Group Session", price: 100, sessions: 1, duration: 45, validity: "Valid for 2 months", freeze: "Freeze up to 2 weeks" }
    ]
  }
};

function showSubPackage() {
  const category = document.getElementById('category').value;
  const isTraining = category === 'Riding Packages';

  document.getElementById('subPackageGroup').style.display = isTraining ? 'flex' : 'none';
  document.getElementById('paymentMethodRow').style.display = isTraining ? 'flex' : 'none';
  document.getElementById('dateFieldGroup').style.display = isTraining ? 'none' : 'flex';
  document.getElementById('schedulingRow').style.display = isTraining ? 'none' : 'flex';

  if (!isTraining) {
    document.getElementById('packageTierRow').style.display = 'none';
    document.getElementById('packageInfoBox').style.display = 'none';
    document.getElementById('packageType').value = '';
  }
}

function updatePackageTiers() {
  const type = document.getElementById('packageType').value;
  const tierRow = document.getElementById('packageTierRow');
  const tierSelect = document.getElementById('packageTier');
  const infoBox = document.getElementById('packageInfoBox');

  tierSelect.innerHTML = '<option value="">-- Choose Tier --</option>';
  infoBox.style.display = 'none';

  if (!type || !TRAINING_PACKAGES[type]) {
    tierRow.style.display = 'none';
    return;
  }

  TRAINING_PACKAGES[type].tiers.forEach((tier, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${tier.label} — AED ${tier.price}`;
    tierSelect.appendChild(opt);
  });

  tierRow.style.display = 'flex';

  if (TRAINING_PACKAGES[type].tiers.length === 1) {
    tierSelect.value = 0;
    updatePackageInfo();
  }
}

function updatePackageInfo() {
  const type = document.getElementById('packageType').value;
  const tierIndex = document.getElementById('packageTier').value;
  const infoBox = document.getElementById('packageInfoBox');

  if (!type || tierIndex === '') {
    infoBox.style.display = 'none';
    return;
  }

  const tier = TRAINING_PACKAGES[type].tiers[tierIndex];
  document.getElementById('packagePrice').textContent = `AED ${tier.price}`;
  document.getElementById('packageValidity').textContent = tier.validity;
  document.getElementById('packageFreeze').textContent = tier.freeze;
  infoBox.style.display = 'block';
}

const WORK_START_HOUR = 6;
const WORK_END_HOUR = 17;

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

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const durationEl = document.getElementById('duration');
const dateEl = document.getElementById('date');
if (durationEl && dateEl) {
  durationEl.addEventListener('change', refreshStartTimes);
  dateEl.addEventListener('change', refreshStartTimes);
}

async function refreshStartTimes() {
  const duration = parseInt(document.getElementById('duration').value);
  const date = document.getElementById('date').value;
  const startTimeSelect = document.getElementById('startTime');
  const timeStatus = document.getElementById('timeStatus');

  startTimeSelect.innerHTML = '';
  timeStatus.textContent = '';

  if (!duration) {
    startTimeSelect.disabled = true;
    startTimeSelect.innerHTML = '<option value="">-- Choose Duration First --</option>';
    return;
  }

  startTimeSelect.disabled = false;

  let workEndMinutes = WORK_END_HOUR * 60;

  if (date) {
    try {
      const closedRes = await fetch(`/api/closed-days/${date}`);
      const closedInfo = await closedRes.json();
      if (closedInfo) {
        if (closedInfo.type === 'Holiday') {
          startTimeSelect.innerHTML = '<option value="">-- Closed --</option>';
          startTimeSelect.disabled = true;
          timeStatus.textContent = `🚫 The academy is closed on this date${closedInfo.reason ? ' (' + closedInfo.reason + ')' : ''}. Please choose another date.`;
          timeStatus.className = 'time-status error';
          return;
        }
        if (closedInfo.type === 'HalfDay' && closedInfo.closeTime) {
          workEndMinutes = timeToMinutes(closedInfo.closeTime);
        }
      }
    } catch (err) {
      console.log('Could not check closed days');
    }
  }

  startTimeSelect.innerHTML = '<option value="">-- Choose a Start Time --</option>';

  let existingBookings = [];
  if (date) {
    try {
      const res = await fetch(`/api/bookings/availability?date=${date}`);
      const data = await res.json();
      existingBookings = data.bookings || [];
    } catch (err) {
      console.log('Could not check availability');
    }
  }

  const workStart = WORK_START_HOUR * 60;

  let currentMinutes = -1;
  if (date === todayStr()) {
    const now = new Date();
    currentMinutes = now.getHours() * 60 + now.getMinutes();
  }

  for (let startMin = workStart; startMin + duration * 60 <= workEndMinutes; startMin += 60) {
    if (currentMinutes !== -1 && startMin < currentMinutes) continue;
    const endMin = startMin + duration * 60;

    const isBooked = existingBookings.some(b => {
      if (!b.startTime || typeof b.duration !== 'number') return false;
      const bStart = timeToMinutes(b.startTime);
      const bEnd = bStart + b.duration * 60;
      return startMin < bEnd && bStart < endMin;
    });

    const opt = document.createElement('option');
    opt.value = minutesToTime(startMin);
    const label = `${minutesToTime(startMin)} - ${minutesToTime(endMin)}`;
    opt.textContent = isBooked ? `${label} (Already Booked)` : label;
    opt.disabled = isBooked;
    startTimeSelect.appendChild(opt);
  }

  if (startTimeSelect.options.length <= 1) {
    timeStatus.textContent = 'No available times for this date/duration. Try a shorter duration or another date.';
    timeStatus.className = 'time-status error';
  }
}

const bookingFormEl = document.getElementById('bookingForm');
if (bookingFormEl) {
  bookingFormEl.addEventListener('submit', async (e) => {
    e.preventDefault();

    const timeStatus = document.getElementById('timeStatus');
    timeStatus.textContent = '';

    const name      = document.getElementById('name').value.trim();
    const email     = document.getElementById('email').value.trim();
    const phone     = document.getElementById('phone').value.trim();
    const category  = document.getElementById('category').value;

    if (!name || !email || !phone || !category) {
      timeStatus.textContent = '⚠️ Please fill in all required fields above.';
      timeStatus.className = 'time-status error';
      window.scrollTo({ top: document.getElementById('booking').offsetTop - 80, behavior: 'smooth' });
      return;
    }

    if (category === 'Riding Packages') {
      const packageType = document.getElementById('packageType').value;
      const packageTierIndex = document.getElementById('packageTier').value;
      const paymentMethod = document.getElementById('paymentMethod').value;

      if (!packageType || packageTierIndex === '') {
        timeStatus.textContent = '⚠️ Please select a Package Type and Tier.';
        timeStatus.className = 'time-status error';
        return;
      }
      if (!paymentMethod) {
        timeStatus.textContent = '⚠️ Please choose a Payment Method.';
        timeStatus.className = 'time-status error';
        return;
      }

      const tier = TRAINING_PACKAGES[packageType].tiers[packageTierIndex];
      const titleValue = document.getElementById('title').value;
      const packageData = {
        title: titleValue, name, email, phone,
        packageType,
        tierLabel: tier.label,
        price: tier.price,
        sessionsTotal: tier.sessions,
        sessionDuration: tier.duration || 45,
        validity: tier.validity,
        freeze: tier.freeze,
        paymentMethod
      };

      try {
        const response = await fetch('/api/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(packageData)
        });
        const result = await response.json();

        if (!response.ok) {
          timeStatus.textContent = result.message || 'Something went wrong. Please try again.';
          timeStatus.className = 'time-status error';
          return;
        }

        const trackingUrl = `${window.location.origin}/track.html?token=${result.token}`;
        document.getElementById('trackingLinkDisplay').href = trackingUrl;
        document.getElementById('trackingLinkDisplay').textContent = trackingUrl;
        document.getElementById('packageSuccess').style.display = 'block';
        document.getElementById('bookingForm').reset();
        document.getElementById('subPackageGroup').style.display = 'none';
        document.getElementById('paymentMethodRow').style.display = 'none';
        document.getElementById('packageTierRow').style.display = 'none';
        document.getElementById('packageInfoBox').style.display = 'none';
      } catch (err) {
        timeStatus.textContent = '❌ Cannot connect to server. Please check your connection.';
        timeStatus.className = 'time-status error';
      }
      return;
    }

    const date      = document.getElementById('date').value;
    const duration  = document.getElementById('duration').value;
    const startTime = document.getElementById('startTime').value;

    if (!date || !duration) {
      timeStatus.textContent = '⚠️ Please fill in all required fields above.';
      timeStatus.className = 'time-status error';
      window.scrollTo({ top: document.getElementById('booking').offsetTop - 80, behavior: 'smooth' });
      return;
    }

    if (!startTime) {
      timeStatus.textContent = '⚠️ Please select an available Start Time.';
      timeStatus.className = 'time-status error';
      return;
    }

    const bookingData = {
      name, email, phone, category,
      subPackage: '',
      date, startTime,
      duration: parseInt(duration),
      price: 0,
      message: document.getElementById('message').value
    };

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });

      const result = await response.json();

      if (response.status === 409) {
        timeStatus.textContent = result.message;
        timeStatus.className = 'time-status error';
        refreshStartTimes();
        return;
      }

      if (response.ok) {
        document.getElementById('formSuccess').style.display = 'block';
        document.getElementById('bookingForm').reset();
        document.getElementById('startTime').innerHTML = '<option value="">-- Choose Duration First --</option>';
        document.getElementById('startTime').disabled = true;
        setTimeout(() => { document.getElementById('formSuccess').style.display = 'none'; }, 5000);
      } else {
        timeStatus.textContent = result.message || 'Something went wrong. Please try again.';
        timeStatus.className = 'time-status error';
      }
    } catch (err) {
      timeStatus.textContent = '❌ Cannot connect to server. Please check your connection.';
      timeStatus.className = 'time-status error';
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  let presetPackage = params.get('package');
  const presetService = params.get('service');
  const presetTier = params.get('tier');
  const categoryEl = document.getElementById('category');

  // Some lesson pages pass ?service=<package type name> instead of a real
  // category (e.g. "Outdoor Lessons", "Hand Ride Experience"). Route those
  // through the Riding Packages / packageType flow instead of the raw
  // category select, which only understands actual category values.
  if (presetService && TRAINING_PACKAGES[presetService]) {
    presetPackage = presetService;
  } else if (categoryEl && presetService) {
    categoryEl.value = presetService;
    showSubPackage();
  }

  const presetLivery = params.get('livery');
  if (presetLivery) {
    const messageEl = document.getElementById('message');
    if (messageEl) messageEl.value = `Interested in: ${presetLivery}`;
  }

  const presetTraining = params.get('training');
  if (presetTraining) {
    const messageEl = document.getElementById('message');
    if (messageEl) messageEl.value = `Interested in: ${presetTraining}`;
  }

  if (categoryEl && presetPackage) {
    categoryEl.value = 'Riding Packages';
    showSubPackage();
    setTimeout(() => {
      document.getElementById('packageType').value = presetPackage;
      updatePackageTiers();

      if (presetTier) {
        const tierSelect = document.getElementById('packageTier');
        const tiers = TRAINING_PACKAGES[presetPackage].tiers;
        const matchIndex = tiers.findIndex(t => t.label.toLowerCase().includes(presetTier.toLowerCase()));
        if (matchIndex !== -1) {
          tierSelect.value = matchIndex;
          updatePackageInfo();
        }
      }
    }, 200);
  }
});

window.addEventListener('load', () => {
  const intro = document.getElementById('introOverlay');
  if (!intro) return;

  setTimeout(() => {
    intro.classList.add('intro-done');
  }, 2200);

  intro.addEventListener('transitionend', () => {
    intro.style.display = 'none';
  });
});

const cardObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('revealed');
      }, i * 100);
      cardObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal-card').forEach(card => cardObserver.observe(card));