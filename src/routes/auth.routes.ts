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
    return res.status(400).json({ success: false, message: "Invalid register data" });
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

  if (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  await supabase.from("player_state").insert({
    profile_id: profile.id,
  });

  return res.status(201).json({
    success: true,
    message: "Account created",
    profile,
  });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid login data" });
  }

  const username = parsed.data.username.trim().toUpperCase();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username, email, password_hash")
    .eq("username", username)
    .single();

  if (error || !profile) {
    return res.status(401).json({ success: false, message: "Invalid username or password" });
  }

  const passwordOk = await bcrypt.compare(parsed.data.password, profile.password_hash);

  if (!passwordOk) {
    return res.status(401).json({ success: false, message: "Invalid username or password" });
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