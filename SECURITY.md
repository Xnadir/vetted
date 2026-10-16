# Security policy

## Reporting a vulnerability

Please report security issues privately through
[GitHub security advisories](https://github.com/Xnadir/vetted/security/advisories/new)
rather than in a public issue. You'll get a response within a week.

In scope:

- A way to make `vet` miss a dangerous pattern it claims to detect, or to
  suppress its security findings from inside a scanned skill.
- Anything in this repo's skills, scripts, or workflows that could harm a user
  who installs or runs them.

## What `vet` is and isn't

`vet` is a static scanner. It catches common and careless patterns: download-
and-execute, hidden Unicode, prompt-injection phrasing, credential access,
exfiltration endpoints, and persistence. It can't prove a skill is safe, and a
determined attacker can write something it won't recognize. Read the scripts
of any skill you install, and treat a clean `vet` report as one signal, not a
guarantee.

New detection ideas and bypasses you find are welcome as issues once they are
not an active risk to users.
