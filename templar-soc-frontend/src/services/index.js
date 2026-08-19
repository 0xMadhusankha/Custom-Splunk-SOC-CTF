/* ============================================================
   ANIMUS 1.0 — TEMPLAR SOC — service singleton
   ------------------------------------------------------------
   Swap this one line to go live:
     import { RealSplunkService } from './realSplunkService.js';
     export const service = new RealSplunkService({ baseUrl, token });
   The entire UI depends only on the SplunkService contract, so no
   screen changes when the backend is connected.
   ============================================================ */

import { MockSplunkService } from './mockSplunkService.js';

export const service = new MockSplunkService();
