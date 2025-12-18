# CTM Phone Embed User Guide

This guide walks through configuring, running, and embedding the CallTrackingMetrics (CTM) phone demo contained in this repository.

## 1. Prerequisites
- **Node.js 18+** (for the Fastify server and EJS views)
- **CTM API credentials**: account-level API Token, Secret, and Account ID.
- Optional but recommended for local development: a trusted HTTPS certificate (`localhost.pem` and `localhost-key.pem`). The app will auto-enable HTTPS when these files exist.

## 2. Configure environment variables
Set the following environment variables before starting the app:

```bash
export CTM_TOKEN="your-ctm-api-key"
export CTM_SECRET="your-ctm-api-secret"
export CTM_ACCOUNT_ID="your-ctm-account-id"
export CTM_HOST="app.calltrackingmetrics.com"
```

> Windows users can use `set VAR=value` (Command Prompt) or `$env:VAR="value"` (PowerShell).

## 3. Install dependencies
From the repository root:

```bash
npm install
```

## 4. (Optional) Generate local HTTPS certs
To run the demo over HTTPS with a trusted local certificate, install [mkcert](https://github.com/FiloSottile/mkcert) and generate certs:

```bash
mkcert -install
mkcert localhost
```

Place the generated `localhost.pem` and `localhost-key.pem` files in the project root. The server will automatically enable HTTPS when they are present.

## 5. Start the demo
Launch the Fastify server:

```bash
npm run dev
```

The app starts at **https://localhost:8001** and serves multiple example pages:
- `/` – Combined CRM + dialer demo using the CTM web component APIs.
- `/phone` – Embeds CTM phone logic while rendering a custom dialer UI.
- `/device` – Hosts the CTM device page that carries the voice call.
- `/agent-status` – Shows agent status controls and events.
- `/dialer-only` – Minimal outbound dialer UI.

A basic login form (`/login`) sets demo cookies; adjust authentication for production.

## 6. Embedding the CTM phone in your app
1. **Load the CTM scripts** (replace `<%= ctm_host %>` with your CTM host or `app.calltrackingmetrics.com`):
   ```html
   <script src="https://<%= ctm_host %>/ctm-phone-embed-1.0.js"></script>
   <script src="https://<%= ctm_host %>/ctm-phone-device-1.0.js"></script>
   ```
2. **Render the embed component** and point the `access` attribute to a server endpoint that returns a CTM access token:
   ```html
   <ctm-phone-embed access="/api/ctm_access"></ctm-phone-embed>
   ```
3. **Host the device page** when using the `ctm-phone-device-1.0.js` script. The demo serves `/device` with `<ctm-device-embed></ctm-device-embed>` to maintain the live call connection.
4. **Style the component** like any other web element. Example:
   ```css
   ctm-phone-embed {
     height: 750px;
     width: 450px;
     display: block;
     box-shadow: 0 1px 8px #ccc;
   }
   ```

## 7. Implement the access-token endpoint
The phone web component makes a POST request to your server endpoint (e.g., `/api/ctm_access`). The endpoint must:

1. Receive JSON with `email`, `first_name`, `last_name`, and `session_id` for the current user.
2. Forward that payload to the CTM Access API:
   ```
   POST https://app.calltrackingmetrics.com/api/v1/accounts/{accountId}/phone_access
   ```
   Authenticate with HTTP Basic Auth using your CTM token and secret.
3. Proxy the CTM response back to the client, including `sessionId`, `email`, `first_name`, and `last_name` in camelCase where applicable.

The demo implements this flow in `index.mjs` and exposes it at `/api/ctm_access`.

## 8. Client-side SDK usage
After the scripts load, you can listen to events and invoke methods on the phone component:

```js
document.addEventListener('DOMContentLoaded', () => {
  const phone = document.getElementById('phone');

  phone.addEventListener('ctm:ready', (e) => {
    console.log('Agent ready', e.detail.agent);
  });

  phone.addEventListener('ctm:status', (e) => {
    console.log('Status changed', e.detail.status);
  });

  document.querySelectorAll('.call-button').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const number = e.currentTarget.getAttribute('href').replace('tel:', '');
      phone.call(number);
    });
  });
});
```

### Common methods
- `call(number)` – start a call to the E.164-formatted number.
- `hangup()` – end the current call.
- `hold()` – toggle hold for connected participants.
- `mute()` – toggle agent mute.
- `transfer({ what: 'receiving_number', dial: 'number' })` – transfer the active call.
- `add({ what: 'receiving_number', dial: 'number' })` – add a participant.

### Common events
- `ctm:ready` – component connected and ready.
- `ctm:status` – agent status changed.
- `ctm:live-activity` – call or chat is active.
- `ctm:incomingCall` – incoming call detected.
- `ctm:connecting`, `ctm:start`, `ctm:failed` – call lifecycle events.
- `ctm:recording_start` / `ctm:recording_stop` – recording state changes.
- `ctm:wrapup_start` / `ctm:wrapup_end` – wrap-up lifecycle.
- `ctm:access_denied` – access token expired or invalid.
- `ctm:device_registered` – device registration complete.
- `ctm:task_*` – task assignment and lifecycle events.

## 9. Customizing the demo
- Update the EJS views in `views/` to tailor layouts (`phone.ejs`, `device.ejs`, `agent_status.ejs`, etc.).
- Adjust authentication and session handling in `index.mjs` for your production requirements.
- Swap `CTM_HOST` if you are pointing to a different CTM environment.

## 10. Troubleshooting tips
- Ensure your browser trusts the local certificate if you enable HTTPS.
- Confirm environment variables are set before starting the server; missing credentials will prevent token retrieval.
- Watch the server logs for `>>> Proxying` and `Requesting token from CTM...` messages to trace access-token calls.
