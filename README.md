# Ask Dipsan

A responsive, profile-grounded digital twin called Virtual Dipsan.
Visitors can ask about Dipsan's experience, research, projects, education,
technical skills, and personal interests.

## Run

1. Create an API key at [ollama.com/settings/keys](https://ollama.com/settings/keys).

2. Copy `.env.example` to `.env`, then replace the placeholder:

   ```env
   OLLAMA_API_KEY=your_private_key
   OLLAMA_BASE_URL=https://ollama.com
   OLLAMA_CHAT_MODEL=gpt-oss:20b
   OLLAMA_EMBEDDING_MODEL=
   PORT=3000
   ```

3. Install and start the app:

   ```bash
   npm install
   npm run dev
   ```

4. Visit [http://localhost:3000](http://localhost:3000).

The API key is used only by the Express backend. Never expose it in React code
or commit `.env`.

## How the RAG flow works

1. The resume and Dipsan's directly provided personal details are structured
   into focused sections in `knowledge/resume.md`.
2. Each question is ranked against the profile using lexical relevance and
   intent-aware boosts.
3. The four most relevant sections are supplied to Ollama Cloud.
4. `gpt-oss:20b` answers using only that retrieved context.
5. The answer streams to the browser, accompanied by the profile sections used
   as sources.

The cloud model and Ollama address can be overridden in `.env`.

## Deploy on Render

1. Push the project to a private GitHub repository.
2. In Render, create a Blueprint and select the repository. Render reads
   `render.yaml`.
3. Enter `OLLAMA_API_KEY` when prompted. Do not place the key in GitHub.
4. Deploy and open the generated `onrender.com` URL.

After deployment, the Express server and Ollama Cloud run independently of your
computer.

## Useful commands

```bash
npm run dev       # development server with hot reload
npm run check     # retrieval tests and production build
npm run build     # production frontend build
npm start         # serve the production build
```

The supplied PDF is image-based. On macOS, `npm run extract:resume` can OCR it again using the built-in Vision framework. The chatbot uses the reviewed and corrected `knowledge/resume.md`, not raw OCR output.

## Main files

- `src/App.jsx` — chat interface and streaming client
- `src/styles.css` — responsive visual system
- `server/index.js` — API, security controls, streaming, and static server
- `server/ollama.js` — authenticated Ollama Cloud streaming client
- `server/rag.js` — profile loading and intent-aware retrieval
- `knowledge/resume.md` — reviewed resume and user-provided profile knowledge
- `.env` — private local development configuration
