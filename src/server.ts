import app from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    app.listen(env.port, () => {
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