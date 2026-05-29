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
import talentsRoutes from "./routes/talents.routes";
import combatRoutes from "./routes/combat.routes";
import bonusmapRoutes from "./routes/bonusmaps.routes";
import arubaRoutes from "./routes/aruba.routes";
import glitterRoutes from "./routes/glitter.routes";
import raidRoutes from "./routes/raid.routes";
import worldRoutes from "./routes/world.routes";

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
app.use("/talents", talentsRoutes);
app.use("/combat", combatRoutes);
app.use("/bonusmaps", bonusmapRoutes);
app.use("/aruba", arubaRoutes);
app.use("/glitter", glitterRoutes);
app.use("/raid", raidRoutes);
app.use("/world", worldRoutes);

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