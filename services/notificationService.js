const { Expo } = require("expo-server-sdk");
const getSupabaseClient = require("../config/supabaseClient");

const expo = new Expo();

/**
 * Send a push notification to all active devices of a user.
 *
 * @param {string} userId - UUID of recipient user
 * @param {string} type - Notification type (e.g. 'access_granted', 'access_expired', 'test')
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} [data={}] - Custom payload object
 * @returns {Promise<{ success: boolean, notificationId?: string, status?: string, error?: string }>}
 */
async function sendPushNotification(userId, type, title, body, data = {}) {
  try {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();

    // 1. Fetch active (non-revoked) devices with non-null push tokens for this user
    const { data: devices, error: deviceError } = await supabase
      .from("user_devices")
      .select("id, device_id, push_token")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .not("push_token", "is", null);

    if (deviceError) {
      console.error("sendPushNotification: Error fetching user_devices:", deviceError);
    }

    const validDevices = (devices || []).filter(
      (d) => d.push_token && typeof d.push_token === "string" && d.push_token.trim() !== ""
    );

    // If no devices with push tokens exist, record failed notification record and return early
    if (!validDevices || validDevices.length === 0) {
      console.log(`sendPushNotification: No active push tokens found for user ${userId}`);
      try {
        await supabase.from("notifications").insert({
          user_id: userId,
          type,
          title,
          body,
          data,
          status: "failed",
          created_at: now,
        });
      } catch (insertFailErr) {
        console.error("sendPushNotification: Failed to log 'no token' failure in DB:", insertFailErr);
      }
      return { success: false, error: "No registered push tokens found for user." };
    }

    // 2. Insert notification record with status 'pending'
    let notificationId = null;
    try {
      const { data: notificationRecord, error: insertError } = await supabase
        .from("notifications")
        .insert({
          user_id: userId,
          type,
          title,
          body,
          data,
          status: "pending",
          created_at: now,
        })
        .select("id")
        .maybeSingle();

      if (insertError) {
        console.error("sendPushNotification: Error inserting pending notification:", insertError);
      } else {
        notificationId = notificationRecord?.id;
      }
    } catch (dbErr) {
      console.error("sendPushNotification: DB error creating pending notification row:", dbErr);
    }

    // 3. Prepare messages for Expo, validating push tokens with Expo.isExpoPushToken
    const messages = [];
    const deviceTokenMap = new Map(); // token -> device record

    for (const dev of validDevices) {
      const token = dev.push_token.trim();
      if (!Expo.isExpoPushToken(token)) {
        console.warn(`sendPushNotification: Invalid Expo push token skipped: "${token}" (device DB id: ${dev.id})`);
        continue;
      }
      deviceTokenMap.set(token, dev);
      messages.push({
        to: token,
        sound: "default",
        title,
        body,
        data: { ...data, type },
      });
    }

    if (messages.length === 0) {
      console.warn(`sendPushNotification: All push tokens for user ${userId} failed Expo.isExpoPushToken validation.`);
      if (notificationId) {
        await supabase
          .from("notifications")
          .update({ status: "failed" })
          .eq("id", notificationId);
      }
      return { success: false, error: "No valid Expo push tokens found for user." };
    }

    // 4. Send notifications in chunks using expo-server-sdk
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    let hasSuccess = false;

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (sendError) {
        console.error("sendPushNotification: Error sending chunk to Expo server:", sendError);
      }
    }

    // 5. Inspect tickets for results & handle DeviceNotRegistered errors
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const message = messages[i];
      const dev = message ? deviceTokenMap.get(message.to) : null;

      if (ticket.status === "ok") {
        hasSuccess = true;
      } else if (ticket.status === "error") {
        console.error(
          `sendPushNotification: Ticket error for token "${message?.to}":`,
          ticket.message,
          ticket.details
        );

        // Null out unregistered push tokens in user_devices
        if (ticket.details && ticket.details.error === "DeviceNotRegistered" && dev) {
          console.log(`sendPushNotification: Nulling out unregistered push_token for device ID ${dev.id}`);
          try {
            await supabase
              .from("user_devices")
              .update({ push_token: null })
              .eq("id", dev.id);
          } catch (nullifyErr) {
            console.error(`sendPushNotification: Failed to nullify dead push_token for device ${dev.id}:`, nullifyErr);
          }
        }
      }
    }

    // 6. Update notifications status in DB
    const finalStatus = hasSuccess ? "sent" : "failed";
    const updateData = { status: finalStatus };
    if (hasSuccess) {
      updateData.sent_at = new Date().toISOString();
    }

    if (notificationId) {
      try {
        await supabase
          .from("notifications")
          .update(updateData)
          .eq("id", notificationId);
      } catch (updateStatusErr) {
        console.error("sendPushNotification: Failed to update notification final status:", updateStatusErr);
      }
    }

    return {
      success: hasSuccess,
      notificationId,
      status: finalStatus,
    };
  } catch (error) {
    console.error("sendPushNotification: Uncaught error in notification service:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Helper to check whether a notification category is enabled in notification_preferences.
 * Defaults to true if no row exists or on lookup error.
 */
async function isNotificationEnabled(userId, category) {
  try {
    const supabase = getSupabaseClient();
    const { data: pref, error } = await supabase
      .from("notification_preferences")
      .select(category)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(`isNotificationEnabled: Error checking preferences for user ${userId}:`, error);
      return true;
    }

    if (!pref) return true;
    return pref[category] !== false;
  } catch (err) {
    console.error(`isNotificationEnabled: Exception checking preferences for user ${userId}:`, err);
    return true;
  }
}

/**
 * Asynchronously sends a push notification if the user's notification preferences allow it.
 * Non-blocking, fire-and-forget helper so main HTTP response flow is never delayed.
 */
function sendNotificationIfEnabled(userId, category, type, title, body, data = {}) {
  (async () => {
    try {
      const enabled = await isNotificationEnabled(userId, category);
      if (!enabled) {
        console.log(`sendNotificationIfEnabled: Push notification skipped for user ${userId} (category '${category}' is disabled).`);
        return;
      }
      await sendPushNotification(userId, type, title, body, data);
    } catch (err) {
      console.error(`sendNotificationIfEnabled: Uncaught error sending notification to user ${userId}:`, err);
    }
  })();
}

module.exports = {
  sendPushNotification,
  sendNotificationIfEnabled,
};
