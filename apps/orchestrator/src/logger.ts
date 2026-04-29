import pino from "pino";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import { config } from "./config";

export const logger = pino({
  name: config.serviceName,
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => {
    const runIdHeader = req.headers["x-run-id"];
    if (typeof runIdHeader === "string" && runIdHeader.length > 0) {
      return runIdHeader;
    }
    return randomUUID();
  }
});
