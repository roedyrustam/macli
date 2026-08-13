<div align="center">
  <img src="file:///C:/Users/roedy/.gemini/antigravity-ide/brain/cc633113-4ff9-479c-a160-840f9510ad17/macli_logo_1786643321629.jpg" alt="Macli Logo" width="150" style="border-radius: 20px" />
  <h1>Macli: AI Agent Swarm Orchestrator</h1>
  <p><em>Turn your local skills into an autonomous intelligence swarm.</em></p>
</div>

---

## 🚀 Apa itu Macli?
**Macli** adalah alat bantu *Command Line Interface* (CLI) tangguh yang dirancang untuk menjadi "konduktor" (Swarm Director) bagi berbagai agen AI. Alat ini secara dinamis membaca dan mengubah skill-skill lokal Anda (baik format Antigravity `SKILL.md` maupun tool JSON Claude/MCP) menjadi kumpulan senjata yang bisa digunakan agen AI secara mandiri untuk menyelesaikan tugas.

## 🌟 Fitur Utama
- **Zero-Config Skill Loader:** Cukup arahkan `macli` ke folder yang berisi `SKILL.md` Anda. Ia akan membacanya secara otomatis.
- **Swarm Intelligence:** Didukung oleh **Gemini 1.5 Pro** dan **LangChain**, `macli` dapat memecah tugas Anda dan memilih skill yang tepat untuk dieksekusi.
- **Extensible:** Mendukung integrasi dengan tool Claude (berbasis JSON) maupun standar Antigravity.
- **Native TypeScript:** Aman, cepat, dan mudah dikembangkan lebih lanjut.

## 📦 Instalasi

Karena ini adalah rilis awal (berbasis repositori GitHub), Anda bisa melakukan instalasi global secara lokal:

```bash
git clone https://github.com/username/macli.git
cd macli
npm install
npm run build
npm link
```
*Catatan: Segera tersedia di registri NPM global!*

## ⚙️ Konfigurasi
Anda membutuhkan API Key dari Google Gemini untuk menghidupkan *Swarm Director*.

1. Buat file `.env` di folder root proyek (atau tempat Anda mengeksekusi).
2. Tambahkan baris berikut:
   ```env
   GOOGLE_API_KEY=your_gemini_api_key_here
   ```

## 🛠️ Cara Penggunaan

Gunakan perintah `run` dan berikan tugas (prompt) Anda:

```bash
macli run "Cari tahu stack teknologi aplikasi ini dan buatkan laporannya"
```

Anda juga bisa menentukan di mana `macli` harus mencari skill-nya (default: direktori saat ini):
```bash
macli run "Optimalkan performa web" --dir ./my-custom-skills
```

## 🏗️ Arsitektur
Dibuat dengan:
- **Node.js** & **TypeScript**
- **Commander.js** (Antarmuka CLI)
- **@langchain/core & google-genai** (Swarm Logic & Tool Binding)

Baca lebih detail di [BLUEPRINT.md](./BLUEPRINT.md).

## 📄 Lisensi
MIT License.
