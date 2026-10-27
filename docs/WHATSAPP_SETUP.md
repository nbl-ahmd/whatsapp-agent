# Connect a Meta WhatsApp test number

This is the shortest reliable path from a fresh Facebook developer account to a
working test number in this app: send, receive, templates, webhook and
diagnostics.

Meta's dashboard labels move occasionally. The values have kept the same names
for the Cloud API; use this as the map, not as a pixel-perfect screenshot.

---

## 0. What you need

- A Facebook account.
- A Meta developer app (free).
- A phone with WhatsApp installed for the recipient side.
- This app running, with the backend reachable over **public HTTPS** for the
  webhook. Production URLs work; locally use a tunnel (step 5).

> A test number is a real Meta-provided number. It can message up to **5
> recipient numbers** you add in the dashboard, and it does not need Business
> Verification or App Review for testing.

---

## 1. Create the Meta app

1. Open <https://developers.facebook.com/apps>.
2. **Create app** → choose **Business** (or “Other” → Business).
3. Give it a name, select a business portfolio if asked, and create it.
4. In the app dashboard, find **Add products** and add **WhatsApp**.

The WhatsApp product adds the **API Setup** and **Configuration** pages used
below.

---

## 2. Collect four values

Open **WhatsApp → API Setup** and copy these. Keep the page open; the token
expires.

| Value | Where it is | Used for |
| --- | --- | --- |
| **Phone number ID** | Under “From”, the test number row | Sending and receiving |
| **WhatsApp Business Account ID (WABA ID)** | “WhatsApp Business Account ID” | Templates, Flows, webhook subscription |
| **Access token** | “Temporary access token” | Graph API calls (24-hour lifetime) |
| **App secret** | **App settings → Basic → App secret** | Verifying webhook signatures |

Notes:

- The temporary token expires after **24 hours**. For a longer-lived local test,
  create a **System User** token in Meta Business Settings with the
  `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
  That is optional for the first test.
- Never commit the token or app secret. This app stores them encrypted in
  PostgreSQL and never returns them to the browser.

### Add your own WhatsApp number as a test recipient

In **API Setup**, use the **To** field / **Manage phone number list** to add the
phone you will message from. Meta sends a verification code to that phone.
Unlisted recipients fail with an error such as *recipient not in allowed list*.

---

## 3. Save the credentials in the app

1. Sign in as an **owner** or **admin**.
2. Go to **Settings → API credentials → WhatsApp / Meta**.
3. Paste:
   - **Access token** — the temporary token from step 2.
   - **App secret** — from App settings → Basic.
   - **Webhook verify token** — make up a long random value (for example
     `openssl rand -hex 24`). You will paste the same value into Meta later.
4. Keep Graph API version `v21.0` unless your app needs another version.
5. Press **Save credentials**.

The stored values win over `server/.env`; the environment remains the fallback.

---

## 4. Connect the test number

Stay on **Settings → WhatsApp**.

1. Paste the **WABA id** from step 2.
2. Paste the access token again in the connect form (optional if you just saved
   it; leaving it blank uses the stored token).
3. Press **Find numbers**. The app asks Meta for the numbers under that WABA.
4. Find the test number in the result and press **Connect**.

What this does:

- stores the WABA id on the account,
- reads the canonical display number and verified name from Meta (no typing),
- stores the token at organization level (encrypted) if you pasted one,
- adds the number to **Connected numbers**.

For a second number under the same WABA, repeat step 4; the app reuses the same
account instead of failing.

---

## 5. Expose the backend and connect the webhook

Meta pushes inbound messages to the **backend** (Express), never to the Vercel
frontend.

### Production

Your callback URL is:

```text
https://<your-api-domain>/api/webhooks/whatsapp
```

The Settings page shows the exact URL it derives from the current request; use
the copy button.

### Local development

Meta requires HTTPS, so expose port 4000:

```bash
cloudflared tunnel --url http://localhost:4000
# or
ngrok http 4000
```

Use the generated HTTPS URL plus `/api/webhooks/whatsapp` as the callback URL.

### In Meta

1. Go to **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL**: the URL above.
3. **Verify token**: the same value saved in Settings.
4. Press **Verify and save**. Meta calls `GET /api/webhooks/whatsapp`.
5. Under **Webhook fields**, subscribe to **messages**.
6. In this app, press **Subscribe app** on the Webhook card. This calls
   `POST /{WABA_ID}/subscribed_apps` so Meta delivers this WABA's events to your
   app.
7. Press **Test handshake** and then **Run diagnostics**.

The diagnostics panel checks the token, app secret, phone number, WABA,
template API, WABA subscription and the public handshake. It never prints the
token.

---

## 6. Send and receive

### Receive

From the recipient phone, message the Meta test number. Within a few seconds:

- **Inbox** shows a new conversation,
- **WhatsApp → Webhook → Events (24 h)** increments,
- the message row is stored with direction `inbound`.

If nothing arrives, run **Settings → WhatsApp → Run diagnostics** and read the
HTTP logs. Common causes are covered in troubleshooting.

### Send

There are three ways:

1. **WhatsApp → Send a test message** — text, image, document or template.
2. **Inbox** — reply in the conversation (text or attachment).
3. **Templates → Use** — pick an approved template and send it from the test
   sender.

For a brand-new test number, a normal text is accepted inside the 24-hour
customer service window. Business-initiated messages outside that window must
use an approved template.

### Simulator mode

If you do not have Meta credentials yet, add a **simulator number** from
Settings → WhatsApp → *Add a simulator number*. On the WhatsApp page you can
then use **Simulate an inbound message**. It goes through the real webhook
pipeline (contact, conversation, message, automation, AI) without calling Meta.
Simulator outbound messages are recorded locally only.

---

## 7. Templates

Go to **WhatsApp → Templates**.

1. Choose the number (the WABA comes from that number).
2. **New template**.
3. Name: lowercase letters, numbers and underscores, for example
   `order_update`.
4. Language: a Meta code such as `en_US`.
5. Category: `UTILITY` or `MARKETING` (test templates are usually `UTILITY`).
6. Header/footer optional. Body is required.
7. Variables:
   - positional: `Hi {{1}}, order {{2}} is ready`
   - named: `Hi {{first_name}}`
   - provide example values in the form; Meta requires them.
8. Buttons optional: quick reply, URL, phone, or a WhatsApp Flow.
9. **Submit for review**.

Meta reviews asynchronously. Status usually moves `PENDING → APPROVED` (or
`REJECTED` with a reason). Refresh the list. Approved templates are the only
ones the inbox offers.

Limits worth knowing:

- Test numbers can create templates, but approval depends on Meta's policy.
- An approved template can be edited only a limited number of times in 30 days.
- Deleting a template deletes its language variants with the same name.

---

## 8. Test the API directly

The UI uses the same endpoints. To prove the server-to-server path:

```bash
curl -X POST http://localhost:4000/api/whatsapp/messages \
  -H 'content-type: application/json' \
  -H 'x-test-api-key: <WHATSAPP_TEST_API_KEY>' \
  -d '{
    "organizationId": "<org id>",
    "phoneNumberId": "<meta phone number id>",
    "to": "<recipient in E.164 digits>",
    "text": "Hello from curl"
  }'
```

`WHATSAPP_TEST_API_KEY` is optional locally and required in production for this
unauthenticated path. Signed-in browser requests do not need it.

More endpoints:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/whatsapp/meta/discover` | List numbers under a WABA |
| `POST /api/whatsapp/meta/connect` | Connect one discovered number |
| `POST /api/whatsapp/diagnostics` | Full connection report |
| `POST /api/whatsapp/webhook-test` | Local/public handshake test |
| `POST /api/whatsapp/webhook/subscribe` | Subscribe the app to the WABA |
| `GET /api/whatsapp/webhook/subscription` | List subscribed apps |
| `POST /api/whatsapp/test-inbound` | Inject a simulator inbound message |
| `GET/POST /api/webhooks/whatsapp` | Meta verification and events |

Webhook deliveries are idempotent: a repeated Meta delivery does not duplicate a
message or an automation run.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| **Verify and save** fails with 403 | Verify token mismatch, wrong URL, or HTTP instead of HTTPS | Save the same verify token in Settings and Meta; use the backend public HTTPS URL |
| Webhook returns 401 | App secret does not match the payload signature | Copy **App secret** from App settings → Basic and save it again |
| Diagnostics says no app subscribed | WABA has no subscribed app | Press **Subscribe app**, or subscribe in Meta → Configuration |
| Events (24 h) stays 0 | Wrong WABA, `messages` field not subscribed, tunnel down, or webhook URL points at the frontend | Recheck steps 5 and the backend logs |
| Send fails with code 190/401 | Temporary token expired | Generate a new token (or a System User token) and save it |
| Send fails with 131030 | Recipient is not in the test list | Add the phone in API Setup → Manage phone number list |
| Send fails outside 24 h | Business-initiated text is not allowed | Use an approved template |
| Template list says “Add a WABA id” | Number was added manually without a WABA | Reconnect it from Settings → WhatsApp |
| Template create fails | Name/language/category/example invalid, or WABA/token mismatch | Fix the form; check diagnostics for WABA and template API |
| Inbound media 404 | Meta media ids expire | Ask the sender to resend; the proxy cannot fetch expired media |

Logs are JSON and redact secrets. Every response has an `x-request-id`; include
it when investigating a failure.

---

## 10. Go-live notes (not required for testing)

- Swap the temporary token for a **System User** token.
- Complete **Business Verification** and **App Review** only when you need
  production messaging limits and non-test recipients.
- Configure **Embedded Signup** later if clients should connect their own
  numbers (out of scope for the test-number phase).
- Keep `ENCRYPTION_KEY` stable and backed up: rotating it makes stored
  credentials unreadable.
