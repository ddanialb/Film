const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Routes
const searchRoutes = require("./routes/search");
app.use("/api", searchRoutes);

// صفحه اصلی
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Health check برای Render
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(
    `📧 Username: ${process.env.FARSILAND_USERNAME ? "Set" : "NOT SET"}`
  );
  console.log(
    `🔑 Password: ${process.env.FARSILAND_PASSWORD ? "Set" : "NOT SET"}`
  );
});
