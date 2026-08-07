import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { connectDb } from "./db.js";
import { bootstrapAdmin } from "./auth.js";
import authRoutes from "./routes/auth.js";
import catalogRoutes from "./routes/catalog.js";
import contentRoutes from "./routes/content.js";
import systemRoutes from "./routes/system.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: "*", credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  function wrapRouter(router) {
    for (const layer of router.stack) {
      if (layer.route) {
        for (const h of layer.route.stack) {
          const orig = h.handle;
          h.handle = (req, res, next) => Promise.resolve(orig(req, res, next)).catch(next);
        }
      } else if (layer.handle && layer.handle.stack) {
        wrapRouter(layer.handle);
      }
    }
    return router;
  }

  app.get("/health", async (req, res) => {
    try {
      const db = await connectDb();
      await db.command({ ping: 1 });
      res.json({ status: "ok", app: process.env.APP_NAME || "CollegeAI", mongo: "connected" });
    } catch (e) {
      res.json({ status: "ok", app: process.env.APP_NAME || "CollegeAI", mongo: "disconnected" });
    }
  });

  app.use("/api/auth", wrapRouter(authRoutes));
  app.use("/api", wrapRouter(catalogRoutes));
  app.use("/api", wrapRouter(contentRoutes));
  app.use("/api", wrapRouter(systemRoutes));

  const publicDir = path.join(ROOT, "public");
  app.use(express.static(publicDir));

  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ success: false, detail: "Not Found", code: "http_error" });
    }
    const index = path.join(publicDir, "index.html");
    if (fs.existsSync(index)) return res.sendFile(index);
    res.status(200).send("CollegeAI API is running. See /api/health");
  });

  app.use((err, req, res, next) => {
    if (err && err.status) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    if (err && err.name === "MulterError") {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  });

  return app;
}

export async function ready() {
  try {
    await connectDb();
    await bootstrapAdmin();
  } catch (e) {
    console.error("Startup warning:", e.message);
  }
}
