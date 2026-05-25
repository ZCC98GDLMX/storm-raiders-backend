import { Router } from "express";
import { supabase } from "../db/supabase";
import { requireAuth, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const profileId = req.user?.profile_id;

  if (!profileId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, email, created_at")
    .eq("id", profileId)
    .single();

  if (profileError || !profile) {
    return res.status(404).json({
      success: false,
      message: "Profile not found",
    });
  }

  const { data: state, error: stateError } = await supabase
    .from("player_state")
    .select("*")
    .eq("profile_id", profileId)
    .single();

  if (stateError || !state) {
    return res.status(404).json({
      success: false,
      message: "Player state not found",
    });
  }

  return res.json({
    success: true,
    profile,
    state,
  });
});

export default router;