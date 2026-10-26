# Security

LabelForge is a demonstration-grade annotation workbench. This document describes the controls that exist, the risks that remain, and how to report a problem. It is not a certification, audit, or compliance statement.

## Reporting

Email devtechedge@gmail.com with a description, reproduction steps, and affected URL. Do not include production database credentials or dataset contents. Allow reasonable time for a fix before public disclosure.

## Authentication and sessions

Passwords are hashed with Node's scrypt using a random salt. Session tokens are 32 random bytes stored only as SHA-256 hashes. The session cookie is HTTP-only, SameSite=Lax, and Secure in production. Sessions expire after seven days and can be revoked. Login, signup, invitation acceptance, and demo sign-in are rate limited in PostgreSQL by IP and email or user.

There is no email verification and no password reset flow. An attacker who knows a password can sign in. The public demo intentionally publishes demo credentials, so it must not contain confidential data.

## Authorization

Every workspace, project, task, annotation, review, release, import, and audit query resolves membership server side. Workspace IDs and task IDs supplied by a browser are never accepted as proof of membership. Cross-tenant requests return not found. Roles are OWNER, MANAGER, REVIEWER, and ANNOTATOR. The owner controls membership and deletion. Managers administer projects, imports, assignments, and releases. Reviewers decide reviews and adjudicate. Annotators can edit only their own assigned work. Server services recheck permissions inside transactions.

## Request protection

Mutating API routes require a same-origin Origin header. Server actions use the framework's origin protections. JSON bodies and uploads are bounded. CSV and JSONL parsing enforces file size, row count, field count, field length, nesting depth, and record size limits. Uploaded filenames are sanitized for display. Source content is rendered as text, never as HTML, SQL, shell, or template code.

## Data and exports

Imported records are stored as normalized JSON in PostgreSQL. Raw source files are not retained after import preview. Preview staging rows are deleted after expiry by scheduled opportunistic cleanup. Releases are immutable snapshots. CSV export quotes cells and prefixes text that begins with =, +, -, @, tab, or carriage return to reduce spreadsheet formula execution. JSONL is the canonical machine-readable representation. The manifest carries SHA-256 checksums for both forms and the export route verifies them before responding.

## Secrets

Secrets live in Vercel environment variables and are not committed. The application does not log dataset contents, passwords, session tokens, invitation tokens, or full connection strings. Database backups are managed by the hosting provider. `.env` and `.env.test` are ignored by Git.

## Demo-specific risk

The public demo is writable. Anyone with a documented demo identity can create projects, import synthetic data, annotate, review, publish releases, and change settings. Demo data is synthetic and may be reset by the operator. Do not put personal, confidential, or regulated data into the demo. The production and preview Vercel environments currently share the demo database; this is an accepted condition for the isolated demo, not a multi-tenant production pattern.

## Residual risk and limits

There is no email delivery, so invitation links are displayed once and shared manually. There is no account recovery, MFA, organization SSO, object storage, antivirus scanning, WAF, or dedicated audit export. Rate limiting is best-effort inside the application and does not replace provider-level protection. Agreement metrics are descriptive statistics, not a quality guarantee. Error messages are designed not to expose record contents, but operators should review logs before sharing them.

## Out of scope

Do not use this deployment for protected health information, payment card data, government identifiers, or regulated decision-making. Do not attempt to run untrusted uploaded code; the product does not execute uploaded content.
