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

module.exports = { getMessaging, isFcmReady, sendPushToTokens };
