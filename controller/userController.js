const getSupabaseClient = require("../config/supabaseClient");
const cloudinary = require("../config/cloudinary");
const { isValidEmail, isValidPhone, isValidDate, isValidGender, isValidUUID, sanitizeString } = require("../helpers/validators");

const extractSessionId = (token) => {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString()
    );
    return payload.session_id ?? null;
  } catch {
    return null;
  }
};

const normalizeRole = (role) =>
  role === "doctor" || role === "patient" ? role : null;

const userController = {
  upsertProfile: async (req, res) => {
    const { phoneNumber, dateOfBirth, gender, role } = req.body;
    const fullName = sanitizeString(req.body.fullName, 100);
    const userRole = normalizeRole(role);

    if (!fullName || !phoneNumber || !dateOfBirth || !gender || !userRole) {
      return res.status(400).json({ error: "Complete profile information is required." });
    }
    if (!isValidPhone(phoneNumber)) {
      return res.status(400).json({ error: "Invalid phone number format. Use 7-15 digits, optionally prefixed with +." });
    }
    if (!isValidDate(dateOfBirth)) {
      return res.status(400).json({ error: "Invalid date of birth. Use YYYY-MM-DD format, must not be in the future." });
    }
    if (!isValidGender(gender)) {
      return res.status(400).json({ error: "Invalid gender. Allowed: male, female, other, prefer_not_to_say." });
    }

    try {
      const supabase = getSupabaseClient();
      const { data: existing, error: lookupError } = await supabase
        .from("users")
        .select("role")
        .eq("id", req.authUser.id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing && existing.role !== userRole) {
        return res.status(409).json({ error: "Account role cannot be changed after registration." });
      }

      const { data, error } = await supabase
        .from("users")
        .upsert(
          {
            id: req.authUser.id,
            email: req.authUser.email,
            phone_number: phoneNumber,
            full_name: fullName,
            date_of_birth: dateOfBirth,
            gender: gender.toLowerCase(),
            role: userRole,
            email_verified: Boolean(req.authUser.email_confirmed_at),
            phone_verified: Boolean(req.authUser.phone_confirmed_at),
          },
          { onConflict: "id" }
        )
        .select()
        .single();

      if (error) throw error;
      return res.json({ success: true, user: data });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  me: async (req, res) => {
    try {
      const { data, error } = await getSupabaseClient()
        .from("users")
        .select("*, patients(*), doctors(*)")
        .eq("id", req.authUser.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const patientData = Array.isArray(data.patients)
          ? (data.patients.length > 0 ? data.patients[0] : null)
          : data.patients;
        if (patientData) {
          data.blood_group = patientData.blood_group;
          data.emergency_contact_name = patientData.emergency_contact_name;
          data.emergency_contact_phone = patientData.emergency_contact_phone;
        }
      }

      return res.json({ success: true, user: data });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  syncEmail: async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    try {
      const supabase = getSupabaseClient();

      // Check for duplicate email
      const { data: existingUser, error: dupError } = await supabase
        .from("users")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .neq("id", req.authUser.id)
        .maybeSingle();
      if (dupError) throw dupError;
      if (existingUser) {
        return res.status(409).json({ error: "This email is already associated with another account." });
      }

      const { data, error } = await supabase
        .from("users")
        .update({
          email: email.toLowerCase().trim(),
          email_verified: true,
        })
        .eq("id", req.authUser.id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ success: true, user: data });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  getUserDevices: async (req, res) => {
    const userId = req.authUser.id;
    const token = req.accessToken;
    const currentSessionId = extractSessionId(token);

    if (!currentSessionId) {
      return res.status(400).json({ error: "Invalid session." });
    }

    try {
      const supabase = getSupabaseClient();
      const { data: devices, error } = await supabase
        .from("user_devices")
        .select("id, device_name, last_active_at, session_id, created_at")
        .eq("user_id", userId)
        .is("revoked_at", null);

      if (error) throw error;

      // Compute is_current and sort
      const formattedDevices = (devices || []).map(device => ({
        id: device.id,
        device_name: device.device_name,
        last_active_at: device.last_active_at,
        created_at: device.created_at,
        is_current: device.session_id === currentSessionId,
      }));

      // Sort: is_current first, then last_active_at desc
      formattedDevices.sort((a, b) => {
        if (a.is_current) return -1;
        if (b.is_current) return 1;
        return new Date(b.last_active_at) - new Date(a.last_active_at);
      });

      return res.json({ success: true, devices: formattedDevices });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  deleteUserDevice: async (req, res) => {
    const { id } = req.params;
    const userId = req.authUser.id;
    const token = req.accessToken;
    const currentSessionId = extractSessionId(token);

    if (!id) {
      return res.status(400).json({ error: "Device ID is required." });
    }
    if (!isValidUUID(id)) {
      return res.status(400).json({ error: "Invalid device ID format." });
    }

    try {
      const supabase = getSupabaseClient();
      
      // Look up the device first to verify ownership and session_id
      const { data: device, error: lookupError } = await supabase
        .from("user_devices")
        .select("session_id, user_id")
        .eq("id", id)
        .is("revoked_at", null)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!device) {
        return res.status(404).json({ error: "Device not found." });
      }

      // Check ownership
      if (device.user_id !== userId) {
        return res.status(403).json({ error: "Unauthorized operation." });
      }

      // Prevent deleting own current device session
      if (device.session_id === currentSessionId) {
        return res.status(400).json({ error: "Cannot log out of your current device session here." });
      }

      // Soft-delete (revoke) the device row
      const { error: deleteError } = await supabase
        .from("user_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId) // extra safety
        .is("revoked_at", null);

      if (deleteError) throw deleteError;

      return res.json({ success: true, message: "Device session revoked." });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  logoutOtherDevices: async (req, res) => {
    const userId = req.authUser.id;
    const token = req.accessToken;
    const currentSessionId = extractSessionId(token);

    if (!currentSessionId) {
      return res.status(400).json({ error: "Invalid session." });
    }

    try {
      const supabase = getSupabaseClient();
      
      const { data: revokedRows, error: deleteError } = await supabase
        .from("user_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId)
        .neq("session_id", currentSessionId)
        .is("revoked_at", null)
        .select("id");

      if (deleteError) throw deleteError;

      return res.json({ success: true, count: revokedRows?.length || 0 });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  deleteAccount: async (req, res) => {
    const userId = req.authUser.id;
    const email = req.authUser.email;
    const { password, confirmText } = req.body;

    if (confirmText !== "DELETE") {
      return res.status(400).json({ error: "Invalid confirmation text. Must type DELETE." });
    }

    if (!password || typeof password !== "string" || password.length > 128) {
      return res.status(400).json({ error: "Password is required and must be under 128 characters." });
    }

    try {
      const supabase = getSupabaseClient();

      // 1. Verify password via signInWithPassword (identity verification gate)
      // Use a temporary client to prevent polluting the global service-role client instance's auth state.
      const { createClient } = require("@supabase/supabase-js");
      const supabaseUrl = process.env.SUPABASE_URL;
      const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
      const tempSupabase = createClient(supabaseUrl, secretKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      const { error: signInError } = await tempSupabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        return res.status(401).json({ error: "Incorrect password" });
      }

      // 2. Fetch profile photo public ID from users
      const { data: userProfile, error: profileError } = await supabase
        .from("users")
        .select("profile_photo_public_id")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        console.error("Delete Account: failed to fetch profile photo ID:", profileError);
      }

      // 3. Fetch patient files if user is a patient
      let patientFiles = [];
      const { data: filesData, error: filesError } = await supabase
        .from("patient_files")
        .select("public_id, mime_type")
        .eq("patient_id", userId);

      if (filesError) {
        console.error("Delete Account: failed to fetch patient files:", filesError);
      } else {
        patientFiles = filesData || [];
      }

      // 4. Cloudinary Deletions (MUST happen before deleteUser cascade removes database rows)
      
      // Delete profile photo if exists (unsigned/public upload type)
      if (userProfile?.profile_photo_public_id) {
        try {
          await cloudinary.uploader.destroy(userProfile.profile_photo_public_id, {
            type: "upload",
            resource_type: "image",
          });
        } catch (photoDestroyError) {
          console.error("Delete Account: failed to delete profile photo on Cloudinary:", photoDestroyError);
        }
      }

      // Delete patient files if any exist (authenticated upload type)
      for (const file of patientFiles) {
        if (file.public_id) {
          try {
            const isImage = file.mime_type !== "application/pdf";
            await cloudinary.uploader.destroy(file.public_id, {
              type: "authenticated",
              resource_type: isImage ? "image" : "raw",
            });
          } catch (fileDestroyError) {
            console.error(`Delete Account: failed to delete file ${file.public_id} on Cloudinary:`, fileDestroyError);
          }
        }
      }

      // 6. Delete Supabase Auth user (this cascades to users row and all other role-dependent DB rows automatically)
      const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteUserError) {
        console.error("Delete Account: failed to delete user from Supabase auth:", deleteUserError);
        throw new Error(`Failed to delete authentication user: ${deleteUserError.message}`);
      }

      return res.json({ success: true, message: "Account deleted successfully." });
    } catch (error) {
      console.error("Account deletion failed:", error);
      return res.status(500).json({ error: error.message || "An unexpected error occurred during account deletion." });
    }
  },

  updatePushToken: async (req, res) => {
    let { device_id, push_token } = req.body;
    const userId = req.user.userId;

    if (!device_id) {
      return res.status(400).json({ error: "device_id is required." });
    }
    if (!push_token || typeof push_token !== "string" || push_token.trim() === "") {
      return res.status(400).json({ error: "push_token is required and must be a non-empty string." });
    }
    if (push_token.length > 500) {
      return res.status(400).json({ error: "push_token exceeds maximum length of 500 characters." });
    }

    device_id = sanitizeString(device_id, 255);
    push_token = push_token.trim();

    try {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from("user_devices")
        .update({ push_token, last_active_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("device_id", device_id)
        .is("revoked_at", null)
        .select("id");

      if (error) throw error;

      if (!data || data.length === 0) {
        return res.status(404).json({ error: "Device not found or session revoked." });
      }

      return res.json({ success: true, message: "Push token updated." });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
};

module.exports = userController;
