import { Router } from 'express';
import * as controller from '../modules/offers/offers.controller.js';
import * as quarantineController from '../modules/quarantine/quarantine.controller.js';
import * as sourcesController from '../modules/sources/sources.controller.js';
import * as discoveryController from '../modules/discovery/discovery.controller.js';
import * as apifyWebhookController from '../modules/webhooks/apify-webhook.controller.js';
import * as paymentController from '../modules/payment/payment.controller.js';
import * as authController from '../modules/auth/auth.controller.js';
import * as cardsController from '../modules/cards/cards.controller.js';
import * as walletController from '../modules/wallet/wallet.controller.js';
import * as merchantsController from '../modules/merchants/merchants.controller.js';
import * as checkoutController from '../modules/checkout/checkout.controller.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/validate-request.js';

const router = Router();

router.get('/health', controller.health);

router.get('/offers', controller.listOffers);
router.get('/offers/search', controller.searchOffers);
router.get('/offers/fresh', controller.getFreshOffers);
router.get('/offers/by-merchant/:merchant', controller.getOffersByMerchant);
router.get('/offers/by-bank/:bank', controller.getOffersByBank);
router.get('/offers/by-card/:card', controller.getOffersByCard);
router.get('/offers/:id', controller.getOffer);

router.get('/quarantine', quarantineController.listQuarantine);
router.get('/quarantine/stats', quarantineController.getQuarantineStats);
router.get('/quarantine/:id', quarantineController.getQuarantineRecord);
router.post('/quarantine/:id/promote', quarantineController.promoteQuarantine);
router.post('/quarantine/:id/reject', quarantineController.rejectQuarantine);
router.post('/quarantine/:id/replay', quarantineController.replayQuarantine);

router.get('/discovery/candidates', discoveryController.listDiscoveryCandidates);

router.post('/webhooks/apify', apifyWebhookController.handleApifyWebhook);

router.get('/sources', sourcesController.listSources);
router.get('/sources/approved', sourcesController.listApproved);
router.get('/sources/probation', sourcesController.listProbation);
router.get('/sources/rejected', sourcesController.listRejected);
router.get('/sources/health/dashboard', sourcesController.getDashboard);
router.post('/sources/validate', sourcesController.validateSources);
router.get('/sources/:id/health', sourcesController.getHealth);
router.post('/sources/:id/status', sourcesController.updateStatus);
router.get('/sources/:id', sourcesController.getSource);

router.post('/ingestion/runs', controller.createIngestionRun);
router.get('/ingestion/runs/:id', controller.getIngestionRunById);

// Auth
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// Card products catalog
router.get('/cards/products', cardsController.listProducts);

// Merchants
router.post('/merchants', merchantsController.register);
router.get('/merchants', merchantsController.list);

// Wallet (authenticated)
router.get('/wallet/instruments', requireAuth, walletController.getInstruments);
router.post('/wallet/cards', requireAuth, walletController.addCard);
router.delete('/wallet/cards/:id', requireAuth, walletController.removeCard);
router.post('/wallet/coupons', requireAuth, walletController.addCoupon);
router.delete('/wallet/coupons/:id', requireAuth, walletController.removeCoupon);
router.put('/wallet/loyalty', requireAuth, walletController.setLoyalty);
router.put('/wallet/membership', requireAuth, walletController.setMembership);
router.post('/wallet/banks', requireAuth, walletController.addBank);
router.delete('/wallet/banks/:id', requireAuth, walletController.removeBank);

// Checkout sessions
router.post('/checkout/sessions', requireAuth, checkoutController.createSession);
router.get('/checkout/sessions/:id/recommend', requireAuth, checkoutController.getRecommend);
router.patch('/checkout/sessions/:id/instruments', requireAuth, checkoutController.patchInstruments);
router.post('/checkout/sessions/:id/confirm', requireAuth, checkoutController.confirmSession);
router.get('/checkout/production-status', checkoutController.getProductionStatus);

// Payment recommendation — normalization + rules engine + AI
router.post('/payment/recommend', paymentController.recommend);
router.get('/payment/health', paymentController.paymentHealth);

router.use(errorHandler);

export default router;
