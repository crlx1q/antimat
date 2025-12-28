const admin = require('firebase-admin');

let initialized = false;

function initIfNeeded() {
  if (initialized && admin.apps.length) return;

  const {
    project_id,
    client_email,
    private_key,
    private_key_id,
    client_id,
    auth_uri,
    token_uri,
    auth_provider_x509_cert_url,
    client_x509_cert_url,
    universe_domain,
  } = process.env;

  if (project_id && client_email && private_key) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: project_id,
        clientEmail: client_email,
        privateKey: private_key.replace(/\\n/g, '\n'),
        privateKeyId: private_key_id,
        clientId: client_id,
        authUri: auth_uri,
        tokenUri: token_uri,
        authProviderX509CertUrl: auth_provider_x509_cert_url,
        clientX509CertUrl: client_x509_cert_url,
        universeDomain: universe_domain,
      }),
    });
    initialized = true;
  } else {
    console.warn('[FCM] Service account env vars are missing; FCM disabled');
  }
}

function isFcmReady() {
  initIfNeeded();
  return admin.apps.length > 0;
}

function getMessaging() {
  if (!isFcmReady()) return null;
  return admin.messaging();
}

async function sendPushToTokens(tokens, notification = {}, data = {}) {
  const messaging = getMessaging();
  if (!messaging || !tokens || !tokens.length) return null;

  const message = {
    notification,
    data: Object.fromEntries(
      Object.entries(data || {}).map(([k, v]) => [k, v?.toString() ?? ''])
    ),
    tokens,
  };

  return messaging.sendEachForMulticast(message);
}

async function sendPresencePush(groupId, userId, options = {}) {
  try {
    const Group = require('../models/Group');
    const User = require('../models/User');

    const group = await Group.findById(groupId).populate('members.user', 'fcmToken');
    if (!group) return;

    // Compute status
    const user = await User.findById(userId);
    if (!user) return;

    const status = computeUserStatus(user, {
      recordingOverride: options.recordingOverride ?? null,
      lastSeenOverride: options.lastSeenOverride ?? null,
    });

    // Get tokens of all members except the user who triggered the change
    const tokens = group.members
      .filter(m => m.user && m.user._id.toString() !== userId && m.user.fcmToken)
      .map(m => m.user.fcmToken);

    if (tokens.length === 0) return;

    await sendPushToTokens(tokens, {}, {
      type: 'presence',
      groupId: groupId,
      userId: userId,
      status: status,
    });

    console.log(`[FCM] Sent presence push: user=${userId}, status=${status}, group=${groupId}`);
  } catch (error) {
    console.error('[FCM] sendPresencePush error:', error);
  }
}

function computeUserStatus(user, { recordingOverride = null, lastSeenOverride = null } = {}) {
  const ONLINE_THRESHOLD_MS = 120000; // 2 minutes
  const now = Date.now();
  const lastSeenTime = lastSeenOverride
    ? new Date(lastSeenOverride).getTime()
    : (user.lastSeen ? user.lastSeen.getTime() : 0);
  const isRecent = now - lastSeenTime < ONLINE_THRESHOLD_MS;
  const recording = recordingOverride !== null ? recordingOverride : user.isRecording;
  
  if (recording && isRecent) return 'recording';
  if (isRecent) return 'online';
  return 'offline';
}

module.exports = { getMessaging, isFcmReady, sendPushToTokens, sendPresencePush, computeUserStatus };
