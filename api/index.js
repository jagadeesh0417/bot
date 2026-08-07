import { createApp, ready } from "../src/app.js";
import { connectDb } from "../src/db.js";

const app = createApp();

const port = process.env.PORT || 3000;

if (process.env.VERCEL !== "1") {
  ready().then(() => {
    app.listen(port, () => console.log(`CollegeAI listening on http://localhost:${port}`));
  });
} else {
  export default async function handler(req, res) {
    try {
      await connectDb();
    } catch (e) {
      /* DB will be connected lazily per-request */
    }
    return app(req, res);
  }
}
