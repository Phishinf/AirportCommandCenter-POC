import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";

const PORT = 3000;

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  // Database setup
  const db = new Database("nexus.db");
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent TEXT,
      type TEXT,
      message TEXT,
      severity TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS flow_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone TEXT,
      passenger_count INTEGER,
      wait_time INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  app.use(express.json());

  app.get("/api/state/summary", (req, res) => {
    const zones = ["Security T1", "Check-in A", "Gate B12", "Immigration", "Retail Plaza"];
    const summary = zones.map(zone => {
      const latest = db.prepare("SELECT * FROM flow_metrics WHERE zone = ? ORDER BY timestamp DESC LIMIT 1").get(zone) as any;
      return {
        zone,
        passenger_count: latest?.passenger_count || 0,
        wait_time: latest?.wait_time || 0,
        status: (latest?.wait_time > 20) ? "congested" : "nominal"
      };
    });
    const recentAlerts = db.prepare("SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 5").all();
    res.json({ summary, recentAlerts });
  });

  app.post("/api/simulation/impact", (req, res) => {
    const { flightId, delayMinutes, zone } = req.body;
    // Simulate impact calculation
    const impactFactor = delayMinutes / 10;
    const predictedWaitIncrease = Math.floor(Math.random() * impactFactor) + 2;
    
    res.json({
      flightId,
      delayMinutes,
      zone: zone || "General",
      predictedWaitIncrease,
      recommendation: predictedWaitIncrease > 5 ? "Open additional service lanes" : "Monitor flow"
    });
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "Nexus Core Online", version: "1.0.0-alpha" });
  });

  app.get("/api/alerts", (req, res) => {
    const alerts = db.prepare("SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 50").all();
    res.json(alerts);
  });

  app.get("/api/metrics", (req, res) => {
    const metrics = db.prepare("SELECT * FROM flow_metrics ORDER BY timestamp DESC LIMIT 100").all();
    res.json(metrics);
  });

  // Simulated Agent Logic
  const zones = ["Security T1", "Check-in A", "Gate B12", "Immigration", "Retail Plaza"];
  
  setInterval(() => {
    // Simulate Ingestor Agent
    const zone = zones[Math.floor(Math.random() * zones.length)];
    const count = Math.floor(Math.random() * 200) + 50;
    const waitTime = Math.floor(count / 10) + Math.floor(Math.random() * 5);
    
    db.prepare("INSERT INTO flow_metrics (zone, passenger_count, wait_time) VALUES (?, ?, ?)").run(zone, count, waitTime);
    
    const metric = { zone, count, waitTime, timestamp: new Date().toISOString() };
    io.emit("flow_update", metric);

    // Simulate Sentinel Agent (Anomaly Detection)
    if (waitTime > 25) {
      const alert = {
        agent: "Sentinel",
        type: "CONGESTION_ALERT",
        message: `High wait time detected at ${zone}: ${waitTime} mins`,
        severity: "high",
        timestamp: new Date().toISOString()
      };
      db.prepare("INSERT INTO alerts (agent, type, message, severity) VALUES (?, ?, ?, ?)").run(alert.agent, alert.type, alert.message, alert.severity);
      io.emit("new_alert", alert);
    }
  }, 3000);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist/index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Nexus Platform running on http://localhost:${PORT}`);
  });
}

startServer();
