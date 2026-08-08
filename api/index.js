let app = null;

export default async function handler(req, res) {
  if (!app) {
    try {
      const { createApp } = await import("../src/app.js");
      app = createApp();
    } catch (e) {
      res.status(500).json({ success: false, error: `Module load failed: ${e?.message || e}` });
      return;
    }
  }
  try {
    const { connectDb } = await import("../src/db.js");
    await connectDb();
  } catch (e) {
    /* DB connected lazily per request */
  }
  try {
    return app(req, res);
  } catch (e) {
    if (res.headersSent) throw e;
    res.status(500).json({ success: false, error: `Handler error: ${e?.message || e}` });
  }
}
