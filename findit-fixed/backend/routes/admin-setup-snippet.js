// ─────────────────────────────────────────────────────────────
// ADD THIS BLOCK to the bottom of backend/routes/auth.js
// (above the module.exports line)
//
// This lets the FIRST registered user automatically become admin,
// and gives a safe way for any teammate to be promoted.
// ─────────────────────────────────────────────────────────────

// POST /api/auth/make-admin
// Anyone can call this BUT only works if they know the ADMIN_SECRET
// Set ADMIN_SECRET in your .env file — share it only with your team
router.post('/make-admin', async (req, res) => {
  try {
    const { email, adminSecret } = req.body;

    // Check the secret matches what's in .env
    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ message: 'Wrong admin secret' });
    }

    const user = await User.findOneAndUpdate(
      { email },
      { $set: { role: 'admin' } },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: `${user.name} is now an admin`, role: user.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/first-admin
// Automatically makes the first ever registered user an admin
// Useful for fresh project setup — disable after first use
router.post('/first-admin', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 1) {
      return res.status(400).json({ message: 'First admin already set. Use /make-admin instead.' });
    }
    const user = await User.findOneAndUpdate(
      {},
      { $set: { role: 'admin' } },
      { new: true }
    );
    res.json({ message: `${user.name} is now the first admin!` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
