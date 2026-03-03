import { Router, Request, Response, NextFunction } from 'express';
import { AdminDashboardService } from '../services/admin-dashboard-service';
import { logger } from '../utils/logger';
import { Pool } from 'pg';

export function createAdminRoutes(dbPool: Pool): Router {
  const router = Router();
  const adminService = new AdminDashboardService(dbPool);
  const ADMIN_ID = 'admin';

  // ---- Auth Middleware ----
  const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      next();
      return;
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token !== adminPassword) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };

  // ---- Login (no auth required) ----
  router.post('/auth/login', (req: Request, res: Response): void => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });
      return;
    }
    if (password !== adminPassword) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    res.json({ success: true, token: adminPassword });
  });

  // Apply auth to all routes below
  router.use(requireAuth);

  // ---- Dashboard Stats ----
  router.get('/stats', async (req: Request, res: Response) => {
    try {
      const stats = await adminService.getSystemStats();
      res.json(stats);
    } catch (error: any) {
      logger.error('Error fetching stats', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ---- Users ----
  router.get('/users', async (req: Request, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.search) filters.search = req.query.search;
      if (req.query.tier) filters.tier = req.query.tier;
      if (req.query.isActive !== undefined) filters.isActive = req.query.isActive === 'true';

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const users = await adminService.getUserList(filters, limit, offset);
      res.json(users);
    } catch (error: any) {
      logger.error('Error fetching users', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/users/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await adminService.getUserAccount(req.params.id);
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/users/:id', async (req: Request, res: Response) => {
    try {
      const { assistantProfileId, tier, isActive, isLocked } = req.body;
      const userId = req.params.id;

      if (assistantProfileId !== undefined) {
        await adminService.assignProfileToUser(ADMIN_ID, userId, assistantProfileId);
      }
      if (tier !== undefined) {
        await adminService.changeUserTier(ADMIN_ID, userId, tier);
      }
      if (isActive !== undefined) {
        await adminService.toggleUserActive(ADMIN_ID, userId, isActive);
      }
      if (isLocked !== undefined) {
        await adminService.toggleUserLock(ADMIN_ID, userId, isLocked);
      }

      const user = await adminService.getUserAccount(userId);
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---- Agents (Assistant Profiles) ----
  router.get('/agents', async (req: Request, res: Response) => {
    try {
      const agents = await adminService.getProfileList();
      res.json(agents);
    } catch (error: any) {
      logger.error('Error fetching agents', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/agents', async (req: Request, res: Response) => {
    try {
      const agent = await adminService.createAssistantProfile(ADMIN_ID, req.body);
      res.status(201).json(agent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/agents/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const agent = await adminService.getProfile(req.params.id);
      if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
      res.json(agent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/agents/:id', async (req: Request, res: Response) => {
    try {
      const agent = await adminService.updateAssistantProfile(ADMIN_ID, req.params.id, req.body);
      res.json(agent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/agents/:id', async (req: Request, res: Response) => {
    try {
      await adminService.deleteProfile(ADMIN_ID, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---- Subscription Tiers ----
  router.get('/tiers', async (req: Request, res: Response) => {
    try {
      const tiers = await adminService.getTierList();
      res.json(tiers);
    } catch (error: any) {
      logger.error('Error fetching tiers', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/tiers', async (req: Request, res: Response) => {
    try {
      const tier = await adminService.createTier(ADMIN_ID, req.body);
      res.status(201).json(tier);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/tiers/:id', async (req: Request, res: Response) => {
    try {
      const tier = await adminService.updateTier(ADMIN_ID, req.params.id, req.body);
      res.json(tier);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/tiers/:id', async (req: Request, res: Response) => {
    try {
      await adminService.deleteTier(ADMIN_ID, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---- Security Settings ----
  router.get('/security-settings', async (req: Request, res: Response) => {
    try {
      const result = await dbPool.query(
        "SELECT value FROM system_settings WHERE key = 'security_settings'"
      );
      if (result.rows.length > 0) {
        res.json(typeof result.rows[0].value === 'string' ? JSON.parse(result.rows[0].value) : result.rows[0].value);
      } else {
        res.json({
          sessionTimeout: { standard: 480, high: 120, maximum: 30 },
          inactivityThreshold: { standard: 60, high: 30, maximum: 15 },
          reauthRequired: { afterInactivity: true, afterTimeout: true, afterFailedAttempts: 3, dailyReauth: false },
          passcode: { length: 6, expiryMinutes: 10, maxAttempts: 3, cooldownMinutes: 15 },
        });
      }
    } catch (error: any) {
      logger.error('Error fetching security settings', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/security-settings', async (req: Request, res: Response) => {
    try {
      const settings = req.body;
      await dbPool.query(
        `INSERT INTO system_settings (key, value, description, updated_at)
         VALUES ('security_settings', $1, 'Security and session configuration', NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify(settings)]
      );
      await adminService.getAdminActionLog(); // touch to verify pool works
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Error saving security settings', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // ---- Admin Action Log ----
  router.get('/logs', async (req: Request, res: Response) => {
    try {
      const filters: any = {};
      if (req.query.action) filters.action = req.query.action;
      if (req.query.targetUserId) filters.targetUserId = req.query.targetUserId;
      const limit = parseInt(req.query.limit as string) || 100;

      const logs = await adminService.getAdminActionLog(filters, limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
