import { env } from "./env.js";

export const config = {
  port: env.PORT,
  jwtSecret: env.JWT_SECRET,
  corsOrigins: env.CORS_ORIGINS,
  mongoUrl: env.MONGO_URL,
  dbName: env.DB_NAME,
  demoMode: env.DEMO_MODE,
  nodeEnv: env.NODE_ENV,
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    priceId: env.STRIPE_PRICE_ID_PRO,
    priceIdEnterprise: env.STRIPE_PRICE_ID_ENTERPRISE,
    clientUrl: env.APP_BASE_URL,
  },
};
if (config.nodeEnv === "production" && config.demoMode) {
  throw new Error("DEMO_MODE cannot run in production");
}
