// TEST-ONLY stand-in for a browser push service (Apple/Google): answers 201, except a path ending /gone (410, subscription expired) or /fail (500).
// Deployed to the zen-test project by scripts/deploy-test-functions.js so reminder deliveries can succeed without real devices.
Deno.serve(request => {
    const path = new URL(request.url).pathname;
    return new Response(null, { status: path.endsWith('/gone') ? 410 : path.endsWith('/fail') ? 500 : 201 });
});
