// Payments adapter. PayPal (Sandbox or live) when PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET are set,
// otherwise a clearly labelled simulation so the demo still works with no keys.
// To add Stripe later: write providers/payments/stripe.js with the same exports and pick it here.
import { paypalReady } from "../../config.js";
import * as paypal from "./paypal.js";
import * as simulated from "./simulated.js";

export const payments = paypalReady ? paypal : simulated;
export const isSimulated = () => payments === simulated;
export { simulated };
