# 🚀 Macli - Enterprise AI Agent Swarm Orchestrator

[![NPM Version](https://img.shields.io/npm/v/@roedyrustam/macli.svg)](https://www.npmjs.com/package/@roedyrustam/macli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Macli** adalah kerangka kerja (*framework*) berbasis CLI untuk mengorkestrasi ekosistem **Multi-Agent Swarm** yang sangat *powerful*. Dibangun dengan teknologi **LangGraph**, **Gemini 1.5 Pro**, dan mendukung **Claude Model Context Protocol (MCP)** secara *native*.

Dengan Macli, komputer Anda bertransformasi menjadi agen *AI Software Engineer* tingkat lanjut yang setara dengan Devin, OpenHands, atau OpenClaw.

---

## ✨ Fitur Utama

- 🧠 **LangGraph ReAct Memory**: Bukan sekadar chatbot biasa. Macli mengingat state (*memory*) antar eksekusi dan mengeksekusi multi-step reasoning secara rekursif hingga tugas selesai.
- 💻 **Built-in OS Tools (Native)**: Agen memiliki akses *built-in* ke terminal (`bash_executor`), membaca file (`file_reader`), dan memanipulasi kode sumber (`file_writer`). Ia bisa langsung coding dan mengeksekusi script di mesin Anda!
- 🔌 **Claude MCP Integration**: Secara otomatis mendeteksi dan memuat konfigurasi *Claude Desktop* (`claude_desktop_config.json`), memungkinkan Gemini menggunakan *tools* ekosistem Claude (seperti SQLite, GitHub, AWS, dll).
- 🛠️ **Antigravity Skills**: Kembangkan keahlian agen Anda tanpa batas dengan meletakkan instruksi di dalam file `SKILL.md`. AI akan secara otomatis membedah niat (*intent*) dan parameter (*schema*) secara cerdas berkat implementasi `DynamicStructuredTool`.
- 🎩 **Setup Wizard Interaktif**: Inisialisasi mudah hanya dengan satu perintah.

---

## 📦 Instalasi

Anda bisa menginstal `macli` secara global menggunakan NPM:

```bash
npm install -g @roedyrustam/macli
```
*(Catatan: pastikan Anda menggunakan versi Node.js >= 18).*

---

## ⚙️ Inisialisasi (Wajib!)

Sebelum menggunakan agen, jalankan konfigurasi otomatis:

```bash
macli init
```
Sistem akan meminta **Google Gemini API Key** Anda dengan aman dan menyimpan konfigurasinya ke dalam file `.env`.

---

## 🎯 Cara Penggunaan

Gunakan perintah `run` dan berikan tugas (prompt) apa pun kepada *Swarm* Anda:

```bash
macli run "Cari tahu masalah di file index.ts, lalu perbaiki bug-nya!"
```

Atau berikan agen kemampuan kustom dari direktori lain:
```bash
macli run "Deploy aplikasi ini ke Vercel" --dir ./my-custom-skills
```

### Opsi CLI Lengkap
- `-d, --dir <path>`: Tentukan folder tempat `SKILL.md` (Antigravity Skills) disimpan.
- `-c, --claude-config <path>`: Jika file `claude_desktop_config.json` Anda berada di tempat yang tidak standar, definisikan di sini.

---

## 🏗️ Arsitektur Inti

Dibuat untuk stabilitas tingkat enterprise:
- **Node.js & TypeScript** (Strict Mode)
- **@langchain/langgraph** (State Graph Orchestration)
- **@langchain/google-genai** (LLM Engine)
- **@modelcontextprotocol/sdk** (Claude MCP Standard Transport)
- **Zod** (Strict Parameter Extraction)

Penjelasan teknis mendalam dapat dibaca di [BLUEPRINT.md](./BLUEPRINT.md).

---

## ⚠️ Peringatan Keamanan

Karena `macli` dilengkapi dengan `bash_executor` dan `file_writer` *native*, agen **bisa mengubah atau menghapus file sistem Anda**. Harap berhati-hati saat memberikan prompt destruktif (misalnya *"hapus semua file"*).

---

## 📄 Lisensi
[MIT License](./LICENSE) - Dikembangkan oleh Roedy Rustam.
