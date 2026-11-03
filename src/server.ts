import { server } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    // Listen on the http.Server that Socket.IO is attached to (see app.ts);
    // app.listen() would create a second server with no websocket support.
    server.listen(env.port, () => {
      console.log(
        `CRM API running on http://localhost:${env.port}`
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);

    process.exit(1);
  }
};

startServer();