import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

const start = async () => {
  try {
    await app.listen({
      port: env.PORT,
      host: "0.0.0.0"
    });

    app.log.info({ port: env.PORT }, "API iniciada");
  } catch (error) {
    app.log.error({ err: error }, "Falha ao iniciar API");
    process.exit(1);
  }
};

void start();
