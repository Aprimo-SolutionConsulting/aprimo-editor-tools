# Aprimo Editor Tools

A Next.js application for connecting to Aprimo using PKCE authentication and working with your DAM environment.

> **This is a community-supported project and is not officially maintained or supported by Aprimo.**

## Tools

### Bulk Upload

Upload assets to Aprimo with metadata in bulk.

- Drag-and-drop or browse to select multiple files
- Define shared fields whose values apply to every asset in the batch
- Override fields per asset where values differ
- Supports text, multi-line text, date, and classification field types
- Tracks upload progress and reports per-asset success or failure

### My Basket

Renders the contents of an Aprimo basket. Triggered via Aprimo page hook — the basket ID is passed as a query parameter and the page fetches and displays basket items. Use this as a starting point for building custom contact sheets or for exporting basket contents to Excel.

### My Item

Displays a single Aprimo record. Triggered via Aprimo page hook — the record ID is passed as a query parameter.

### Excel Import

Import metadata from an Excel file into Aprimo records.

- Upload an `.xlsx` / `.xls` file and select which columns to map
- Map Excel columns to Aprimo field definitions (auto-matched by name)
- Map classification values from the spreadsheet to Aprimo classifications
- Choose the target language for localized field values
- Saves to Aprimo using `records.update()` with built-in rate-limit handling

## Data Flow

1. **Pagehook trigger** — The Aprimo UI sends a page hook POST to the Webhook Endpoint containing the action name and one or more record IDs.
2. **Store basket** — For multi-record actions the Webhook Endpoint stores the record list in the Basket Datastore (Supabase) and generates a short-lived `requestId` handle.
3. **Redirect** — The webhook returns the Editor Tools URL with the handle (or record ID for single-item mode). Aprimo opens that URL in the user's browser.
4. **Retrieve basket** — The Editor Tools page fetches the record list from the Basket Datastore using the `requestId`, then deletes the row.
5. **PKCE auth** — Editor Tools authenticates the user against the Aprimo User Interface via PKCE OAuth / SSO before making any API calls.

## Framework

### Authentication

Connects to Aprimo using the PKCE OAuth flow via the [Aprimo JS SDK](https://github.com/Aprimo-Connect/aprimo-js). Credentials are stored in `localStorage` after first use.

Connection can be pre-configured via environment variables so the modal is skipped entirely:

```
NEXT_PUBLIC_APRIMO_ENVIRONMENT=yourcompany
NEXT_PUBLIC_APRIMO_CLIENT_ID=your-client-id
NEXT_PUBLIC_APRIMO_CLIENT_SECRET=your-client-secret
```

If any variable is missing the app falls back to the connection modal.

### Webhook / Page Hook endpoint

`POST /api/webhook` receives page hook calls from Aprimo and redirects to the appropriate page. Actions are configured in `app/api/webhook/actions.json`:

```json
{
  "mybasket": "https://your-deployment.vercel.app/my-basket",
  "myitem":   "https://your-deployment.vercel.app/my-item"
}
```

The action name in Aprimo maps to a key in that file. The record or basket ID is forwarded as a query parameter.

## Getting Started

### 1. Set up Supabase

The My Basket flow stores temporary record lists in Supabase.

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase SQL editor, run the schema from [`supabase/create_requested_records.sql`](supabase/create_requested_records.sql) to create the `requested_records` table.
3. Copy your project URL and anon key from **Project Settings → API**.

### 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the values:

```
# Supabase (required for My Basket)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Aprimo (optional — can also be entered via the in-app Connect modal)
NEXT_PUBLIC_APRIMO_ENVIRONMENT=yourcompany
NEXT_PUBLIC_APRIMO_CLIENT_ID=your-client-id
NEXT_PUBLIC_APRIMO_CLIENT_SECRET=your-client-secret
```

### 3. Install and run

```
npm install
npm run dev
```

### 4. Connect to Aprimo

This app requires a **PKCE OAuth registration** in your Aprimo environment.

1. In Aprimo, go to **Settings → Registrations** and create a new registration with the following settings:
   - **Grant type:** Authorization Code with PKCE
   - **Redirect URI:** `https://<your-site>.vercel.app/oauth/callback` (or `http://localhost:3000/oauth/callback` for local development)
2. Note the **Client ID** and **Client Secret** from the registration.
3. Open the app and click **Connect**, then enter your environment subdomain, Client ID, and Client Secret — or set the `NEXT_PUBLIC_APRIMO_*` environment variables above to skip the modal.

### 5. Register page hooks (optional)

To enable the My Basket and My Item flows, register page hooks in Aprimo pointing to `/api/webhook`. Add your action-to-URL mappings in [`app/api/webhook/actions.json`](app/api/webhook/actions.json).

### 6. Set up action definitions and menus in Aprimo (optional)

To wire up a page hook action in Aprimo, create an action definition using the Aprimo settings UI or API. Use the following structure as a template:

```json
{
  "name": "<action name>",
  "type": "pageHook",
  "translationKey": "<translation key>",
  "conditions": [],
  "parameters": {
    "sendToken": "none",
    "url": "https://<your-site>.vercel.app/api/webhook?action=<action>",
    "location": "New",
    "timeout": 30,
    "httpMethod": "POST"
  }
}
```

- **`name`** — matches the key in `actions.json` (e.g. `mybasket`, `myitem`)
- **`url`** — the full URL to your deployed app's `/api/webhook` endpoint with the `action` query parameter
- **`translationKey`** — the label shown in Aprimo menus

**Webhook modes**

By default the webhook expects multiple record IDs, stores them in Supabase, and returns a handle (`requestId`) to the destination page. For actions that pass only a single record (e.g. My Item), append `&mode=singleitem` to the URL — the record ID is forwarded directly without a Supabase round-trip:

```
# Multi-record (default) — stores record list and returns a handle
url: https://<your-site>.vercel.app/api/webhook?action=mybasket

# Single-record — passes the record ID directly
url: https://<your-site>.vercel.app/api/webhook?action=myitem&mode=singleitem
```

Once the action definition is created, add it to the appropriate Aprimo menu so users can trigger it from the basket or record view. Each menu entry references the action by name:

```json
{
  "name": "<action name>",
  "type": "action"
}
```

## Reference

### Data Flow

![Data Flow](public/images/data-flow.png)
