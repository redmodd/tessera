# Security policy

## Supported versions

Tessera is pre-1.0. Only the latest published version of each package on npm receives security fixes:

- `tessera-learn`
- `create-tessera`

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report privately via GitHub's [private vulnerability reporting](https://github.com/redmodd/tessera/security/advisories/new), or email `derek.redmond@redmondelearning.ca` with the subject `[tessera security]`.

Please include:

- A description of the issue and its impact
- Steps to reproduce, or a proof-of-concept
- The affected package and version
- Any suggested mitigation, if you have one

You can expect an initial response within 5 business days. Once the issue is confirmed, we'll work with you on a fix and coordinated disclosure timeline.

## Scope

In scope:

- Code execution, data exposure, or score/completion tampering vectors in the published packages
- Supply chain issues (compromised release artifacts, dependency vulnerabilities affecting runtime behavior)

Out of scope:

- Vulnerabilities in third-party LMSes or LRSes — please report those to the upstream vendor
- Issues that require an attacker to already have write access to the course author's filesystem or LMS admin account
