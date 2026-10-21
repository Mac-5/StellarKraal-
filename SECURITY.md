# Security Policy

## Supported Versions

Only the latest release on the `main` branch receives security fixes. Older branches are not patched.

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ |
| Older branches | ❌ |

---

## Scope of the Program

This policy covers security vulnerabilities in the StellarKraal codebase and its deployed services.

### In Scope

| Component | Examples |
|---|---|
| **Backend API** | Authentication bypass, authorization flaws, SQL injection, command injection, insecure direct object references, sensitive data exposure, race conditions |
| **Frontend (Next.js)** | XSS, CSRF, session fixation, sensitive data leakage in client-side code or localStorage |
| **Soroban Smart Contract** | On-chain logic vulnerabilities, integer overflow/underflow, access control bypass, reentrancy, unauthorized admin actions, fund drain |
| **Infrastructure** | Exposed secrets in configuration, insecure TLS, open ports, weak IAM policies |
| **Dependencies** | Transitive dependencies with an actively exploitable vulnerability and a realistic attack path |

### Out of Scope

The following are **not** eligible for reports under this policy:

- Vulnerabilities in third-party services (Stellar network protocol, Soroban runtime, AWS managed services, Freighter wallet)
- Issues requiring physical access to infrastructure
- Social engineering attacks against team members
- Denial-of-service attacks against the `testnet` deployment
- Findings from automated scanners without a demonstrated impact or proof-of-concept
- Missing security headers on non-sensitive static assets (e.g., images, fonts)
- Rate limiting on public, non-authenticated endpoints
- Self-XSS requiring full control of the victim's browser
- Vulnerabilities already publicly known and reported (CVEs without a new exploit vector)
- Issues in outdated browser versions or unsupported operating systems

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities. Public disclosure before a fix is deployed may put users at risk.**

We ask that you follow responsible disclosure and give us the opportunity to address the issue before making it public.

### Preferred: GitHub Private Advisory

Use [GitHub's private vulnerability reporting](https://github.com/teslims2/StellarKraal-/security/advisories/new) to submit a report confidentially. This is the fastest path to triage and ensures coordinated disclosure.

### Alternative: Email

Send a report to **security@stellarkraal.example.com** with the subject line: `[SECURITY] <brief description>`.

Include in your report:

- **Summary**: A concise description of the vulnerability and its potential impact.
- **Steps to reproduce**: Detailed reproduction steps or a proof-of-concept (PoC).
- **Affected component(s)**: Backend API, frontend, smart contract, infrastructure, or a dependency.
- **Severity estimate**: Your assessment of the impact (Critical, High, Medium, Low).
- **Suggested mitigation** (optional): If you have a proposed fix or workaround.

### Encrypted Reports (PGP)

If you prefer to encrypt your report, contact **security@stellarkraal.example.com** to request our PGP public key. We will reply with the key and fingerprint for verification. Do not send the vulnerability details until you have confirmed the correct key.

> **Note:** PGP-encrypted reports are welcome but not required. GitHub Private Advisories provide end-to-end confidentiality without requiring key exchange.

---

## Response Timeline

We are committed to handling reports promptly. The following timelines are targets, not guarantees.

| Milestone | Target |
|-----------|--------|
| **Acknowledgment** | Within 48 hours of receipt |
| **Initial triage and severity assessment** | Within 7 business days |
| **Fix or mitigation** | Within 30 days for Critical/High severity |
| **Fix or mitigation** | Best-effort for Medium/Low severity |
| **Public disclosure** | Coordinated with reporter after the fix is deployed |

We will keep you informed of progress throughout the process. If you have not received an acknowledgment within 48 hours, please follow up via email. Our team is small, and reports may occasionally be missed.

If a fix requires more time than the above targets (e.g., due to complexity of the smart contract upgrade process), we will communicate an updated timeline and work with you to agree on a disclosure date.

---

## Severity Classification

We classify vulnerabilities using the following framework:

| Severity | Description | Examples |
|---|---|---|
| **Critical** | Direct loss of funds, complete authentication bypass, unauthorized admin access to the smart contract | Admin key compromise, contract exploit enabling fund drain |
| **High** | Significant data exposure, privilege escalation, ability to manipulate loan or collateral records | IDOR exposing all user loans, JWT forgery |
| **Medium** | Partial data exposure, non-critical feature bypass, denial-of-service on specific endpoints | Insecure direct object reference for own records only, XSS with limited impact |
| **Low** | Minor information disclosure, missing security hardening | Verbose error messages exposing stack traces, missing CSP headers |

---

## Safe Harbour Statement

> **Maintainer note:** This safe harbour statement has been reviewed and approved by the project maintainer. Any material changes to this statement must be reviewed before merging.

We consider security research conducted in good faith to be a valuable contribution to the security of StellarKraal. To encourage responsible disclosure, we commit to the following:

- We will **not pursue civil or criminal action** against researchers who discover and report vulnerabilities in accordance with this policy.
- We will **not suspend or terminate** any accounts used for research, provided the research did not cause harm to users or the protocol.
- We will **work with you** to understand and resolve the issue before public disclosure.
- We ask that you:
  - **Do not access, modify, or delete** user data beyond what is necessary to demonstrate the vulnerability.
  - **Do not disrupt** the production service or perform attacks that affect availability for real users. Use the testnet deployment for testing.
  - **Do not exploit** a vulnerability for personal gain or to harm users.
  - **Notify us promptly** if you inadvertently access data you did not intend to access.

This safe harbour does not apply to actions that violate applicable law beyond what is strictly necessary to demonstrate the vulnerability.

---

## Bug Bounty

There is currently **no paid bug bounty program**. We do publicly acknowledge researchers who responsibly disclose valid vulnerabilities — with their permission — in our `CHANGELOG.md` and release notes.

---

## Disclosure Policy

We follow **coordinated disclosure**:

1. Reporter submits the vulnerability privately.
2. We acknowledge receipt and begin triage.
3. We develop and test a fix.
4. We deploy the fix to production.
5. We agree on a disclosure date with the reporter (typically 7–14 days after deployment).
6. The vulnerability is disclosed publicly via a GitHub Security Advisory and `CHANGELOG.md` entry.

Please allow us the response timeline above before publishing your findings. If we are unable to reach an agreement on a disclosure timeline, we ask that you give us at least 90 days from the date of the initial report before public disclosure.

---

## Security Practices

The following practices are in place to protect the StellarKraal codebase:

- **Dependabot** monitors `backend/`, `frontend/`, and `contracts/stellarkraal/` weekly for vulnerable dependencies. See [docs/guides/dependabot.md](docs/guides/dependabot.md).
- **npm audit** runs every Monday via the [`npm-audit`](.github/workflows/npm-audit.yml) workflow and also on every pull request targeting `main`. It audits `backend/` and `frontend/` in separate steps and fails the build on any `high` or `critical` severity finding. When the workflow fails, follow the [Dependabot triage guide](docs/guides/dependabot.md) to assess and remediate the finding before merging.
- **Secret scanning** via Gitleaks and GitHub's push protection prevents acc
