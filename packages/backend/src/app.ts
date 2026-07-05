import express from 'express';
import { setupMiddleware } from './middleware/setup.js';
import { registerRoutes } from './routes/register.js';

const app: express.Application = express();
setupMiddleware(app);
registerRoutes(app);

export default app;
