# Microsoft Graph mail setup (for @affa.az)

Work accounts on Microsoft 365 normally have **app passwords disabled** and
**SMTP basic auth turned off**, so the app sends mail through the
**Microsoft Graph API** using an app registration (app-only / client
credentials). No mailbox password is ever stored.

This is a **one-time setup** done by a Microsoft 365 / Entra ID **admin**.

---

## What the admin needs to do

### 1. Register an application (Entra ID / Azure AD)
1. Go to https://entra.microsoft.com → **Identity → Applications → App registrations → New registration**.
2. Name: e.g. `AFFA Fantasy MailSender`. Account type: **Single tenant**. No redirect URI needed.
3. Click **Register**.
4. From the **Overview** page, copy:
   - **Application (client) ID** → `MS_CLIENT_ID`
   - **Directory (tenant) ID** → `MS_TENANT_ID`

### 2. Create a client secret
1. In the app → **Certificates & secrets → Client secrets → New client secret**.
2. Set an expiry (e.g. 12–24 months) and click **Add**.
3. Copy the secret **Value** immediately (it's shown only once) → `MS_CLIENT_SECRET`.

### 3. Grant the Mail.Send application permission
1. In the app → **API permissions → Add a permission → Microsoft Graph → Application permissions**.
2. Search and select **`Mail.Send`** → **Add permissions**.
3. Click **Grant admin consent for <tenant>** (this requires an admin).

### 4. Create the sender mailbox (if it doesn't exist)
Create the shared/no-reply mailbox the emails are sent from, e.g.
**`noreply@affa.az`** (Microsoft 365 admin center → Teams & groups → Shared
mailboxes, or a normal licensed mailbox). This becomes `MAIL_SENDER`.

### 5. (Recommended) Restrict the app to only that one mailbox
By default the `Mail.Send` application permission lets the app send as **any**
mailbox in the tenant. Lock it down with an **Application Access Policy** so it
can only send from the no-reply mailbox. In Exchange Online PowerShell:

```powershell
# Group containing the allowed sender mailbox(es)
New-DistributionGroup -Name "FantasyMailSenders" -Type Security -Members noreply@affa.az

New-ApplicationAccessPolicy `
  -AppId <MS_CLIENT_ID> `
  -PolicyScopeGroupId FantasyMailSenders@affa.az `
  -AccessRight RestrictAccess `
  -Description "Restrict AFFA Fantasy MailSender to the no-reply mailbox"

# Verify
Test-ApplicationAccessPolicy -Identity noreply@affa.az -AppId <MS_CLIENT_ID>
```

---

## Put the values in `.env`

```env
MAIL_PROVIDER=graph
MS_TENANT_ID=<Directory (tenant) ID>
MS_CLIENT_ID=<Application (client) ID>
MS_CLIENT_SECRET=<client secret VALUE>
MAIL_SENDER=noreply@affa.az
```

Restart the server. The **Parametrlər** tab shows **Poçt kanalı: Microsoft
Graph — hazırdır** when configured. Use **İndi göndər** to test.

---

## Copy-paste message for your admin

> Hi — for an internal tool that emails AFFA Fantasy data updates, I need an
> Entra ID **app registration** with the Microsoft Graph **`Mail.Send`**
> **application** permission (admin consent granted). Please also create a
> shared mailbox **noreply@affa.az** for it to send from, and ideally apply an
> **Application Access Policy** restricting the app to only that mailbox.
> Then send me the **Tenant ID**, **Client ID**, and a **Client secret**.
> Steps: https://learn.microsoft.com/graph/auth-v2-service

---

## Troubleshooting

| Error | Cause / fix |
| ----- | ----------- |
| `Graph token error: 401 invalid_client` | Wrong/expired `MS_CLIENT_SECRET`. Create a new secret. |
| `Graph token error: 400 ... AADSTS700016` | Wrong `MS_CLIENT_ID`/`MS_TENANT_ID`. |
| `sendMail failed (403) ... Access is denied` | `Mail.Send` not granted/consented, or the Application Access Policy blocks `MAIL_SENDER`. |
| `sendMail failed (404) ... not found` | `MAIL_SENDER` mailbox doesn't exist. |
