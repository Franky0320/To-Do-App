import { createApp } from './app.js';
import { InMemoryStore } from './db/store.js';

const port = Number(process.env.PORT ?? 3000);
const server = createApp(new InMemoryStore());
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
