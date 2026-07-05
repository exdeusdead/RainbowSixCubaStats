
require("dotenv").config();
const cors = require("cors");

const express = require("express");
const { getSyncBatch, saveSnapshot } = require("./syncQueue");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/batch/:discordId", (req, res) => {
  const batch = getSyncBatch(req.params.discordId, 20);
  res.json({ ok: true, batch });
});

app.post("/api/snapshot", (req, res) => {
	console.log("SNAPSHOT RECEIVED");
	console.log(req.body);
  const { discordId, stats } = req.body;

  if (!discordId || !stats) {
    return res.status(400).json({ ok: false, error: "Missing data" });
  }

  const saved = await saveSnapshot(discordId, stats);
  res.json({ ok: saved });
});

app.listen(3000, () => {
  console.log("✅ Local sync portal running at http://localhost:3000");
});