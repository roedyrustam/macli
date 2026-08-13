# Macli — Design & Skill Orchestration Blueprint

## 1. Ringkasan Pemahaman
- **Tujuan Utama:** Membangun `macli`, sebuah *Command Line Interface* (CLI) yang bertindak sebagai AI Agent Swarm.
- **Fungsi Utama:** Mengorkestrasi skill-skill dari Antigravity (`SKILL.md`) dan alat (tools) dari Claude (berbasis JSON/MCP).
- **Target Audiens:** Pengembang, Engineer AI, dan pengguna framework Antigravity yang ingin mengotomatisasi pekerjaan kompleks secara otonom.
- **Batasan (*Non-Goals*):** Tidak menjadi pengganti penuh IDE, melainkan bertindak sebagai asisten CLI yang menavigasi file lokal dan mengeksekusi *agentic loop*.

## 2. Arsitektur Teknis & Delegasi
- **CLI & Routing:** Menggunakan framework `commander` untuk *parsing* argumen dan opsi secara dinamis.
- **Core Runtime:** Node.js / TypeScript.
- **AI & LLM Engine:** Diorkestrasi menggunakan `@langchain/google-genai` (Gemini 1.5 Pro) dan ekosistem `@langchain/core` untuk manajemen state agent.
- **Skill Engine (Plugin System):** `skillLoader` memindai direktori yang dituju secara rekursif, membaca file, lalu mengonversi metadata skill menjadi standar `DynamicTool` LangChain.

## 3. Komponen & Alur Data
1. **User Input:** Menjalankan `macli run "<task>"`
2. **Skill Loading:** Sistem membaca direktori saat ini (`process.cwd()`) untuk menemukan modul skill.
3. **Agent Binding:** Skill diikat (*bind*) ke model AI (Gemini 1.5 Pro).
4. **Execution Loop:** AI melakukan pemikiran (reasoning), memilih tool yang tepat, dan mensimulasikan hasil sebelum memberikan jawaban final ke *stdout*.

## 4. Log Keputusan
| # | Keputusan | Alternatif Dipertimbangkan | Rasional & Prinsip Web Modern | Skill yang Diorkestrasikan |
|---|-----------|---------------------------|-------------------------------|----------------------------|
| 1 | Node.js + TS | Python + Native SDK | NPM sangat populer untuk alat bantu CLI developer dan TypeScript memberikan *type safety* yang kuat untuk arsitektur kompleks. | `senior-fullstack` |
| 2 | LangChain Core | Implementasi API HTTP manual | LangChain Core memiliki abstraksi Tool yang sudah teruji dan standar, memudahkan konversi `SKILL.md` menjadi alat yang bisa dieksekusi LLM. | `ai-llm-integration-expert` |
| 3 | Direktori Lokal (SKILL.md) | Database terpusat | Membaca dari *local filesystem* membuat alat ini 100% *portable* dan selaras dengan cara kerja plugin/skill Antigravity. | `file-upload-media-expert` |

## 5. Rencana Rilis & Publikasi
- **Distribusi:** Repositori publik GitHub.
- **Packaging:** *Publish* ke registri NPM agar pengguna dapat langsung menginstal via `npm install -g macli`.
- **Branding:** Logo unik telah dihasilkan, didesain dengan estetika siber yang mewakili *Swarm AI*.
