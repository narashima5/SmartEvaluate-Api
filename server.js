require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const connectDB = require("./src/config/db");
const { apiLimiter } = require("./src/middleware/rateLimiter");

// Import Routes
const authRoutes = require("./src/routes/auth");
const eventRoutes = require("./src/routes/events");
const schoolRoutes = require("./src/routes/schools");
const studentRoutes = require("./src/routes/students");
const projectRoutes = require("./src/routes/projects");
const checkinRoutes = require("./src/routes/checkin");
const evaluationRoutes = require("./src/routes/evaluations");
const reportRoutes = require("./src/routes/reports");
const dashboardRoutes = require("./src/routes/dashboard");
const auditRoutes = require("./src/routes/audit");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  "https://smartevalute.web.app",
  "https://smartevalute.firebaseapp.com",
  "https://smart-evaluate-ui.vercel.app",
  "http://localhost:5173",
];
if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(...process.env.CORS_ORIGIN.split(",").map(o => o.trim()));
}

// Initialize Socket.io WebSockets
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.set("socketio", io);

// Connect to MongoDB
connectDB();

// Global Middlewares
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());
app.use(apiLimiter);

// Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Science Expo API Server is healthy and running." });
});

// Route Integrations
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/checkin", checkinRoutes);
app.use("/api/evaluations", evaluationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/audits", auditRoutes);

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  socket.on("join_event_room", (eventId) => {
    socket.join(eventId);
    console.log(`Socket ${socket.id} joined room for event ${eventId}`);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Express Error Handler:", err.stack);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error. Something went wrong on our side.",
  });
});

// Start listening only when run directly (local development)
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
