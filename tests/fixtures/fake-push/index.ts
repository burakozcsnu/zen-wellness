// TEST-ONLY stand-in for a browser push service (Apple/Google): accepts every notification.
// Deployed to the zen-test project by scripts/deploy-test-functions.js so reminder deliveries can succeed without real devices.
Deno.serve(() => new Response(null, { status: 201 }));
