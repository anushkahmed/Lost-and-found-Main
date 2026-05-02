// middleware/asyncHandler.js — wrap an async route so any thrown error reaches
// our centralized error handler instead of producing an unhandled rejection.

module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
