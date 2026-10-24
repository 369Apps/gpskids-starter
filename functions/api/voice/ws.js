// Same-origin voice socket. The browser connects here. The provider secret never leaves the server.
import { proxyVoice } from "../../../lib/provider.js";
export async function onRequest(context) { return proxyVoice(context.request, context.env); }
