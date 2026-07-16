// Admin authentication middleware.
// Protects admin-only API endpoints. Accepts the shared admin key via either the
// 'x-admin-key' request header (used by the dashboard after login) or a ?key= query
// param (used by the one-click email/WhatsApp action links). Public customer-facing
// endpoints (booking/package/livery creation, tracking by token, availability,
// closed-day reads) do NOT use this middleware and remain open.
const ADMIN_ACTION_KEY = process.env.ADMIN_ACTION_KEY || 'legacy-secret-2026';

function requireAdmin(req, res, next) {
  const provided = req.headers['x-admin-key'] || (req.query && req.query.key);
  if (provided && provided === ADMIN_ACTION_KEY) return next();
  return res.status(401).json({ message: 'Unauthorized — admin login required.' });
}

module.exports = { requireAdmin };
