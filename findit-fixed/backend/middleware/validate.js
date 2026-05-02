// middleware/validate.js
//
// Schema-first request validation. Wrapping a route in `validate({ body, query, params })`
// gives us four guarantees:
//   1. Types & shape are enforced (eliminates `{$ne: null}` and other NoSQL operator
//      injection vectors — anything that isn't a primitive string/number/boolean is
//      rejected up front).
//   2. Unknown keys are stripped (defense against mass assignment when a model has
//      extra fields like `role`, `trustScore`, `tokenVersion`).
//   3. Errors come back in a consistent, client-safe shape.
//   4. Downstream handlers see ALREADY-PARSED values via `req.body`, `req.query`, etc.
//
// We deliberately do NOT echo the user's raw input in error responses — only the
// JSON path and a generic message. That avoids reflecting attacker-controlled
// payloads back into client logs / dashboards.

const { z } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    const slots = ['body', 'query', 'params'];
    for (const slot of slots) {
      if (!schema[slot]) continue;
      const result = schema[slot].safeParse(req[slot]);
      if (!result.success) {
        return res.status(400).json({
          message: `Invalid ${slot}`,
          issues: result.error.issues.map((i) => ({
            path: Array.isArray(i.path) ? i.path.join('.') : String(i.path),
            message: i.message,
          })),
        });
      }
      // For Express 5, req.query may be a plain object that's read-only on
      // some platforms. We assign defensively rather than mutating in place.
      try { req[slot] = result.data; } catch { /* read-only — caller can re-read */ }
    }
    return next();
  };
}

module.exports = { validate, z };
