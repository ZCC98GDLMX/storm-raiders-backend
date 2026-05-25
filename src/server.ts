import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import playerRoutes from "./routes/player.routes";
import rewardRoutes from "./routes/reward.routes";
import inventoryRoutes from "./routes/inventory.routes";
import shopRoutes from "./routes/shop.routes";
import equipmentRoutes from "./routes/equipment.routes";
import quickslotRoutes from "./routes/quickslots.routes";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/player", playerRoutes);
app.use("/rewards", rewardRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/shop", shopRoutes);
app.use("/equipment", equipmentRoutes);
app.use("/quickslots", quickslotRoutes);

app.get("/health", (_req, res) => {
  return res.status(200).json({
    success: true,
    message: "Storm Raiders backend online",
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});