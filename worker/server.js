// worker/server.js
import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

app.post("/api/trigger-payment", (req, res) => {
  const { billId } = req.body;

  if (!billId) {
    return res.status(400).json({ error: "Missing billId" });
  }

  console.log(`\n=================================`);
  console.log(`🖱️ UI CLICK RECEIVED FOR BILL: ${billId}`);
  console.log(`=================================\n`);

  // This programmatically runs your exact terminal command locally!
  const workerProcess = spawn("node", [path.join(__dirname, "index.js")], {
    env: { ...process.env, BILL_ID: billId },
    stdio: "inherit", // Streams all Stagehand logs directly to your terminal window
  });

  return res.json({ 
    success: true, 
    message: "Worker spawned successfully." 
  });
});

app.listen(PORT, () => {
  console.log(`Local worker bridge listening on http://localhost:${PORT}`);
});