window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar');
  if (navbar) {
    if (window.scrollY > 50) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  }
});

const hamburgerEl = document.getElementById('hamburger');
const navLinksEl = document.getElementById('navLinks');
if (hamburgerEl && navLinksEl) {
  hamburgerEl.addEventListener('click', () => {
    navLinksEl.classList.toggle('open');
    hamburgerEl.textContent = navLinksEl.classList.contains('open') ? '✕' : '☰';
  });
  // Close menu when any link is tapped (mobile)
  navLinksEl.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinksEl.classList.remove('open');
      hamburgerEl.textContent = '☰';
    });
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
  "Private Lessons": {
    tiers: [
      { label: "Single Session", price: 250, sessions: 1, duration: 45, validity: "-", freeze: "-" },
      { label: "10 Sessions Package", price: 2500, sessions: 10, duration: 45, validity: "Valid for 2 months", freeze: "Freeze up to 2 weeks" }
    ]
  },
  "Group Lessons": {
    tiers: [
      { label: "Single Session", price: 170, sessions: 1, duration: 45, validity: "-", freeze: "-" },
      { label: "10 Sessions Package", price: 1700, sessions: 10, duration: 45, validity: "Valid for 2 months", freeze: "Freeze up to 2 weeks" }
    ]
  },
  "Outdoor Lessons": {
    tiers: [
      { label: "1 Private Session", price: 200, sessions: 1, duration: 45, validity: "-", freeze: "-" },
      { label: "1 Group Session", price: 100, sessions: 1, duration: 45, validity: "-", freeze: "-" }
    ]
  },
  "Jumping Lessons": {
    tiers: [
      { label: "Single Session", price: 300, sessions: 1, duration: 45, validity: "-", freeze: "-" },
      { label: "10 Sessions Package", price: 3000, sessions: 10, duration: 45, validity: "Valid for 2 months", freeze: "Freeze up to 2 weeks" }
    ]
  },
  "Special Needs Lessons": {
    tiers: [
      { label: "Single Session", price: 100, sessions: 1, duration: 20, validity: "-", freeze: "-" },
      { label: "10 Sessions Package", price: 400, sessions: 10, duration: 20, validity: "Valid for 2 months", freeze: "Freeze up to 2 weeks" }
    ]
  },
  "Hand Ride": {
    tiers: [
      { label: "Single Session", price: 50, sessions: 1, duration: 20, validity: "-", freeze: "-" }
    ]
  }
};

function showSubPackage() {
  const category = document.getElementById('category').value;
  const isTraining = category === 'Riding Packages';
  const isLivery   = category === 'Livery Horse';
  const isHorseTraining = category === 'Horse Training';

  document.getElementById('subPackageGroup').style.display = isTraining ? 'flex' : 'none';
  document.getElementById('paymentMethodRow').style.display = isTraining ? 'flex' : 'none';
  document.getElementById('dateFieldGroup').style.display = isTraining ? 'none' : 'flex';
  // Livery + Horse Training = date only (no session time/duration)
  document.getElementById('schedulingRow').style.display = (isTraining || isLivery || isHorseTraining) ? 'none' : 'flex';
  const horseRow = document.getElementById('horseNameRow');
  if (horseRow) horseRow.style.display = isLivery ? 'flex' : 'none';

  if (!isTraining) {
    document.getElementById('packageTierRow').style.display = 'none';
    document.getElementById('packageInfoBox').style.display = 'none';
    document.getElementById('packageType').value = '';
  }
}


function lockToPackage(typeName) {
  // Hide the raw service/type/tier selectors and show a clean summary banner
  const serviceRow = document.getElementById('serviceSelectRow');
  const tierRow    = document.getElementById('packageTierRow');
  const banner     = document.getElementById('selectedPackageBanner');
  if (serviceRow) serviceRow.style.display = 'none';
  if (document.getElementById('subPackageGroup')) document.getElementById('subPackageGroup').style.display = 'none';
  if (tierRow) tierRow.style.display = 'none';
  if (banner) {
    const nameEl = document.getElementById('spbName');
    if (nameEl) nameEl.textContent = typeName;
    banner.style.display = 'flex';
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

    if (category === 'Livery Horse') {
      const horseName = document.getElementById('horseName').value.trim();
      const preferredDate = document.getElementById('date').value;
      if (!horseName || !preferredDate) {
        timeStatus.textContent = '⚠️ Please enter your horse\'s name and a preferred drop-off date.';
        timeStatus.className = 'time-status error';
        return;
      }
      try {
        const response = await fetch('/api/livery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, horseName, preferredDate })
        });
        const result = await response.json();
        if (!response.ok) {
          timeStatus.textContent = result.message || 'Something went wrong. Please try again.';
          timeStatus.className = 'time-status error';
          return;
        }
        const trackingUrl = `${window.location.origin}/livery-track.html?token=${result.token}`;
        document.getElementById('liveryLinkDisplay').href = trackingUrl;
        document.getElementById('liveryLinkDisplay').textContent = trackingUrl;
        document.getElementById('liverySuccess').style.display = 'block';
        document.getElementById('bookingForm').reset();
        document.getElementById('horseNameRow').style.display = 'none';
      } catch (err) {
        timeStatus.textContent = '❌ Cannot connect to server. Please check your connection.';
        timeStatus.className = 'time-status error';
      }
      return;
    }

    const date      = document.getElementById('date').value;
    const duration  = document.getElementById('duration').value;
    const startTime = document.getElementById('startTime').value;

    const isDateOnly = (category === 'Horse Training');

    if (!date) {
      timeStatus.textContent = '⚠️ Please choose a date.';
      timeStatus.className = 'time-status error';
      window.scrollTo({ top: document.getElementById('booking').offsetTop - 80, behavior: 'smooth' });
      return;
    }

    if (!isDateOnly) {
      if (!duration) {
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
    }

    const bookingData = isDateOnly
      ? { name, email, phone, category, subPackage: '', date, price: 0, message: document.getElementById('message').value }
      : {
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

  if (categoryEl && presetPackage && TRAINING_PACKAGES[presetPackage]) {
    categoryEl.value = 'Riding Packages';
    showSubPackage();
    setTimeout(() => {
      document.getElementById('packageType').value = presetPackage;
      updatePackageTiers();
      lockToPackage(presetPackage);

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

/* =============================================================
   LANGUAGE TOGGLE — English / Arabic
   ============================================================= */
(function () {
  const langBtn = document.getElementById('langToggle');
  if (!langBtn) return;

  const STORAGE_KEY = 'legacy-lang';
  let currentLang = localStorage.getItem(STORAGE_KEY) || 'en';

  function setLang(lang) {
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    
    // Update HTML dir & lang
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.body.classList.toggle('rtl', lang === 'ar');

    // Toggle visibility classes
    document.querySelectorAll('.lang-en').forEach(el => el.style.display = lang === 'en' ? '' : 'none');
    document.querySelectorAll('.lang-ar').forEach(el => el.style.display = lang === 'ar' ? '' : 'none');
    // Swap alt, placeholder, aria-label attributes
    document.querySelectorAll('[data-alt-ar]').forEach(el => {
      el.setAttribute('alt', lang === 'ar' ? el.getAttribute('data-alt-ar') : el.getAttribute('alt').replace(el.getAttribute('data-alt-ar'), ''));
    });
    document.querySelectorAll('[data-placeholder-ar]').forEach(el => {
      el.setAttribute('placeholder', lang === 'ar' ? el.getAttribute('data-placeholder-ar') : el.getAttribute('data-placeholder-ar') ? el.getAttribute('placeholder') : '');
    });
    // Proper attr swap using stored values
    document.querySelectorAll('[data-alt-ar]').forEach(el => {
      const en = el.dataset.altEn || el.getAttribute('alt');
      const ar = el.getAttribute('data-alt-ar');
      if (!el.dataset.altEn) el.dataset.altEn = en;
      el.setAttribute('alt', lang === 'ar' ? ar : el.dataset.altEn);
    });
    document.querySelectorAll('[data-placeholder-ar]').forEach(el => {
      const en = el.dataset.placeholderEn || el.getAttribute('placeholder');
      const ar = el.getAttribute('data-placeholder-ar');
      if (!el.dataset.placeholderEn) el.dataset.placeholderEn = en;
      el.setAttribute('placeholder', lang === 'ar' ? ar : el.dataset.placeholderEn);
    });
    document.querySelectorAll('[data-aria-label-ar]').forEach(el => {
      const en = el.dataset.ariaLabelEn || el.getAttribute('aria-label');
      const ar = el.getAttribute('data-aria-label-ar');
      if (!el.dataset.ariaLabelEn) el.dataset.ariaLabelEn = en;
      el.setAttribute('aria-label', lang === 'ar' ? ar : el.dataset.ariaLabelEn);
    });

    // Update button text
    const enSpan = langBtn.querySelector('.lang-btn-en');
    const arSpan = langBtn.querySelector('.lang-btn-ar');
    if (enSpan) enSpan.style.display = lang === 'en' ? 'none' : '';
    if (arSpan) arSpan.style.display = lang === 'ar' ? 'none' : '';

    // Update title
    document.title = lang === 'ar' 
      ? (document.querySelector('meta[name="title-ar"]')?.content || document.title)
      : (document.querySelector('meta[name="title-en"]')?.content || document.title);
  }

  langBtn.addEventListener('click', () => {
    setLang(currentLang === 'en' ? 'ar' : 'en');
  });

  // Apply on load
  setLang(currentLang);
})();

/* =============================================================
   CLICKABLE CARDS — tap anywhere on card = follow first link
   ============================================================= */
(function () {
  function makeClickable(selector) {
    document.querySelectorAll(selector).forEach(card => {
      // Don't add if already handled
      if (card.dataset.clickable === 'true') return;
      card.dataset.clickable = 'true';
      
      card.addEventListener('click', function (e) {
        // Don't fire if user clicked a button, link, input, or select directly
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'a' || tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return;
        // Don't fire if clicking inside a form element
        if (e.target.closest('a, button, input, select, textarea, .btn-book, .btn-whatsapp, .btn-book-now, .btn-submit')) return;
        
        const link = card.querySelector('a');
        if (link) {
          const href = link.getAttribute('href');
          if (href && href !== '#') {
            // Open in same tab for internal, new tab for external
            if (href.startsWith('http') || href.startsWith('//')) {
              window.open(href, '_blank');
            } else {
              window.location.href = href;
            }
          }
        }
      });
    });
  }
  
  // Make service cards clickable
  makeClickable('.service-card');
  // Make pricing cards clickable  
  makeClickable('.pricing-card');
  // Make single price cards clickable
  makeClickable('.single-price-card');
})();
