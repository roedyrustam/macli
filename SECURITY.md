# Security Policy

## Supported Versions

Only the latest minor release of `@roedyrustam/macli` receives security updates.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in **Macli**, please **do not** open a public GitHub issue.

1. Use [GitHub Security Advisories](https://github.com/roedyrustam/macli/security/advisories/new) to report the vulnerability privately.
2. Include a clear description, steps to reproduce, potential impact, and any suggested remediation.
3. We aim to acknowledge reports within 48 hours and provide a fix timeline after triage.

## Operational Security Guidelines

Because `macli` provides native OS execution and file-system tools to autonomous agents:

- **Terminal & File Access (`bash_executor`, `file_writer`)**: Run `macli` only in trusted project directories or isolated containers/sandboxes. Review prompts carefully before running tasks that modify files or execute shell commands.
- **API Keys & Secrets (`.env`)**: Never commit `.env` or `.env.local` files to version control. Use `.env.example` as a template and rotate `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` immediately if exposed.
- **External MCP Servers (`claude_desktop_config.json`)**: Only connect to trusted Model Context Protocol (MCP) servers, as MCP tools run locally via `stdio` with the current user's environment permissions.
