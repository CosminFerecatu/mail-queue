import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  handleClickRedirect,
  handleOpenTracking,
  getTrackingPixel,
} from '../services/tracking.service.js';
import { logger } from '../lib/logger.js';

const ClickParamsSchema = z.object({
  shortCode: z.string().min(1).max(20),
});

const OpenParamsSchema = z.object({
  trackingId: z.string().min(1),
});

export const trackingRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Click tracking redirect
  // Public endpoint - no authentication required
  app.get(
    '/c/:shortCode',
    async (request, reply) => {
      const paramsResult = ClickParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_TRACKING_CODE',
            message: 'Invalid tracking code',
          },
        });
      }

      const { shortCode } = paramsResult.data;

      // Get client info for tracking
      const userAgent = request.headers['user-agent'];
      const ipAddress =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        request.ip;

      try {
        const originalUrl = await handleClickRedirect(shortCode, userAgent, ipAddress);

        if (!originalUrl) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'LINK_NOT_FOUND',
              message: 'Tracking link not found',
            },
          });
        }

        // Redirect to original URL
        return reply.redirect(originalUrl);
      } catch (error) {
        logger.error({ error, shortCode }, 'Error handling click redirect');

        // On error, return a generic error page
        return reply.status(500).send({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to process redirect',
          },
        });
      }
    }
  );

  // Open tracking pixel
  // Public endpoint - no authentication required
  app.get(
    '/t/:trackingId/open.gif',
    async (request, reply) => {
      const paramsResult = OpenParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        // Still return pixel even on error to avoid broken images
        return reply
          .header('Content-Type', 'image/gif')
          .header('Cache-Control', 'no-cache, no-store, must-revalidate')
          .header('Pragma', 'no-cache')
          .header('Expires', '0')
          .send(getTrackingPixel());
      }

      const { trackingId } = paramsResult.data;

      // Get client info for tracking
      const userAgent = request.headers['user-agent'];
      const ipAddress =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        request.ip;

      try {
        // Record the open event asynchronously (don't wait)
        handleOpenTracking(trackingId, userAgent, ipAddress).catch((error) => {
          logger.error({ error, trackingId }, 'Error recording open tracking event');
        });
      } catch (error) {
        // Log but don't fail - always return the pixel
        logger.error({ error, trackingId }, 'Error handling open tracking');
      }

      // Always return the tracking pixel
      return reply
        .header('Content-Type', 'image/gif')
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .send(getTrackingPixel());
    }
  );

  // Alternative open tracking endpoint (just /t/:trackingId)
  app.get(
    '/t/:trackingId',
    async (request, reply) => {
      const paramsResult = OpenParamsSchema.safeParse(request.params);

      if (!paramsResult.success) {
        return reply
          .header('Content-Type', 'image/gif')
          .header('Cache-Control', 'no-cache, no-store, must-revalidate')
          .send(getTrackingPixel());
      }

      const { trackingId } = paramsResult.data;

      const userAgent = request.headers['user-agent'];
      const ipAddress =
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        request.ip;

      try {
        handleOpenTracking(trackingId, userAgent, ipAddress).catch((error) => {
          logger.error({ error, trackingId }, 'Error recording open tracking event');
        });
      } catch (error) {
        logger.error({ error, trackingId }, 'Error handling open tracking');
      }

      return reply
        .header('Content-Type', 'image/gif')
        .header('Cache-Control', 'no-cache, no-store, must-revalidate')
        .header('Pragma', 'no-cache')
        .header('Expires', '0')
        .send(getTrackingPixel());
    }
  );
};
