# BLUEPRINT.md

## 🏗️ Arsitektur Inti macli

`macli` menggunakan pendekatan hybrid untuk AI Swarm Orchestration:

1. **Skill Loader (`src/core/skillLoader.ts`)**
   Bertugas memindai direktori lokal untuk file `SKILL.md` ala Antigravity dan membaca konfigurasi `claude_desktop_config.json` untuk mendeteksi ketersediaan server Model Context Protocol (MCP) dari ekosistem Claude.

2. **MCP Client Manager (`src/core/mcpClient.ts`)**
   Menggunakan SDK resmi `@modelcontextprotocol/sdk` untuk membuka komunikasi 2-arah (melalui `stdio`) dengan server MCP eksternal, sehingga tools dari Claude bisa digunakan langsung oleh agen Gemini dalam `macli`.

3. **Swarm Director (`src/core/swarmDirector.ts`)**
   Mesin pendorong utamanya (berbasis Gemini 1.5 Pro). Membungkus semua skill lokal dan skill eksternal (MCP) menggunakan *Dynamic Tools Binding* LangChain. Sistem beroperasi menggunakan paradigma **ReAct (Reasoning & Acting)**, yang memungkinkan AI mengeksekusi banyak tool secara berurutan hingga tugas selesai.

4. **CLI Entrypoint (`src/index.ts`)**
   Menerapkan *Commander.js*, *ora*, dan *picocolors* untuk menyajikan UI interaktif (spinner) dan menerima task/perintah langsung dari user.

## 🚀 Alur Eksekusi (ReAct Loop)

1. User mengeksekusi `macli run "Lakukan riset web dan catat"`.
2. Sistem me-load SKILL.md lokal.
3. Sistem mendeteksi `claude_desktop_config.json` dan mem-*boot* semua MCP Server.
4. Gemini 1.5 Pro menyatukan tools lokal dan MCP.
5. Loop ReAct Berjalan: AI berpikir -> memanggil tool -> mendapatkan JSON result -> berpikir lagi.
6. Proses selesai, AI mengembalikan konklusi akhir.
