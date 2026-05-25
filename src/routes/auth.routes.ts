import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { supabase } from "../db/supabase";

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(4).max(100),
});

const loginSchema = z.object({
  username: z.string().min(3).max(20),
  password: z.string().min(4).max(100),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid register data",
    });
  }

  const username = parsed.data.username.trim().toUpperCase();
  const email = parsed.data.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const { data: profile, error } = await supabase
    .from("profiles")
    .insert({
      username,
      email,
      password_hash: passwordHash,
    })
    .select("id, username, email")
    .single();

  if (error || !profile) {
    return res.status(400).json({
      success: false,
      message: error?.message || "Could not create account",
    });
  }

  await supabase.from("player_state").insert({
    profile_id: profile.id,
    level: 1,
    current_xp: 0,
    gold: 300000,
    pearls: 5000,
    crystals: 0,
    map_id: "1-1",
    map_path: "res://scenes/world/map1.tscn",
    position_x: 2000,
    position_y: 2000,
  });

  await supabase.from("player_inventory").insert([
    {
      profile_id: profile.id,
      item_id: "hollow",
      amount: 10000,
    },
    {
      profile_id: profile.id,
      item_id: "harpoon_1",
      amount: 5000,
    },
    {
      profile_id: profile.id,
      item_id: "cannon_30lb",
      amount: 5,
    },
    {
      profile_id: profile.id,
      item_id: "red_korsar_1",
      amount: 1,
    },
  ]);

  await supabase.from("player_equipment").insert([
    {
      profile_id: profile.id,
      slot: "ship",
      item_id: "red_korsar_1",
    },
    {
      profile_id: profile.id,
      slot: "cannon_1",
      item_id: "cannon_30lb",
    },
    {
      profile_id: profile.id,
      slot: "cannon_2",
      item_id: "cannon_30lb",
    },
    {
      profile_id: profile.id,
      slot: "cannon_3",
      item_id: "cannon_30lb",
    },
    {
      profile_id: profile.id,
      slot: "cannon_4",
      item_id: "cannon_30lb",
    },
    {
      profile_id: profile.id,
      slot: "cannon_5",
      item_id: "cannon_30lb",
    },
  ]);

  return res.status(201).json({
    success: true,
    message: "Account created",
    profile,
  });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid login data",
    });
  }

  const username = parsed.data.username.trim().toUpperCase();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, email, password_hash")
    .eq("username", username)
    .single();

  if (error || !profile) {
    return res.status(401).json({
      success: false,
      message: "Invalid username or password",
    });
  }

  const passwordOk = await bcrypt.compare(
    parsed.data.password,
    profile.password_hash
  );

  if (!passwordOk) {
    return res.status(401).json({
      success: false,
      message: "Invalid username or password",
    });
  }

  const token = jwt.sign(
    {
      profile_id: profile.id,
      username: profile.username,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: "7d" }
  );

  return res.json({
    success: true,
    message: "Login successful",
    token,
    profile: {
      id: profile.id,
      username: profile.username,
      email: profile.email,
    },
  });
});

export default router;